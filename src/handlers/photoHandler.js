const https = require('https');
const gemini = require('../services/geminiService');
const db = require('../services/dbService');
const { multiExpensePrompt } = require('../prompts/expensePrompt');
const { validateExpenses } = require('../utils/validators');
const { formatMultipleExpensesConfirmation, formatError } = require('../utils/formatters');

async function handlePhoto(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    await bot.sendMessage(chatId, '🔍 Analizando tu ticket...');

    const photo = msg.photo[msg.photo.length - 1];
    const fileLink = await bot.getFileLink(photo.file_id);
    const imageBuffer = await downloadFile(fileLink);
    const mimeType = fileLink.endsWith('.png') ? 'image/png' : 'image/jpeg';

    // Inyectar tarjetas del usuario
    const cards = await db.runQuery(
      'SELECT id, name, card_type, bank, last_four FROM cards WHERE user_id = ? AND is_active = TRUE',
      [userId]
    );
    const prompt = multiExpensePrompt.replace('{CARDS}', cards.length > 0 ? JSON.stringify(cards) : 'Sin tarjetas registradas')
      + '\n\nAnaliza la imagen adjunta. Si es un ticket, extrae el total. Si hay varios movimientos, extrae cada uno.';

    const result = await gemini.analyzeImage(prompt, imageBuffer, mimeType);
    const validation = validateExpenses(result);

    if (!validation.valid) {
      await bot.sendMessage(chatId, formatError(validation.error));
      return;
    }

    const expenses = validation.data;

    await db.saveExpenses(expenses.map((data) => ({
      userId,
      amount: data.amount,
      currency: data.currency,
      category: data.category,
      description: data.description,
      merchant: data.merchant,
      expenseDate: data.date,
      inputType: 'photo',
      rawInput: `[foto: ${photo.file_id}]`,
      confidence: data.confidence,
      cardId: data.card_id || null,
    })));

    await bot.sendMessage(chatId, formatMultipleExpensesConfirmation(expenses, cards), { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error en photoHandler:', error.message);
    await bot.sendMessage(chatId, formatError('No pude analizar la imagen. Asegúrate de que el ticket sea legible.'));
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

module.exports = { handlePhoto };
