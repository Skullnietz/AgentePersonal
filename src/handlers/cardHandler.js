const gemini = require('../services/geminiService');
const db = require('../services/dbService');
const { formatError } = require('../utils/formatters');

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
    "payment_due_day": <nuevo día de pago o null>
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
    await bot.sendMessage(chatId, formatError('No pude registrar la tarjeta. Intenta algo como: "Mi tarjeta BBVA Oro, crédito, límite 50000, corte día 15, pago día 5"'));
  }
}

async function handleCardUpdate(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const cards = await db.runQuery(
      'SELECT id, name, card_type, bank, current_balance FROM cards WHERE user_id = ? AND is_active = TRUE',
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

    for (const [field, value] of Object.entries(updates)) {
      if (value !== null && value !== undefined) {
        setClauses.push(`${field} = ?`);
        params.push(value);
      }
    }

    if (setClauses.length === 0) {
      return bot.sendMessage(chatId, '🤔 No detecté qué quieres actualizar. Dime el saldo, límite, día de corte o día de pago.');
    }

    params.push(result.card_id, userId);
    await db.runQuery(
      `UPDATE cards SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`,
      params
    );

    const card = cards.find(c => c.id === result.card_id);
    await bot.sendMessage(chatId,
      `✅ *Tarjeta actualizada*\n\n💳 ${card?.name || 'Tarjeta'}\n` +
      Object.entries(updates).filter(([, v]) => v !== null).map(([k, v]) => {
        const labels = { current_balance: '📊 Saldo', credit_limit: '💰 Límite', cut_off_day: '✂️ Corte', payment_due_day: '📅 Pago' };
        const label = labels[k] || k;
        const formatted = typeof v === 'number' && k !== 'cut_off_day' && k !== 'payment_due_day' ? `$${v.toLocaleString()}` : `día ${v}`;
        return `${label}: ${formatted}`;
      }).join('\n'),
      { parse_mode: 'Markdown' }
    );
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
        response += `   💰 Límite: $${limit.toLocaleString()} | Disponible: $${available.toLocaleString()} (${usage}% usado)\n`;
      }
      if (c.cut_off_day) response += `   ✂️ Corte: día ${c.cut_off_day}`;
      if (c.payment_due_day) response += ` | 📅 Pago: día ${c.payment_due_day}`;
      response += '\n\n';
    }

    if (totalLimit > 0) {
      const totalUsage = Math.round(totalDebt / totalLimit * 100);
      response += `───────────────\n`;
      response += `💰 *Deuda total:* $${totalDebt.toLocaleString()}\n`;
      response += `📊 *Utilización:* ${totalUsage}% de $${totalLimit.toLocaleString()}`;
    }

    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error en cardHandler (list):', error.message);
    await bot.sendMessage(chatId, formatError('No pude obtener las tarjetas.'));
  }
}

module.exports = { handleCardAdd, handleCardUpdate, handleCardList };
