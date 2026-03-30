const gemini = require('./services/geminiService');
const { intentPrompt } = require('./prompts/expensePrompt');
const { handleText } = require('./handlers/textHandler');
const { handlePhoto } = require('./handlers/photoHandler');
const { handleAudio } = require('./handlers/audioHandler');
const { handleDocument } = require('./handlers/documentHandler');
const { handleCardAdd, handleCardUpdate, handleCardList } = require('./handlers/cardHandler');
const { handleLoanAdd, handleLoanPayment, handleLoanList } = require('./handlers/loanHandler');
const { handleRecurringAdd, handleRecurringList } = require('./handlers/recurringHandler');
const { handleQuery } = require('./services/queryService');
const { formatGreeting, formatError } = require('./utils/formatters');

async function routeMessage(bot, msg) {
  const chatId = msg.chat.id;

  // Photo message
  if (msg.photo && msg.photo.length > 0) {
    return handlePhoto(bot, msg);
  }

  // Voice message
  if (msg.voice) {
    return handleAudio(bot, msg);
  }

  // Document (PDF, images)
  if (msg.document) {
    const mime = msg.document.mime_type || '';
    if (mime === 'application/pdf' || mime.startsWith('image/')) {
      return handleDocument(bot, msg);
    }
    return bot.sendMessage(chatId, '📎 Solo acepto archivos PDF o imágenes. Envía tu ticket como foto o PDF.');
  }

  // Text message
  if (msg.text) {
    if (msg.text.startsWith('/')) return;

    try {
      // Classify intent
      const classification = await gemini.analyzeText(intentPrompt, msg.text);
      const intent = classification.intent;

      console.log(`📨 "${msg.text.substring(0, 50)}" → ${intent}`);

      switch (intent) {
        case 'expense':
          return handleText(bot, msg);

        case 'query':
          await bot.sendMessage(chatId, '🔍 Analizando tus finanzas...');
          const response = await handleQuery(msg.from.id, msg.text);
          return bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });

        case 'card_add':
          return handleCardAdd(bot, msg);

        case 'card_update':
          return handleCardUpdate(bot, msg);

        case 'card_list':
          return handleCardList(bot, msg);

        case 'loan_add':
          return handleLoanAdd(bot, msg);

        case 'loan_payment':
          return handleLoanPayment(bot, msg);

        case 'loan_list':
          return handleLoanList(bot, msg);

        case 'recurring_add':
          return handleRecurringAdd(bot, msg);

        case 'recurring_list':
          return handleRecurringList(bot, msg);

        case 'greeting':
          return bot.sendMessage(chatId, formatGreeting(), { parse_mode: 'Markdown' });

        default:
          return bot.sendMessage(chatId, '🤔 No entendí tu mensaje. Puedes registrar un gasto, preguntarme sobre tus finanzas, o gestionar tarjetas y préstamos.');
      }
    } catch (error) {
      console.error('❌ Error en router:', error.message);
      console.error('   Stack:', error.stack?.split('\n').slice(0, 3).join('\n'));
      return bot.sendMessage(chatId, formatError('Ocurrió un error procesando tu mensaje.'));
    }
  }
}

module.exports = { routeMessage };
