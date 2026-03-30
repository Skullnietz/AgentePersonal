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

    // Inyectar tarjetas del usuario
    const cards = await db.runQuery(
      'SELECT id, name, card_type, bank, last_four FROM cards WHERE user_id = ? AND is_active = TRUE',
      [userId]
    );
    const prompt = expensePrompt.replace('{CARDS}', cards.length > 0 ? JSON.stringify(cards) : 'Sin tarjetas registradas')
      + '\n\nEl usuario envió un mensaje de voz en español. Transcribe y analiza el audio para extraer la información del gasto.';

    const result = await gemini.analyzeAudio(prompt, audioBuffer, 'audio/ogg');
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
      cardId: data.card_id || null,
    });

    let cardName = null;
    if (data.card_id) {
      const card = cards.find(c => c.id === data.card_id);
      cardName = card ? card.name : null;
    }

    await bot.sendMessage(chatId, formatExpenseConfirmation(data, cardName), { parse_mode: 'Markdown' });
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
