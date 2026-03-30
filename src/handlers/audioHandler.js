const https = require('https');
const gemini = require('../services/geminiService');
const db = require('../services/dbService');
const { expensePrompt } = require('../prompts/expensePrompt');
const { validateExpense } = require('../utils/validators');
const { formatExpenseConfirmation, formatError } = require('../utils/formatters');

async function handleAudio(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    await bot.sendMessage(chatId, '🎤 Procesando tu mensaje de voz...');

    const voice = msg.voice;
    const fileLink = await bot.getFileLink(voice.file_id);

    const audioBuffer = await downloadFile(fileLink);

    const audioPrompt = expensePrompt + '\n\nEl usuario envió un mensaje de voz en español. Transcribe y analiza el audio para extraer la información del gasto.';
    const result = await gemini.analyzeAudio(audioPrompt, audioBuffer, 'audio/ogg');
    const validation = validateExpense(result);

    if (!validation.valid) {
      await bot.sendMessage(chatId, formatError(validation.error));
      return;
    }

    const data = validation.data;

    await db.saveExpense({
      userId,
      amount: data.amount,
      currency: data.currency,
      category: data.category,
      description: data.description,
      merchant: data.merchant,
      expenseDate: data.date,
      inputType: 'audio',
      rawInput: `[audio: ${voice.file_id}]`,
      confidence: data.confidence,
    });

    await bot.sendMessage(chatId, formatExpenseConfirmation(data), { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error en audioHandler:', error.message);
    await bot.sendMessage(chatId, formatError('No pude procesar tu mensaje de voz. Intenta de nuevo.'));
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

module.exports = { handleAudio };
