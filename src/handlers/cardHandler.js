const gemini = require('../services/geminiService');
const db = require('../services/dbService');
const { formatError, CATEGORY_ICONS } = require('../utils/formatters');

const CARD_EXTRACT_PROMPT = `Extrae los datos de la tarjeta del mensaje del usuario.
Responde SOLO con JSON válido:
{
  "type": "card",
  "name": "<nombre descriptivo, ej: BBVA Oro>",
  "card_type": "credito" | "debito",
  "bank": "<banco o null>",
  "last_four": "<últimos 4 dígitos o null>",
  "credit_limit": <límite de crédito o 0>,
  "current_balance": <saldo actual o 0>,
  "cut_off_day": <día de corte 1-31 o null>,
  "payment_due_day": <día de pago 1-31 o null>,
  "interest_rate": <tasa de interés anual o 0>
}`;

const CARD_UPDATE_PROMPT = `El usuario quiere actualizar datos de una tarjeta existente.
Estas son sus tarjetas registradas:
{CARDS}

Extrae qué tarjeta quiere actualizar y qué valores cambiar.
Responde SOLO con JSON válido:
{
  "type": "card_update",
  "card_id": <ID de la tarjeta>,
  "updates": {
    "current_balance": <nuevo saldo o null si no lo menciona>,
    "credit_limit": <nuevo límite o null>,
    "cut_off_day": <nuevo día de corte o null>,
    "payment_due_day": <nuevo día de pago o null>,
    "interest_rate": <nueva tasa o null>,
    "name": "<nuevo nombre o null>",
    "bank": "<nuevo banco o null>",
    "last_four": "<nuevos últimos 4 dígitos o null>"
  }
}

Si no puedes determinar la tarjeta:
{ "type": "error", "message": "No pude identificar la tarjeta. ¿Cuál quieres actualizar?" }`;

async function handleCardAdd(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const result = await gemini.analyzeText(CARD_EXTRACT_PROMPT, msg.text);

    if (result.type === 'error') {
      return bot.sendMessage(chatId, formatError(result.message));
    }

    await db.runQuery(
      `INSERT INTO cards (user_id, name, card_type, bank, last_four, credit_limit, current_balance, cut_off_day, payment_due_day, interest_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, result.name, result.card_type, result.bank, result.last_four,
       result.credit_limit || 0, result.current_balance || 0,
       result.cut_off_day, result.payment_due_day, result.interest_rate || 0]
    );

    const icon = result.card_type === 'credito' ? '💳' : '🏧';
    const limit = result.card_type === 'credito' && result.credit_limit ? `\n💰 Límite: $${Number(result.credit_limit).toLocaleString()}` : '';
    const balance = result.current_balance ? `\n📊 Saldo actual: $${Number(result.current_balance).toLocaleString()}` : '';
    const cutOff = result.cut_off_day ? `\n✂️ Corte: día ${result.cut_off_day}` : '';
    const payDay = result.payment_due_day ? `\n📅 Pago: día ${result.payment_due_day}` : '';

    await bot.sendMessage(chatId,
      `${icon} *Tarjeta registrada*\n\n` +
      `*${result.name}*${result.bank ? ` (${result.bank})` : ''}` +
      `${result.last_four ? `\n🔢 Terminación: ${result.last_four}` : ''}` +
      `${limit}${balance}${cutOff}${payDay}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error en cardHandler (add):', error.message);
    await bot.sendMessage(chatId, formatError('No pude registrar la tarjeta. Intenta algo como:\n"Mi tarjeta BBVA Oro, crédito, límite 50000, corte día 15, pago día 5"'));
  }
}

async function handleCardUpdate(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const cards = await db.runQuery(
      'SELECT id, name, card_type, bank, last_four, credit_limit, current_balance, cut_off_day, payment_due_day, interest_rate FROM cards WHERE user_id = ? AND is_active = TRUE',
      [userId]
    );

    if (cards.length === 0) {
      return bot.sendMessage(chatId, '📭 No tienes tarjetas registradas. Envía algo como: "Agregar tarjeta BBVA Oro, crédito, límite 50000"');
    }

    const prompt = CARD_UPDATE_PROMPT.replace('{CARDS}', JSON.stringify(cards));
    const result = await gemini.analyzeText(prompt, msg.text);

    if (result.type === 'error') {
      return bot.sendMessage(chatId, formatError(result.message));
    }

    const updates = result.updates;
    const setClauses = [];
    const params = [];
    const ALLOWED_FIELDS = ['current_balance', 'credit_limit', 'cut_off_day', 'payment_due_day', 'interest_rate', 'name', 'bank', 'last_four'];

    for (const [field, value] of Object.entries(updates)) {
      if (value !== null && value !== undefined && ALLOWED_FIELDS.includes(field)) {
        setClauses.push(`${field} = ?`);
        params.push(value);
      }
    }

    if (setClauses.length === 0) {
      return bot.sendMessage(chatId, '🤔 No detecté qué quieres actualizar. Puedo cambiar:\n- Saldo, límite, día de corte, día de pago, tasa de interés, nombre, banco o últimos 4 dígitos.');
    }

    params.push(result.card_id, userId);
    await db.runQuery(
      `UPDATE cards SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`,
      params
    );

    // Obtener tarjeta actualizada para mostrar estado completo
    const [updated] = await db.runQuery(
      'SELECT * FROM cards WHERE id = ? AND user_id = ?',
      [result.card_id, userId]
    );

    if (!updated) {
      return bot.sendMessage(chatId, '✅ Tarjeta actualizada.');
    }

    const balance = Number(updated.current_balance || 0);
    const limit = Number(updated.credit_limit || 0);
    const available = limit - balance;
    const usage = limit > 0 ? Math.round(balance / limit * 100) : 0;
    const usageBar = limit > 0 ? generateUsageBar(usage) : '';

    let response = `✅ *Tarjeta actualizada*\n\n`;
    response += `💳 *${updated.name}*${updated.bank ? ` (${updated.bank})` : ''}\n`;
    if (updated.last_four) response += `🔢 Terminación: ${updated.last_four}\n`;
    response += `📊 Saldo: $${balance.toLocaleString()}\n`;

    if (updated.card_type === 'credito' && limit > 0) {
      response += `💰 Límite: $${limit.toLocaleString()}\n`;
      response += `✅ Disponible: $${available.toLocaleString()}\n`;
      response += `${usageBar} ${usage}% utilizado\n`;

      if (usage > 80) {
        response += `\n⚠️ *Alerta:* Tu utilización está por encima del 80%. Esto puede afectar tu historial crediticio.`;
      } else if (usage > 50) {
        response += `\n💡 Tu utilización está moderada. Lo ideal es mantenerla bajo 30%.`;
      }
    }

    if (updated.cut_off_day) response += `\n✂️ Corte: día ${updated.cut_off_day}`;
    if (updated.payment_due_day) response += `\n📅 Pago: día ${updated.payment_due_day}`;
    if (updated.interest_rate) response += `\n📈 Tasa: ${updated.interest_rate}% anual`;

    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error en cardHandler (update):', error.message);
    await bot.sendMessage(chatId, formatError('No pude actualizar la tarjeta.'));
  }
}

async function handleCardList(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const cards = await db.runQuery(
      'SELECT * FROM cards WHERE user_id = ? AND is_active = TRUE ORDER BY name',
      [userId]
    );

    if (cards.length === 0) {
      return bot.sendMessage(chatId, '📭 No tienes tarjetas registradas.\n\nEnvía algo como:\n_"Agregar tarjeta BBVA Oro, crédito, límite 50000, corte día 15, pago día 5"_', { parse_mode: 'Markdown' });
    }

    // Obtener gastos del mes por tarjeta
    const cardExpenses = await db.runQuery(
      `SELECT card_id, category, SUM(amount) as total, COUNT(*) as count
       FROM expenses
       WHERE user_id = ? AND card_id IS NOT NULL
       AND MONTH(expense_date) = MONTH(CURDATE()) AND YEAR(expense_date) = YEAR(CURDATE())
       GROUP BY card_id, category ORDER BY card_id, total DESC`,
      [userId]
    );

    let response = '💳 *Mis Tarjetas*\n\n';
    let totalDebt = 0;
    let totalLimit = 0;

    for (const c of cards) {
      const icon = c.card_type === 'credito' ? '💳' : '🏧';
      const balance = Number(c.current_balance || 0);
      const limit = Number(c.credit_limit || 0);
      totalDebt += balance;
      if (c.card_type === 'credito') totalLimit += limit;

      response += `${icon} *${c.name}*${c.bank ? ` (${c.bank})` : ''}\n`;
      if (c.last_four) response += `   🔢 *${c.last_four}\n`;
      response += `   📊 Saldo: $${balance.toLocaleString()}\n`;

      if (c.card_type === 'credito' && limit > 0) {
        const available = limit - balance;
        const usage = Math.round(balance / limit * 100);
        response += `   💰 Límite: $${limit.toLocaleString()} | Disponible: $${available.toLocaleString()}\n`;
        response += `   ${generateUsageBar(usage)} ${usage}%\n`;
      }

      if (c.cut_off_day) response += `   ✂️ Corte: día ${c.cut_off_day}`;
      if (c.payment_due_day) response += ` | 📅 Pago: día ${c.payment_due_day}`;
      response += '\n';

      // Gastos del mes en esta tarjeta
      const thisCardExpenses = cardExpenses.filter(e => e.card_id === c.id);
      if (thisCardExpenses.length > 0) {
        const cardMonthTotal = thisCardExpenses.reduce((sum, e) => sum + Number(e.total), 0);
        response += `   📆 Este mes: $${cardMonthTotal.toLocaleString()} en ${thisCardExpenses.reduce((s, e) => s + e.count, 0)} gastos\n`;
        for (const e of thisCardExpenses.slice(0, 3)) {
          const catIcon = CATEGORY_ICONS[e.category] || '•';
          response += `      ${catIcon} ${e.category}: $${Number(e.total).toLocaleString()} (${e.count})\n`;
        }
      }

      response += '\n';
    }

    if (totalLimit > 0) {
      const totalUsage = Math.round(totalDebt / totalLimit * 100);
      response += `───────────────\n`;
      response += `💰 *Deuda total:* $${totalDebt.toLocaleString()}\n`;
      response += `📊 *Utilización global:* ${generateUsageBar(totalUsage)} ${totalUsage}%\n`;
      response += `✅ *Disponible total:* $${(totalLimit - totalDebt).toLocaleString()}`;
    }

    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error en cardHandler (list):', error.message);
    await bot.sendMessage(chatId, formatError('No pude obtener las tarjetas.'));
  }
}

function generateUsageBar(percent) {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  const color = percent > 80 ? '🔴' : percent > 50 ? '🟡' : '🟢';
  return color + ' ' + '▓'.repeat(filled) + '░'.repeat(empty);
}

module.exports = { handleCardAdd, handleCardUpdate, handleCardList };
