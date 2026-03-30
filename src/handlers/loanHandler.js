const gemini = require('../services/geminiService');
const db = require('../services/dbService');
const { formatError } = require('../utils/formatters');

const LOAN_EXTRACT_PROMPT = `Extrae los datos del préstamo/deuda del mensaje del usuario.
Responde SOLO con JSON válido:
{
  "type": "loan",
  "name": "<nombre descriptivo, ej: Crédito Auto BBVA>",
  "loan_type": "personal" | "auto" | "hipoteca" | "educativo" | "otro",
  "lender": "<banco/prestamista o null>",
  "original_amount": <monto original del préstamo>,
  "remaining_amount": <saldo pendiente, igual al original si es nuevo>,
  "monthly_payment": <pago mensual>,
  "interest_rate": <tasa anual o 0>,
  "payment_day": <día del mes para pagar 1-31 o null>,
  "start_date": "<YYYY-MM-DD o null>",
  "end_date": "<YYYY-MM-DD o null>",
  "total_installments": <total de mensualidades o null>,
  "paid_installments": <mensualidades ya pagadas o 0>
}`;

const LOAN_PAYMENT_PROMPT = `El usuario quiere registrar un pago a un préstamo.
Estos son sus préstamos activos:
{LOANS}

Extrae qué préstamo pagó y cuánto.
Responde SOLO con JSON válido:
{
  "type": "loan_payment",
  "loan_id": <ID del préstamo>,
  "amount": <monto pagado>,
  "date": "<YYYY-MM-DD o null para hoy>",
  "note": "<nota opcional o null>"
}

Si no puedes determinar el préstamo:
{ "type": "error", "message": "No pude identificar a cuál préstamo te refieres. ¿Podrías especificar?" }`;

async function handleLoanAdd(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const result = await gemini.analyzeText(LOAN_EXTRACT_PROMPT, msg.text);

    if (result.type === 'error') {
      return bot.sendMessage(chatId, formatError(result.message));
    }

    await db.runQuery(
      `INSERT INTO loans (user_id, name, loan_type, lender, original_amount, remaining_amount, monthly_payment, interest_rate, payment_day, start_date, end_date, total_installments, paid_installments)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, result.name, result.loan_type, result.lender,
       result.original_amount, result.remaining_amount || result.original_amount,
       result.monthly_payment, result.interest_rate || 0,
       result.payment_day, result.start_date, result.end_date,
       result.total_installments, result.paid_installments || 0]
    );

    const icons = { personal: '💵', auto: '🚗', hipoteca: '🏠', educativo: '📚', otro: '📋' };
    const icon = icons[result.loan_type] || '📋';
    const progress = result.total_installments
      ? `\n📊 Progreso: ${result.paid_installments || 0}/${result.total_installments} cuotas`
      : '';

    await bot.sendMessage(chatId,
      `${icon} *Préstamo registrado*\n\n` +
      `*${result.name}*${result.lender ? ` (${result.lender})` : ''}\n` +
      `💰 Monto original: $${Number(result.original_amount).toLocaleString()}\n` +
      `📊 Saldo pendiente: $${Number(result.remaining_amount || result.original_amount).toLocaleString()}\n` +
      `💸 Pago mensual: $${Number(result.monthly_payment).toLocaleString()}\n` +
      `${result.payment_day ? `📅 Día de pago: ${result.payment_day}\n` : ''}` +
      `${result.interest_rate ? `📈 Tasa: ${result.interest_rate}% anual\n` : ''}` +
      `${progress}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error en loanHandler (add):', error.message);
    await bot.sendMessage(chatId, formatError('No pude registrar el préstamo. Intenta algo como: "Préstamo personal de $50,000 con Bancomer, pago $3,500 al mes, día 15"'));
  }
}

async function handleLoanPayment(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const loans = await db.runQuery(
      'SELECT id, name, loan_type, remaining_amount, monthly_payment FROM loans WHERE user_id = ? AND is_active = TRUE',
      [userId]
    );

    if (loans.length === 0) {
      return bot.sendMessage(chatId, '📭 No tienes préstamos registrados.');
    }

    const prompt = LOAN_PAYMENT_PROMPT.replace('{LOANS}', JSON.stringify(loans));
    const result = await gemini.analyzeText(prompt, msg.text);

    if (result.type === 'error') {
      return bot.sendMessage(chatId, formatError(result.message));
    }

    const paymentDate = result.date || new Date().toISOString().split('T')[0];

    // Registrar pago
    await db.runQuery(
      'INSERT INTO loan_payments (loan_id, user_id, amount, payment_date, note) VALUES (?, ?, ?, ?, ?)',
      [result.loan_id, userId, result.amount, paymentDate, result.note]
    );

    // Actualizar saldo del préstamo
    await db.runQuery(
      'UPDATE loans SET remaining_amount = GREATEST(remaining_amount - ?, 0), paid_installments = paid_installments + 1 WHERE id = ? AND user_id = ?',
      [result.amount, result.loan_id, userId]
    );

    // Obtener datos actualizados
    const [updated] = await db.runQuery(
      'SELECT name, remaining_amount, total_installments, paid_installments FROM loans WHERE id = ?',
      [result.loan_id]
    );

    const progress = updated.total_installments
      ? `📊 Progreso: ${updated.paid_installments}/${updated.total_installments} cuotas`
      : '';
    const remaining = Number(updated.remaining_amount);

    await bot.sendMessage(chatId,
      `✅ *Pago registrado*\n\n` +
      `📋 *${updated.name}*\n` +
      `💸 Pago: $${Number(result.amount).toLocaleString()}\n` +
      `📅 Fecha: ${paymentDate}\n` +
      `💰 Saldo restante: $${remaining.toLocaleString()}\n` +
      `${progress}\n` +
      `${remaining === 0 ? '\n🎉 *¡Felicidades! Has terminado de pagar este préstamo.*' : ''}`,
      { parse_mode: 'Markdown' }
    );

    // Si ya se liquidó, desactivar
    if (remaining === 0) {
      await db.runQuery('UPDATE loans SET is_active = FALSE WHERE id = ?', [result.loan_id]);
    }
  } catch (error) {
    console.error('Error en loanHandler (payment):', error.message);
    await bot.sendMessage(chatId, formatError('No pude registrar el pago.'));
  }
}

async function handleLoanList(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const loans = await db.runQuery(
      'SELECT * FROM loans WHERE user_id = ? AND is_active = TRUE ORDER BY payment_day',
      [userId]
    );

    if (loans.length === 0) {
      return bot.sendMessage(chatId, '📭 No tienes préstamos activos.\n\nEnvía algo como:\n_"Tengo un préstamo personal de $50,000 con Bancomer, pago $3,500 mensual, día 15"_', { parse_mode: 'Markdown' });
    }

    const icons = { personal: '💵', auto: '🚗', hipoteca: '🏠', educativo: '📚', otro: '📋' };
    let response = '📋 *Mis Préstamos*\n\n';
    let totalDebt = 0;
    let totalMonthly = 0;

    for (const l of loans) {
      const icon = icons[l.loan_type] || '📋';
      const remaining = Number(l.remaining_amount);
      const original = Number(l.original_amount);
      const monthly = Number(l.monthly_payment);
      totalDebt += remaining;
      totalMonthly += monthly;

      const paidPercent = original > 0 ? Math.round((1 - remaining / original) * 100) : 0;
      const progressBar = generateProgressBar(paidPercent);

      response += `${icon} *${l.name}*${l.lender ? ` (${l.lender})` : ''}\n`;
      response += `   💰 Restante: $${remaining.toLocaleString()} de $${original.toLocaleString()}\n`;
      response += `   💸 Mensualidad: $${monthly.toLocaleString()}`;
      if (l.payment_day) response += ` (día ${l.payment_day})`;
      response += '\n';
      if (l.total_installments) {
        response += `   📊 Cuotas: ${l.paid_installments}/${l.total_installments}\n`;
      }
      response += `   ${progressBar} ${paidPercent}%\n\n`;
    }

    response += `───────────────\n`;
    response += `💰 *Deuda total:* $${totalDebt.toLocaleString()}\n`;
    response += `💸 *Pago mensual total:* $${totalMonthly.toLocaleString()}`;

    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error en loanHandler (list):', error.message);
    await bot.sendMessage(chatId, formatError('No pude obtener los préstamos.'));
  }
}

function generateProgressBar(percent) {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty);
}

module.exports = { handleLoanAdd, handleLoanPayment, handleLoanList };
