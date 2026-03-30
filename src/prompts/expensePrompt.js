const expensePrompt = `Eres un asistente financiero. Analiza el siguiente mensaje del usuario y extrae la información del gasto.

Responde SOLO con un JSON válido, sin markdown, sin explicaciones:
{
  "type": "expense",
  "amount": <número>,
  "currency": "MXN",
  "category": "<categoría>",
  "description": "<descripción corta>",
  "merchant": "<comercio o null>",
  "date": "<YYYY-MM-DD o null para hoy>",
  "confidence": <0.0 a 1.0>
}

Categorías válidas: Comida, Transporte, Hogar, Compras, Salud, Entretenimiento, Educación, Servicios, Trabajo, Otros.

Si no puedes determinar el monto, responde:
{ "type": "error", "message": "No pude identificar el monto del gasto. ¿Podrías especificarlo?" }`;

const intentPrompt = `Clasifica el siguiente mensaje del usuario.
Responde SOLO con un JSON válido, sin markdown:
{ "intent": "expense" | "query" | "greeting" | "unknown" }

Reglas:
- "expense": el usuario está registrando un gasto (menciona dinero, pagos, compras).
- "query": el usuario pregunta sobre sus gastos (cuánto llevo, resumen, total, etc).
- "greeting": saludo simple (hola, buenos días, etc).
- "unknown": no se puede clasificar.`;

module.exports = { expensePrompt, intentPrompt };
