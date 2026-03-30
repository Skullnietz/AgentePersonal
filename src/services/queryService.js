const gemini = require('./geminiService');
const db = require('./dbService');
const { queryPrompt } = require('../prompts/queryPrompt');

async function handleQuery(userId, userMessage) {
  const today = new Date().toISOString().split('T')[0];
  const prompt = queryPrompt.replace('{today}', today);

  const result = await gemini.analyzeText(prompt, userMessage);

  if (result.type === 'error') {
    return result.message;
  }

  // Validate: only SELECT allowed
  const sqlUpper = result.sql.toUpperCase().trim();
  if (!sqlUpper.startsWith('SELECT')) {
    return 'Solo se permiten consultas de lectura.';
  }
  const forbidden = ['DELETE', 'UPDATE', 'DROP', 'INSERT', 'ALTER', 'TRUNCATE'];
  for (const word of forbidden) {
    if (sqlUpper.includes(word)) {
      return 'Consulta no permitida por seguridad.';
    }
  }

  // Inject user_id as first param for safety
  const safeSql = result.sql.replace('WHERE', 'WHERE user_id = ? AND');
  const params = [userId, ...result.params];

  const rows = await db.runQuery(safeSql, params);

  return formatQueryResult(rows, result.summary_template);
}

function formatQueryResult(rows, template) {
  if (!rows || rows.length === 0) {
    return 'No encontré gastos con esos criterios.';
  }

  // If single aggregation row (SUM, COUNT, AVG)
  if (rows.length === 1 && Object.keys(rows[0]).length <= 3) {
    const row = rows[0];
    let response = template || '';
    for (const [key, value] of Object.entries(row)) {
      const formatted = typeof value === 'number' ? `$${value.toFixed(2)}` : value;
      response = response.replace(`{${key}}`, formatted);
    }
    // If template had no placeholders, build a simple response
    if (response === template) {
      const parts = Object.entries(row).map(([k, v]) => {
        const val = typeof v === 'number' ? `$${v.toFixed(2)}` : v;
        return `${k}: ${val}`;
      });
      return parts.join(' | ');
    }
    return response;
  }

  // Multiple rows: list format
  let response = template ? `${template}\n\n` : '';
  for (const row of rows.slice(0, 20)) {
    const amount = row.amount ? `$${Number(row.amount).toFixed(2)}` : '';
    const cat = row.category || '';
    const desc = row.description || '';
    const date = row.expense_date ? new Date(row.expense_date).toLocaleDateString('es-MX') : '';
    response += `- ${date} ${cat} ${amount} ${desc}\n`;
  }
  if (rows.length > 20) {
    response += `\n... y ${rows.length - 20} registros más.`;
  }
  return response.trim();
}

module.exports = { handleQuery };
