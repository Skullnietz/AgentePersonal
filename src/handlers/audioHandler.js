const https = require('https');
const gemini = require('../services/geminiService');
const { formatError } = require('../utils/formatters');

async function handleAudio(bot, msg, routeTranscribedText) {
  const chatId = msg.chat.id;

  try {
    const audio = msg.voice || msg.audio;
    if (!audio) {
      return bot.sendMessage(chatId, formatError('No encontre audio en el mensaje.'));
    }

    if (audio.file_size && audio.file_size > getMaxAudioBytes()) {
      return bot.sendMessage(chatId, formatError('El audio es demasiado grande. Envia una nota de voz mas corta.'));
    }

    await bot.sendMessage(chatId, 'Procesando tu audio...');

    const fileLink = await bot.getFileLink(audio.file_id);
    const audioBuffer = await downloadFile(fileLink);
    const mimeType = getAudioMimeType(msg, fileLink);
    const result = await gemini.transcribeAudio(audioBuffer, mimeType, getAudioGlossary());
    const transcript = normalizeTranscript(result?.transcript || '');

    if (!transcript) {
      return bot.sendMessage(chatId, formatError('No pude transcribir el audio. Intenta con una nota mas clara o mas corta.'));
    }

    if (result?.needs_confirmation || transcript.length < 4) {
      return bot.sendMessage(chatId, `Entendi esto:\n"${transcript}"\n\nSi es correcto, reenviamelo como texto o con una nota de voz mas clara.`);
    }

    const transcribedMsg = {
      ...msg,
      text: transcript,
      voice: undefined,
      audio: undefined,
      _audioTranscript: {
        fileId: audio.file_id,
        confidence: result?.confidence ?? null,
        originalMimeType: mimeType,
      },
    };

    return routeTranscribedText(transcribedMsg);
  } catch (error) {
    console.error('Error en audioHandler:', error.message);
    return bot.sendMessage(chatId, formatError('No pude procesar tu audio. Intenta de nuevo.'));
  }
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function getAudioMimeType(msg, fileLink) {
  if (msg.audio?.mime_type) return msg.audio.mime_type;
  if (fileLink.endsWith('.mp3')) return 'audio/mpeg';
  if (fileLink.endsWith('.m4a')) return 'audio/mp4';
  if (fileLink.endsWith('.wav')) return 'audio/wav';
  return 'audio/ogg';
}

function getAudioGlossary() {
  const raw = process.env.AUDIO_GLOSSARY || '';
  return raw
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 80);
}

function normalizeTranscript(transcript) {
  let normalized = String(transcript || '').trim();
  const replacements = getTranscriptReplacements();

  for (const [from, to] of replacements) {
    normalized = normalized.replace(new RegExp(escapeRegExp(from), 'gi'), to);
  }

  return normalized.replace(/\s+/g, ' ').trim();
}

function getTranscriptReplacements() {
  const defaults = [
    ['coely', 'Coeli'],
    ['coeli admin', 'Coeli Admin'],
    ['irapuatoo', 'Irapuato'],
  ];

  const custom = parseCustomReplacements(process.env.AUDIO_TRANSCRIPT_REPLACEMENTS || '');
  return [...custom, ...defaults];
}

function parseCustomReplacements(raw) {
  return raw
    .split('|')
    .map((pair) => pair.split('=').map((value) => value.trim()))
    .filter(([from, to]) => from && to);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getMaxAudioBytes() {
  return Number(process.env.AUDIO_MAX_MB || 8) * 1024 * 1024;
}

module.exports = { handleAudio };
