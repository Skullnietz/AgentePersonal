const gemini = require('./services/geminiService');
const { intentPrompt } = require('./prompts/expensePrompt');
const { handleText } = require('./handlers/textHandler');
const { handlePhoto } = require('./handlers/photoHandler');
const { handleAudio } = require('./handlers/audioHandler');
const { handleQuery } = require('./services/queryService');
const { formatGreeting, formatError } = require('./utils/formatters');

async function routeMessage(bot, msg) {
  // Photo message
  if (msg.photo && msg.photo.length > 0) {
    return handlePhoto(bot, msg);
  }

  // Voice message
  if (msg.voice) {
    return handleAudio(bot, msg);
  }

  // Text message
  if (msg.text) {
    // Skip commands
    if (msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;

    try {
      // Classify intent
      const classification = await gemini.analyzeText(intentPrompt, msg.text);
      const intent = classification.intent;

      switch (intent) {
        case 'expense':
          return handleText(bot, msg);

        case 'query':
          const response = await handleQuery(msg.from.id, msg.text);
          return bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });

        case 'greeting':
          return bot.sendMessage(chatId, formatGreeting(), { parse_mode: 'Markdown' });

        default:
          return bot.sendMessage(chatId, '🤔 No entendí tu mensaje. Puedes registrar un gasto o preguntarme sobre tus finanzas.');
      }
    } catch (error) {
      console.error('Error en router:', error.message);
      return bot.sendMessage(chatId, formatError('Ocurrió un error procesando tu mensaje.'));
    }
  }
}

module.exports = { routeMessage };
