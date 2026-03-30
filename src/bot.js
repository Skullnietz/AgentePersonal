const TelegramBot = require('node-telegram-bot-api');
const { routeMessage } = require('./router');
const { isAllowedUser } = require('./utils/validators');
const { formatGreeting } = require('./utils/formatters');

let botInstance = null;

async function createBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN no está configurado en .env');
  }

  // Limpia webhook y updates pendientes antes de iniciar polling
  const tempBot = new TelegramBot(token);
  try {
    await tempBot.deleteWebHook({ drop_pending_updates: true });
    console.log('🔄 Webhook limpiado, updates pendientes descartados');
  } catch (e) {
    // No importa si falla
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  const bot = new TelegramBot(token, {
    polling: {
      interval: 1500,
      autoStart: true,
      params: { timeout: 10 },
    },
  });

  botInstance = bot;

  // /start command
  bot.onText(/\/start/, (msg) => {
    if (!isAllowedUser(msg.from.id)) return;
    bot.sendMessage(msg.chat.id, formatGreeting(), { parse_mode: 'Markdown' });
  });

  // /help command
  bot.onText(/\/help/, (msg) => {
    if (!isAllowedUser(msg.from.id)) return;
    const help = `📖 *Ayuda de FinBot*\n\n` +
      `💰 *Registrar gastos:*\n` +
      `- _"gasté 200 en uber"_\n` +
      `- _"gasté 500 en comida con mi tarjeta BBVA"_\n` +
      `- Envía foto de ticket o PDF\n` +
      `- Envía nota de voz\n\n` +
      `📊 *Consultar y analizar:*\n` +
      `- _"¿cuánto llevo este mes?"_\n` +
      `- _"resumen por categoría"_\n` +
      `- _"compara esta semana con la anterior"_\n` +
      `- _"dame recomendaciones"_\n` +
      `- _"¿qué pagos tengo próximos?"_\n\n` +
      `💳 *Tarjetas:*\n` +
      `- _"agregar tarjeta BBVA Oro, crédito, límite 50000"_\n` +
      `- _"mi tarjeta BBVA tiene saldo de 12000"_\n` +
      `- _"mis tarjetas"_\n\n` +
      `📋 *Préstamos:*\n` +
      `- _"tengo un préstamo de 50000 con Bancomer, pago 3500 mensual"_\n` +
      `- _"pagué 3500 de mi préstamo Bancomer"_\n` +
      `- _"mis préstamos"_\n\n` +
      `🔄 *Gastos fijos:*\n` +
      `- _"gasto fijo: Netflix $220, día 15"_\n` +
      `- _"mis gastos fijos"_\n\n` +
      `🗑️ *Editar/Borrar gastos:*\n` +
      `- _"ver mis últimos gastos"_\n` +
      `- _"borra el último gasto"_\n` +
      `- _"borra el #5"_ (por ID)\n` +
      `- _"me equivoqué, borra el de uber"_\n\n` +
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
    if (msg.text && msg.text.startsWith('/')) return;
    routeMessage(bot, msg);
  });

  // Error handling
  let lastPollingError = 0;
  bot.on('polling_error', (error) => {
    const now = Date.now();
    if (now - lastPollingError > 10000) {
      console.error('Error de polling:', error.code, error.message);
      lastPollingError = now;
    }
  });

  return bot;
}

// Graceful shutdown
function gracefulShutdown() {
  if (botInstance) {
    console.log('🛑 Deteniendo polling...');
    botInstance.stopPolling()
      .then(() => process.exit(0))
      .catch(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown);

module.exports = { createBot };
