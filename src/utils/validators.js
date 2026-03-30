const VALID_CATEGORIES = [
  'Comida', 'Transporte', 'Hogar', 'Compras', 'Salud',
  'Entretenimiento', 'Educación', 'Servicios', 'Trabajo', 'Otros',
];

function validateExpense(data) {
  if (!data || data.type === 'error') {
    return { valid: false, error: data?.message || 'No se pudo procesar el gasto.' };
  }

  if (typeof data.amount !== 'number' || data.amount <= 0) {
    return { valid: false, error: 'El monto no es válido. Debe ser un número mayor a 0.' };
  }

  if (data.amount > 999999.99) {
    return { valid: false, error: 'El monto parece demasiado alto. ¿Podrías verificarlo?' };
  }

  if (!VALID_CATEGORIES.includes(data.category)) {
    data.category = 'Otros';
  }

  if (!data.date) {
    data.date = new Date().toISOString().split('T')[0];
  }

  if (!data.currency) {
    data.currency = 'MXN';
  }

  return { valid: true, data };
}

function isAllowedUser(userId) {
  const allowed = process.env.ALLOWED_USER_IDS;
  if (!allowed) return true;
  return allowed.split(',').map(id => id.trim()).includes(String(userId));
}

module.exports = { validateExpense, isAllowedUser, VALID_CATEGORIES };
