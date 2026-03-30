const gemini = require('../services/geminiService');
const db = require('../services/dbService');
const { expensePrompt } = require('../prompts/expensePrompt');
const { validateExpense } = require('../utils/validators');
const { formatExpenseConfirmation, formatError } = require('../utils/formatters');

async function handleText(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  try {
    const result = await gemini.analyzeText(expensePrompt, text);
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
      inputType: 'text',
      rawInput: text,
      confidence: data.confidence,
    });

    await bot.sendMessage(chatId, formatExpenseConfirmation(data), { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error en textHandler:', error.message);
    await bot.sendMessage(chatId, formatError('No pude procesar tu mensaje. Intenta de nuevo.'));
  }
}

module.exports = { handleText };
