const https = require('https');
const gemini = require('../services/geminiService');
const db = require('../services/dbService');
const { expensePrompt } = require('../prompts/expensePrompt');
const { validateExpense } = require('../utils/validators');
const { formatExpenseConfirmation, formatError } = require('../utils/formatters');

async function handlePhoto(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    await bot.sendMessage(chatId, '🔍 Analizando tu ticket...');

    // Get the highest resolution photo
    const photo = msg.photo[msg.photo.length - 1];
    const fileLink = await bot.getFileLink(photo.file_id);

    const imageBuffer = await downloadFile(fileLink);
    const mimeType = fileLink.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const photoPrompt = expensePrompt + '\n\nAnaliza la imagen del ticket/recibo adjunto. Extrae el total, comercio y fecha si son legibles.';
    const result = await gemini.analyzeImage(photoPrompt, imageBuffer, mimeType);
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
      inputType: 'photo',
      rawInput: `[foto: ${photo.file_id}]`,
      confidence: data.confidence,
    });

    await bot.sendMessage(chatId, formatExpenseConfirmation(data), { parse_mode: 'Markdown' });
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
