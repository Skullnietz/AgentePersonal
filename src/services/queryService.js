const gemini = require('./geminiService');
const db = require('./dbService');
const { getFinancialContext } = require('./financialContext');
const { advisorPrompt } = require('../prompts/queryPrompt');

/**
 * Maneja consultas del usuario inyectando contexto financiero real.
 * La IA recibe TODOS los datos de la BD y responde con análisis inteligente.
 */
async function handleQuery(userId, userMessage) {
  // Obtener snapshot financiero completo de la BD
  const context = await getFinancialContext(userId);

  // Construir prompt con datos reales
  const prompt = advisorPrompt
    .replace('{FINANCIAL_CONTEXT}', JSON.stringify(context, null, 2))
    .replace('{today}', context.fecha_actual);

  const result = await gemini.analyzeText(prompt, userMessage);

  if (result.type === 'error') {
    return result.message;
  }

  return result.response;
}

module.exports = { handleQuery };
