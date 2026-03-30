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
    // Obtener tarjetas del usuario para inyectar en el prompt
    const cards = await db.runQuery(
      'SELECT id, name, card_type, bank, last_four FROM cards WHERE user_id = ? AND is_active = TRUE',
      [userId]
    );
    const prompt = expensePrompt.replace('{CARDS}', cards.length > 0 ? JSON.stringify(cards) : 'Sin tarjetas registradas');

    const result = await gemini.analyzeText(prompt, text);
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
      cardId: data.card_id || null,
    });

    // Buscar nombre de tarjeta para mostrarlo
    let cardName = null;
    if (data.card_id) {
      const card = cards.find(c => c.id === data.card_id);
      cardName = card ? card.name : null;
    }

    await bot.sendMessage(chatId, formatExpenseConfirmation(data, cardName), { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error en textHandler:', error.message);
    await bot.sendMessage(chatId, formatError('No pude procesar tu mensaje. Intenta de nuevo.'));
  }
}

module.exports = { handleText };
