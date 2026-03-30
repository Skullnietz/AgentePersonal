const gemini = require('../services/geminiService');
const db = require('../services/dbService');
const { formatError, CATEGORY_ICONS } = require('../utils/formatters');

const DELETE_PROMPT = `El usuario quiere eliminar uno o varios gastos registrados.
Estos son sus últimos gastos:
{EXPENSES}

Analiza lo que pide el usuario e indica qué gastos eliminar.
Responde SOLO con JSON válido:
{
  "type": "delete",
  "expense_ids": [<IDs de los gastos a eliminar>],
  "reason": "<descripción breve de por qué>"
}

Reglas:
- Si dice "borra el último", pon el ID del gasto más reciente.
- Si dice "borra los últimos 3", pon los 3 IDs más recientes.
- Si describe un gasto específico (ej: "el de uber de 200 pesos"), busca el que coincida.
- Si dice "borra el #5" o "borra el de ID 5", usa ese ID.
- Si no puedes identificar cuál borrar, responde:
  { "type": "error", "message": "No pude identificar el gasto. Escribe 'ver últimos gastos' para verlos con su ID." }`;

/**
 * Muestra los últimos gastos con ID para que el usuario pueda elegir
 */
async function handleExpenseList(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const expenses = await db.runQuery(
      `SELECT e.id, e.amount, e.currency, e.category, e.description, e.merchant,
              e.expense_date, e.input_type, e.card_id, c.name as card_name
       FROM expenses e
       LEFT JOIN cards c ON e.card_id = c.id
       WHERE e.user_id = ? ORDER BY e.expense_date DESC, e.created_at DESC LIMIT 15`,
      [userId]
    );

    if (expenses.length === 0) {
      return bot.sendMessage(chatId, '📭 No tienes gastos registrados.');
    }

    let response = '📋 *Últimos gastos registrados*\n\n';

    for (const e of expenses) {
      const icon = CATEGORY_ICONS[e.category] || '❓';
      const date = new Date(e.expense_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
      const card = e.card_name ? ` 💳${e.card_name}` : '';
      const merchant = e.merchant ? ` — ${e.merchant}` : '';

      response += `*#${e.id}* ${icon} $${Number(e.amount).toFixed(2)} ${e.category}\n`;
      response += `   ${date} ${e.description || ''}${merchant}${card}\n`;
    }

    response += `\n_Para borrar escribe:_\n`;
    response += `_"borra el último gasto"_\n`;
    response += `_"borra el #${expenses[0].id}"_\n`;
    response += `_"borra el gasto de ${expenses[0].description || expenses[0].category}"_`;

    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error en expenseManager (list):', error.message);
    await bot.sendMessage(chatId, formatError('No pude obtener los gastos.'));
  }
}

/**
 * Borra uno o varios gastos por lenguaje natural
 */
async function handleExpenseDelete(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    // Obtener últimos gastos para darle contexto a la IA
    const expenses = await db.runQuery(
      `SELECT id, amount, currency, category, description, merchant, expense_date
       FROM expenses WHERE user_id = ? ORDER BY expense_date DESC, created_at DESC LIMIT 20`,
      [userId]
    );

    if (expenses.length === 0) {
      return bot.sendMessage(chatId, '📭 No tienes gastos registrados para borrar.');
    }

    const prompt = DELETE_PROMPT.replace('{EXPENSES}', JSON.stringify(expenses));
    const result = await gemini.analyzeText(prompt, msg.text);

    if (result.type === 'error') {
      return bot.sendMessage(chatId, formatError(result.message));
    }

    const ids = result.expense_ids;
    if (!ids || ids.length === 0) {
      return bot.sendMessage(chatId, formatError('No pude identificar qué gasto borrar.'));
    }

    // Verificar que los IDs pertenecen al usuario
    const placeholders = ids.map(() => '?').join(',');
    const toDelete = await db.runQuery(
      `SELECT id, amount, category, description, expense_date FROM expenses
       WHERE id IN (${placeholders}) AND user_id = ?`,
      [...ids, userId]
    );

    if (toDelete.length === 0) {
      return bot.sendMessage(chatId, formatError('No encontré esos gastos o no te pertenecen.'));
    }

    // Eliminar
    await db.runQuery(
      `DELETE FROM expenses WHERE id IN (${placeholders}) AND user_id = ?`,
      [...ids, userId]
    );

    // Confirmar
    let response;
    if (toDelete.length === 1) {
      const e = toDelete[0];
      const icon = CATEGORY_ICONS[e.category] || '❓';
      response = `🗑️ *Gasto eliminado*\n\n` +
        `${icon} $${Number(e.amount).toFixed(2)} — ${e.category}\n` +
        `📝 ${e.description || 'Sin descripción'}\n` +
        `📅 ${new Date(e.expense_date).toLocaleDateString('es-MX')}`;
    } else {
      const total = toDelete.reduce((sum, e) => sum + Number(e.amount), 0);
      response = `🗑️ *${toDelete.length} gastos eliminados*\n\n`;
      for (const e of toDelete) {
        const icon = CATEGORY_ICONS[e.category] || '❓';
        response += `${icon} $${Number(e.amount).toFixed(2)} — ${e.description || e.category}\n`;
      }
      response += `\n💰 Total removido: $${total.toFixed(2)}`;
    }

    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error en expenseManager (delete):', error.message);
    await bot.sendMessage(chatId, formatError('No pude eliminar el gasto.'));
  }
}

module.exports = { handleExpenseList, handleExpenseDelete };
