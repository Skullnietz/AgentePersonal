const gemini = require('../services/geminiService');
const db = require('../services/dbService');
const { formatError } = require('../utils/formatters');

const RECURRING_EXTRACT_PROMPT = `Extrae los datos del gasto fijo/recurrente mensual del mensaje del usuario.
Responde SOLO con JSON válido:
{
  "type": "recurring",
  "name": "<nombre del gasto, ej: Netflix, Renta, Seguro auto>",
  "amount": <monto mensual>,
  "currency": "MXN",
  "category": "<categoría>",
  "payment_day": <día del mes que se cobra 1-31 o null>
}

Categorías válidas: Comida, Transporte, Hogar, Compras, Salud, Entretenimiento, Educación, Servicios, Trabajo, Otros.`;

async function handleRecurringAdd(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const result = await gemini.analyzeText(RECURRING_EXTRACT_PROMPT, msg.text);

    if (result.type === 'error') {
      return bot.sendMessage(chatId, formatError(result.message));
    }

    await db.runQuery(
      `INSERT INTO recurring_expenses (user_id, name, amount, currency, category, payment_day)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, result.name, result.amount, result.currency || 'MXN',
       result.category, result.payment_day]
    );

    await bot.sendMessage(chatId,
      `🔄 *Gasto fijo registrado*\n\n` +
      `📌 *${result.name}*\n` +
      `💰 Monto: $${Number(result.amount).toLocaleString()} ${result.currency || 'MXN'}\n` +
      `🏷️ Categoría: ${result.category}\n` +
      `${result.payment_day ? `📅 Se cobra el día: ${result.payment_day}` : ''}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error en recurringHandler (add):', error.message);
    await bot.sendMessage(chatId, formatError('No pude registrar el gasto fijo. Intenta: "Gasto fijo Netflix $220, día 15"'));
  }
}

async function handleRecurringList(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const items = await db.runQuery(
      `SELECT r.*, c.name as card_name FROM recurring_expenses r
       LEFT JOIN cards c ON r.card_id = c.id
       WHERE r.user_id = ? AND r.is_active = TRUE ORDER BY r.payment_day`,
      [userId]
    );

    if (items.length === 0) {
      return bot.sendMessage(chatId,
        '📭 No tienes gastos fijos registrados.\n\nEnvía algo como:\n_"Gasto fijo: Netflix $220, día 15"_\n_"Pago mensual: renta $8,500, día 1"_',
        { parse_mode: 'Markdown' }
      );
    }

    let response = '🔄 *Mis Gastos Fijos Mensuales*\n\n';
    let total = 0;

    const ICONS = {
      'Comida': '🍔', 'Transporte': '🚗', 'Hogar': '🏠', 'Compras': '🛒',
      'Salud': '⚕️', 'Entretenimiento': '🎉', 'Educación': '📚',
      'Servicios': '💳', 'Trabajo': '💼', 'Otros': '❓',
    };

    for (const r of items) {
      const icon = ICONS[r.category] || '📌';
      const amount = Number(r.amount);
      total += amount;

      response += `${icon} *${r.name}*\n`;
      response += `   💰 $${amount.toLocaleString()}`;
      if (r.payment_day) response += ` — día ${r.payment_day}`;
      if (r.card_name) response += ` (${r.card_name})`;
      response += '\n';
    }

    response += `\n───────────────\n`;
    response += `💰 *Total mensual fijo:* $${total.toLocaleString()}`;

    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error en recurringHandler (list):', error.message);
    await bot.sendMessage(chatId, formatError('No pude obtener los gastos fijos.'));
  }
}

module.exports = { handleRecurringAdd, handleRecurringList };
