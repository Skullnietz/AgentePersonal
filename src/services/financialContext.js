const db = require('./dbService');

/**
 * Genera un snapshot financiero completo del usuario.
 * Este contexto se inyecta en los prompts de la IA para que
 * pueda dar recomendaciones informadas.
 */
async function getFinancialContext(userId) {
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const dayOfMonth = today.getDate();

  const [
    monthSummary,
    categoryBreakdown,
    lastMonthSummary,
    lastMonthCategories,
    weekSummary,
    lastWeekSummary,
    recentExpenses,
    topMerchants,
    dailyAvg,
    cards,
    loans,
    recurringExpenses,
    upcomingPayments,
  ] = await Promise.all([
    getMonthSummary(userId, currentYear, currentMonth),
    getCategoryBreakdown(userId, currentYear, currentMonth),
    getMonthSummary(userId, currentMonth === 1 ? currentYear - 1 : currentYear, currentMonth === 1 ? 12 : currentMonth - 1),
    getCategoryBreakdown(userId, currentMonth === 1 ? currentYear - 1 : currentYear, currentMonth === 1 ? 12 : currentMonth - 1),
    getWeekSummary(userId),
    getLastWeekSummary(userId),
    getRecentExpenses(userId, 15),
    getTopMerchants(userId, currentYear, currentMonth),
    getDailyAverage(userId, currentYear, currentMonth),
    getCards(userId),
    getActiveLoans(userId),
    getRecurringExpenses(userId),
    getUpcomingPayments(userId, dayOfMonth),
  ]);

  // Calcular proyección mensual
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const projectedTotal = dayOfMonth > 0 ? (monthSummary.total / dayOfMonth) * daysInMonth : 0;

  // Comparación vs mes anterior
  const vsLastMonth = lastMonthSummary.total > 0
    ? ((monthSummary.total - lastMonthSummary.total) / lastMonthSummary.total * 100).toFixed(1)
    : null;

  // Comparación semanal
  const vsLastWeek = lastWeekSummary.total > 0
    ? ((weekSummary.total - lastWeekSummary.total) / lastWeekSummary.total * 100).toFixed(1)
    : null;

  // Deuda total en tarjetas
  const totalCardDebt = cards.reduce((sum, c) => sum + Number(c.current_balance || 0), 0);
  const totalCreditLimit = cards.filter(c => c.card_type === 'credito').reduce((sum, c) => sum + Number(c.credit_limit || 0), 0);

  // Deuda total en préstamos
  const totalLoanDebt = loans.reduce((sum, l) => sum + Number(l.remaining_amount || 0), 0);
  const totalMonthlyLoanPayments = loans.reduce((sum, l) => sum + Number(l.monthly_payment || 0), 0);

  // Gastos fijos mensuales
  const totalRecurring = recurringExpenses.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  return {
    fecha_actual: today.toISOString().split('T')[0],
    dia_del_mes: dayOfMonth,
    dias_en_mes: daysInMonth,
    dias_restantes: daysInMonth - dayOfMonth,

    resumen_mes_actual: {
      total: monthSummary.total,
      cantidad_gastos: monthSummary.count,
      promedio_diario: dailyAvg,
      proyeccion_fin_de_mes: Math.round(projectedTotal * 100) / 100,
      comparacion_vs_mes_anterior: vsLastMonth ? `${vsLastMonth}%` : 'Sin datos del mes anterior',
    },

    desglose_categorias_mes_actual: categoryBreakdown.map(c => ({
      categoria: c.category,
      total: c.total,
      cantidad: c.count,
      porcentaje: monthSummary.total > 0 ? Math.round(c.total / monthSummary.total * 100) : 0,
    })),

    resumen_mes_anterior: {
      total: lastMonthSummary.total,
      cantidad_gastos: lastMonthSummary.count,
    },

    desglose_categorias_mes_anterior: lastMonthCategories.map(c => ({
      categoria: c.category,
      total: c.total,
      cantidad: c.count,
    })),

    resumen_semana_actual: {
      total: weekSummary.total,
      cantidad: weekSummary.count,
      comparacion_vs_semana_anterior: vsLastWeek ? `${vsLastWeek}%` : 'Sin datos',
    },

    ultimos_gastos: recentExpenses.map(e => ({
      fecha: e.expense_date,
      monto: e.amount,
      categoria: e.category,
      descripcion: e.description,
      comercio: e.merchant,
    })),

    comercios_frecuentes: topMerchants,

    tarjetas: cards.map(c => ({
      id: c.id,
      nombre: c.name,
      tipo: c.card_type,
      banco: c.bank,
      ultimos_4: c.last_four,
      limite: c.credit_limit,
      saldo_actual: c.current_balance,
      disponible: c.card_type === 'credito' ? Number(c.credit_limit) - Number(c.current_balance) : null,
      dia_corte: c.cut_off_day,
      dia_pago: c.payment_due_day,
      tasa_interes: c.interest_rate,
    })),

    deuda_tarjetas: {
      total: totalCardDebt,
      limite_total: totalCreditLimit,
      utilizacion: totalCreditLimit > 0 ? Math.round(totalCardDebt / totalCreditLimit * 100) : 0,
    },

    prestamos: loans.map(l => ({
      id: l.id,
      nombre: l.name,
      tipo: l.loan_type,
      prestamista: l.lender,
      monto_original: l.original_amount,
      saldo_restante: l.remaining_amount,
      pago_mensual: l.monthly_payment,
      tasa_interes: l.interest_rate,
      dia_pago: l.payment_day,
      cuotas_totales: l.total_installments,
      cuotas_pagadas: l.paid_installments,
      cuotas_restantes: l.total_installments ? l.total_installments - l.paid_installments : null,
    })),

    deuda_prestamos: {
      total: totalLoanDebt,
      pagos_mensuales: totalMonthlyLoanPayments,
    },

    gastos_fijos: recurringExpenses.map(r => ({
      nombre: r.name,
      monto: r.amount,
      categoria: r.category,
      dia_pago: r.payment_day,
      tarjeta: r.card_name || null,
    })),

    total_gastos_fijos_mensuales: totalRecurring,

    compromisos_mensuales: totalRecurring + totalMonthlyLoanPayments,

    pagos_proximos: upcomingPayments,
  };
}

// ---- Queries auxiliares ----

async function getMonthSummary(userId, year, month) {
  const rows = await db.runQuery(
    `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
     FROM expenses WHERE user_id = ? AND YEAR(expense_date) = ? AND MONTH(expense_date) = ?`,
    [userId, year, month]
  );
  return { total: Number(rows[0].total), count: rows[0].count };
}

async function getCategoryBreakdown(userId, year, month) {
  return db.runQuery(
    `SELECT category, SUM(amount) as total, COUNT(*) as count
     FROM expenses WHERE user_id = ? AND YEAR(expense_date) = ? AND MONTH(expense_date) = ?
     GROUP BY category ORDER BY total DESC`,
    [userId, year, month]
  );
}

async function getWeekSummary(userId) {
  const rows = await db.runQuery(
    `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
     FROM expenses WHERE user_id = ? AND YEARWEEK(expense_date, 1) = YEARWEEK(CURDATE(), 1)`,
    [userId]
  );
  return { total: Number(rows[0].total), count: rows[0].count };
}

async function getLastWeekSummary(userId) {
  const rows = await db.runQuery(
    `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
     FROM expenses WHERE user_id = ? AND YEARWEEK(expense_date, 1) = YEARWEEK(CURDATE(), 1) - 1`,
    [userId]
  );
  return { total: Number(rows[0].total), count: rows[0].count };
}

async function getRecentExpenses(userId, limit) {
  return db.runQuery(
    `SELECT amount, category, description, merchant, expense_date
     FROM expenses WHERE user_id = ? ORDER BY expense_date DESC, created_at DESC LIMIT ?`,
    [userId, limit]
  );
}

async function getTopMerchants(userId, year, month) {
  return db.runQuery(
    `SELECT merchant, SUM(amount) as total, COUNT(*) as visits
     FROM expenses WHERE user_id = ? AND merchant IS NOT NULL AND merchant != ''
     AND YEAR(expense_date) = ? AND MONTH(expense_date) = ?
     GROUP BY merchant ORDER BY total DESC LIMIT 5`,
    [userId, year, month]
  );
}

async function getDailyAverage(userId, year, month) {
  const rows = await db.runQuery(
    `SELECT COALESCE(AVG(daily_total), 0) as avg_daily FROM (
       SELECT SUM(amount) as daily_total FROM expenses
       WHERE user_id = ? AND YEAR(expense_date) = ? AND MONTH(expense_date) = ?
       GROUP BY expense_date
     ) as daily`,
    [userId, year, month]
  );
  return Math.round(Number(rows[0].avg_daily) * 100) / 100;
}

async function getCards(userId) {
  return db.runQuery(
    `SELECT * FROM cards WHERE user_id = ? AND is_active = TRUE ORDER BY name`,
    [userId]
  );
}

async function getActiveLoans(userId) {
  return db.runQuery(
    `SELECT * FROM loans WHERE user_id = ? AND is_active = TRUE ORDER BY payment_day`,
    [userId]
  );
}

async function getRecurringExpenses(userId) {
  return db.runQuery(
    `SELECT r.*, c.name as card_name FROM recurring_expenses r
     LEFT JOIN cards c ON r.card_id = c.id
     WHERE r.user_id = ? AND r.is_active = TRUE ORDER BY r.payment_day`,
    [userId]
  );
}

async function getUpcomingPayments(userId, currentDay) {
  const payments = [];

  // Pagos de préstamos próximos
  const loans = await db.runQuery(
    `SELECT name, monthly_payment, payment_day, loan_type FROM loans
     WHERE user_id = ? AND is_active = TRUE AND payment_day >= ? ORDER BY payment_day`,
    [userId, currentDay]
  );
  for (const l of loans) {
    payments.push({
      tipo: 'prestamo',
      nombre: l.name,
      monto: l.monthly_payment,
      dia: l.payment_day,
      dias_restantes: l.payment_day - currentDay,
    });
  }

  // Pagos de tarjetas próximos
  const cards = await db.runQuery(
    `SELECT name, current_balance, payment_due_day FROM cards
     WHERE user_id = ? AND is_active = TRUE AND card_type = 'credito'
     AND payment_due_day >= ? AND current_balance > 0 ORDER BY payment_due_day`,
    [userId, currentDay]
  );
  for (const c of cards) {
    payments.push({
      tipo: 'tarjeta',
      nombre: c.name,
      monto: c.current_balance,
      dia: c.payment_due_day,
      dias_restantes: c.payment_due_day - currentDay,
    });
  }

  // Gastos fijos próximos
  const recurring = await db.runQuery(
    `SELECT name, amount, payment_day FROM recurring_expenses
     WHERE user_id = ? AND is_active = TRUE AND payment_day >= ? ORDER BY payment_day`,
    [userId, currentDay]
  );
  for (const r of recurring) {
    payments.push({
      tipo: 'gasto_fijo',
      nombre: r.name,
      monto: r.amount,
      dia: r.payment_day,
      dias_restantes: r.payment_day - currentDay,
    });
  }

  return payments.sort((a, b) => a.dia - b.dia);
}

module.exports = { getFinancialContext };
