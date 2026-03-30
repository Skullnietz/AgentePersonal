const expensePrompt = `Eres un asistente financiero. Analiza el siguiente mensaje del usuario y extrae la información del gasto.

TARJETAS REGISTRADAS DEL USUARIO:
{CARDS}

Responde SOLO con un JSON válido, sin markdown, sin explicaciones:
{
  "type": "expense",
  "amount": <número>,
  "currency": "MXN",
  "category": "<categoría>",
  "description": "<descripción corta>",
  "merchant": "<comercio o null>",
  "date": "<YYYY-MM-DD o null para hoy>",
  "confidence": <0.0 a 1.0>,
  "card_id": <ID de la tarjeta usada o null si no menciona tarjeta>
}

Categorías válidas: Comida, Transporte, Hogar, Compras, Salud, Entretenimiento, Educación, Servicios, Trabajo, Otros.

Reglas para card_id:
- Si el usuario menciona una tarjeta (ej: "con mi BBVA", "con tarjeta", "con la Oro"), busca en la lista de tarjetas y usa su ID.
- Si no menciona tarjeta, pon null.
- Haz match por nombre, banco, últimos 4 dígitos o apodo.

Si no puedes determinar el monto, responde:
{ "type": "error", "message": "No pude identificar el monto del gasto. ¿Podrías especificarlo?" }`;

const multiExpensePrompt = `Eres un asistente financiero. Analiza la imagen o documento del usuario y extrae uno o varios gastos.

TARJETAS REGISTRADAS DEL USUARIO:
{CARDS}

Responde SOLO con un JSON válido, sin markdown, sin explicaciones:
{
  "type": "expense_list",
  "expenses": [
    {
      "amount": <número>,
      "currency": "MXN",
      "category": "<categoría>",
      "description": "<descripción corta>",
      "merchant": "<comercio o null>",
      "date": "<YYYY-MM-DD o null para hoy>",
      "confidence": <0.0 a 1.0>,
      "card_id": <ID de la tarjeta o null>
    }
  ]
}

Reglas:
- Si la imagen contiene un solo gasto, regresa un arreglo con un elemento.
- Si la imagen contiene varios movimientos, regresa un elemento por cada gasto claramente identificable.
- Si puedes identificar la tarjeta usada (por nombre del banco, últimos 4 dígitos, etc.), vincula con card_id.
- No inventes gastos.
- Si el monto de un movimiento no es legible, omítelo.
- Usa categorías válidas: Comida, Transporte, Hogar, Compras, Salud, Entretenimiento, Educación, Servicios, Trabajo, Otros.

Si no puedes identificar ningún gasto, responde:
{ "type": "error", "message": "No pude identificar gastos válidos en la imagen o documento." }`;

const intentPrompt = `Clasifica el siguiente mensaje del usuario.
Responde SOLO con un JSON válido, sin markdown:
{ "intent": "<intención>" }

Intenciones posibles:
- "expense": el usuario está registrando un gasto (menciona dinero, pagos, compras que hizo).
- "query": el usuario pregunta sobre sus gastos, quiere un resumen, análisis, recomendación, o info de sus finanzas.
- "card_add": el usuario quiere agregar/registrar una tarjeta nueva.
- "card_update": el usuario quiere actualizar saldo o datos de una tarjeta existente.
- "card_list": el usuario quiere ver sus tarjetas.
- "loan_add": el usuario quiere registrar un préstamo o deuda nueva.
- "loan_payment": el usuario quiere registrar un pago a un préstamo.
- "loan_list": el usuario quiere ver sus préstamos.
- "recurring_add": el usuario quiere agregar un gasto fijo/recurrente mensual.
- "recurring_list": el usuario quiere ver sus gastos fijos.
- "greeting": saludo simple (hola, buenos días, etc).
- "unknown": no se puede clasificar.

Reglas:
- Si el usuario dice "agregar tarjeta", "nueva tarjeta", "registrar mi tarjeta" → card_add
- Si el usuario dice "actualizar saldo", "mi tarjeta tiene X", "debo X en mi tarjeta" → card_update
- Si el usuario dice "mis tarjetas", "ver tarjetas" → card_list
- Si el usuario dice "tengo un préstamo", "debo X a Y", "saqué un crédito" → loan_add
- Si el usuario dice "pagué X de mi préstamo", "abono al crédito" → loan_payment
- Si el usuario dice "mis préstamos", "mis deudas" → loan_list
- Si el usuario dice "pago fijo", "gasto mensual de", "cada mes pago" → recurring_add
- Si el usuario dice "mis gastos fijos", "pagos recurrentes" → recurring_list
- Preguntas como "cuánto llevo", "resumen", "analiza mis gastos", "recomendaciones", "qué puedo hacer", "en qué gasto más", "comparación" → query
- Si menciona que GASTÓ + tarjeta → expense (no card_update)`;

module.exports = { expensePrompt, multiExpensePrompt, intentPrompt };
