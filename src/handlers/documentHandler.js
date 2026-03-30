const https = require('https');
const gemini = require('../services/geminiService');
const db = require('../services/dbService');
const { multiExpensePrompt } = require('../prompts/expensePrompt');
const { validateExpenses } = require('../utils/validators');
const { formatMultipleExpensesConfirmation, formatError } = require('../utils/formatters');

async function handleDocument(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const doc = msg.document;
  const mime = doc.mime_type || '';

  try {
    if (doc.file_size && doc.file_size > 10 * 1024 * 1024) {
      await bot.sendMessage(chatId, formatError('El archivo es demasiado grande. Máximo 10MB.'));
      return;
    }

    const isPDF = mime === 'application/pdf';
    const isImage = mime.startsWith('image/');

    if (!isPDF && !isImage) {
      await bot.sendMessage(chatId, formatError('Solo acepto archivos PDF o imágenes.'));
      return;
    }

    const emoji = isPDF ? '📄' : '🖼️';
    await bot.sendMessage(chatId, `${emoji} Analizando tu ${isPDF ? 'PDF' : 'imagen'}...`);

    const fileLink = await bot.getFileLink(doc.file_id);
    const fileBuffer = await downloadFile(fileLink);

    // Inyectar tarjetas del usuario
    const cards = await db.runQuery(
      'SELECT id, name, card_type, bank, last_four FROM cards WHERE user_id = ? AND is_active = TRUE',
      [userId]
    );
    const docPrompt = multiExpensePrompt.replace('{CARDS}', cards.length > 0 ? JSON.stringify(cards) : 'Sin tarjetas registradas')
      + '\n\nEl usuario envió un ' + (isPDF ? 'archivo PDF' : 'imagen')
      + ' de un ticket, recibo, factura o captura de movimientos de tarjeta.'
      + ' Si es un ticket individual, extrae el TOTAL general como un solo gasto.'
      + ' Si hay varios movimientos independientes, extrae un gasto por cada uno.';

    let result;
    if (isPDF) {
      result = await gemini.analyzeDocument(docPrompt, fileBuffer, 'application/pdf');
    } else {
      result = await gemini.analyzeImage(docPrompt, fileBuffer, mime);
    }

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
      rawInput: `[${isPDF ? 'pdf' : 'doc'}: ${doc.file_name || doc.file_id}]`,
      confidence: data.confidence,
      cardId: data.card_id || null,
    })));

    await bot.sendMessage(chatId, formatMultipleExpensesConfirmation(expenses, cards), { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error en documentHandler:', error.message);
    await bot.sendMessage(chatId, formatError('No pude analizar el archivo. Asegúrate de que sea un ticket o factura legible.'));
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

module.exports = { handleDocument };
