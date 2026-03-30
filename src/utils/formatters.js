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

function formatExpenseConfirmation(data) {
  const icon = CATEGORY_ICONS[data.category] || '❓';
  const date = formatDate(data.date);
  const merchant = data.merchant ? `\n🏪 Comercio: ${data.merchant}` : '';

  return `✅ *Gasto registrado*

${icon} *Categoría:* ${data.category}
💰 *Monto:* $${Number(data.amount).toFixed(2)} ${data.currency}
📝 *Descripción:* ${data.description || 'Sin descripción'}${merchant}
📅 *Fecha:* ${date}`;
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

  return `${greeting} 👋\n\nSoy tu asistente financiero. Puedes:\n\n` +
    `💬 Enviarme un gasto: _"gasté 200 en uber"_\n` +
    `📸 Enviarme una foto de un ticket\n` +
    `🎤 Enviarme una nota de voz\n` +
    `📊 Preguntarme sobre tus gastos: _"¿cuánto llevo este mes?"_`;
}

function formatError(message) {
  return `⚠️ ${message || 'Ocurrió un error. Intenta de nuevo.'}`;
}

module.exports = { formatExpenseConfirmation, formatGreeting, formatError, CATEGORY_ICONS };
