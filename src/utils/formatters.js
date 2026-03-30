const CATEGORY_ICONS = {
  'Comida': '🍔',
  'Transporte': '🚗',
  'Hogar': '🏠',
  'Compras': '🛒',
  'Salud': '⚕️',
  'Entretenimiento': '🎉',
  'Educación': '📚',
  'Servicios': '💳',
  'Trabajo': '💼',
  'Otros': '❓',
};

function formatExpenseConfirmation(data, cardName) {
  const icon = CATEGORY_ICONS[data.category] || '❓';
  const date = formatDate(data.date);
  const merchant = data.merchant ? `\n🏪 Comercio: ${data.merchant}` : '';
  const card = cardName ? `\n💳 Tarjeta: ${cardName}` : '';

  return `✅ *Gasto registrado*

${icon} *Categoría:* ${data.category}
💰 *Monto:* $${Number(data.amount).toFixed(2)} ${data.currency}
📝 *Descripción:* ${data.description || 'Sin descripción'}${merchant}${card}
📅 *Fecha:* ${date}`;
}

function formatMultipleExpensesConfirmation(expenses, cards) {
  if (!expenses || expenses.length === 0) {
    return formatError('No se registraron gastos.');
  }

  if (expenses.length === 1) {
    let cardName = null;
    if (expenses[0].card_id && cards) {
      const card = cards.find(c => c.id === expenses[0].card_id);
      cardName = card ? card.name : null;
    }
    return formatExpenseConfirmation(expenses[0], cardName);
  }

  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const lines = expenses.slice(0, 10).map((expense) => {
    const icon = CATEGORY_ICONS[expense.category] || '❓';
    const merchant = expense.merchant ? ` - ${expense.merchant}` : '';
    let cardLabel = '';
    if (expense.card_id && cards) {
      const card = cards.find(c => c.id === expense.card_id);
      if (card) cardLabel = ` 💳${card.name}`;
    }
    return `${icon} $${Number(expense.amount).toFixed(2)} ${expense.currency} - ${expense.description || 'Sin descripción'}${merchant}${cardLabel}`;
  });
  const extra = expenses.length > 10 ? `\n… y ${expenses.length - 10} más.` : '';

  return `✅ *${expenses.length} gastos registrados*\n\n${lines.join('\n')}\n\n💰 *Total:* $${total.toFixed(2)} ${expenses[0].currency || 'MXN'}${extra}`;
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatGreeting() {
  const hour = new Date().getHours();
  let greeting;
  if (hour < 12) greeting = 'Buenos días';
  else if (hour < 18) greeting = 'Buenas tardes';
  else greeting = 'Buenas noches';

  return `${greeting} 👋\n\nSoy tu asistente financiero. Puedo ayudarte con:\n\n` +
    `💬 Registrar gastos: _"gasté 200 en uber"_\n` +
    `📸 Analizar tickets y PDFs\n` +
    `🎤 Notas de voz\n` +
    `📊 Análisis: _"resumen del mes"_, _"recomendaciones"_\n` +
    `💳 Tarjetas: _"agregar tarjeta"_, _"mis tarjetas"_\n` +
    `📋 Préstamos: _"tengo un préstamo..."_, _"mis deudas"_\n` +
    `🔄 Gastos fijos: _"gasto fijo Netflix $220"_\n\n` +
    `Escribe /help para ver todos los comandos.`;
}

function formatError(message) {
  return `⚠️ ${message || 'Ocurrió un error. Intenta de nuevo.'}`;
}

module.exports = { formatExpenseConfirmation, formatMultipleExpensesConfirmation, formatGreeting, formatError, CATEGORY_ICONS };
