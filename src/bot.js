const TelegramBot = require('node-telegram-bot-api');
const { routeMessage } = require('./router');
const { isAllowedUser } = require('./utils/validators');
const { formatGreeting } = require('./utils/formatters');

function createBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN no está configurado en .env');
  }

  const bot = new TelegramBot(token, { polling: true });

  // /start command
  bot.onText(/\/start/, (msg) => {
    if (!isAllowedUser(msg.from.id)) return;
    bot.sendMessage(msg.chat.id, formatGreeting(), { parse_mode: 'Markdown' });
  });

  // /help command
  bot.onText(/\/help/, (msg) => {
    if (!isAllowedUser(msg.from.id)) return;
    const help = `📖 *Ayuda de FinBot*\n\n` +
      `*Registrar gastos:*\n` +
      `- Escribe: _"gasté 200 en uber"_\n` +
      `- Envía foto de un ticket\n` +
      `- Envía nota de voz\n\n` +
      `*Consultar gastos:*\n` +
      `- _"¿cuánto llevo este mes?"_\n` +
      `- _"resumen de esta semana"_\n` +
      `- _"gastos de comida del mes"_\n\n` +
      `*Comandos:*\n` +
      `/start - Iniciar bot\n` +
      `/help - Ver esta ayuda`;
    bot.sendMessage(msg.chat.id, help, { parse_mode: 'Markdown' });
  });

  // All other messages
  bot.on('message', (msg) => {
    if (!isAllowedUser(msg.from.id)) {
      bot.sendMessage(msg.chat.id, '⛔ No tienes acceso a este bot.');
      return;
    }

    // Skip if it's a command (handled above)
    if (msg.text && msg.text.startsWith('/')) return;

    routeMessage(bot, msg);
  });

  // Error handling
  bot.on('polling_error', (error) => {
    console.error('Error de polling:', error.code, error.message);
  });

  return bot;
}

module.exports = { createBot };
