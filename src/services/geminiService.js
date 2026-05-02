const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI;
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const FALLBACK_MODELS = [
  DEFAULT_MODEL,
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
].filter((modelName, index, arr) => arr.indexOf(modelName) === index);
const TEXT_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 500);
const MULTIMODAL_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS_MULTIMODAL || 700);
const TEMPERATURE = Number(process.env.GEMINI_TEMPERATURE || 0.1);

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY no esta configurado en .env');
  }

  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  return genAI;
}

async function runGemini(parts, options = {}) {
  let lastError;
  const maxOutputTokens = options.maxOutputTokens || TEXT_MAX_OUTPUT_TOKENS;

  for (const modelName of FALLBACK_MODELS) {
    try {
      const model = getClient().getGenerativeModel({ model: modelName });
      const response = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: TEMPERATURE,
          topK: 1,
          topP: 0.1,
          maxOutputTokens,
          responseMimeType: 'application/json',
        },
      });

      return response.response.text();
    } catch (error) {
      lastError = error;
      const isMissingModel = String(error.message || '').includes('no longer available') || String(error.message || '').includes('[404 Not Found]');

      if (isMissingModel) {
        console.warn(`Modelo Gemini no disponible: ${modelName}. Probando fallback...`);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

async function runGeminiAndParse(parts, options = {}) {
  const raw = await runGemini(parts, options);

  try {
    return extractJSON(raw);
  } catch (error) {
    const shouldRetry = options.retryOnInvalidJson !== false;
    if (!shouldRetry) {
      throw error;
    }

    const repairedParts = [...parts];
    const firstTextPartIndex = repairedParts.findIndex((part) => typeof part.text === 'string');

    if (firstTextPartIndex >= 0) {
      repairedParts[firstTextPartIndex] = {
        ...repairedParts[firstTextPartIndex],
        text: `${repairedParts[firstTextPartIndex].text}\n\nIMPORTANTE: Responde con JSON estrictamente valido, completo y cerrado. No omitas corchetes ni comas.`,
      };
    }

    const retriedRaw = await runGemini(repairedParts, {
      ...options,
      maxOutputTokens: Math.max(options.maxOutputTokens || 0, MULTIMODAL_MAX_OUTPUT_TOKENS),
      retryOnInvalidJson: false,
    });

    return extractJSON(retriedRaw);
  }
}

async function analyzeText(prompt, userMessage) {
  return runGeminiAndParse([
    {
      text: `${prompt}\n\nMensaje del usuario:\n${userMessage}`,
    },
  ], {
    maxOutputTokens: TEXT_MAX_OUTPUT_TOKENS,
    retryOnInvalidJson: true,
  });
}

async function analyzeImage(prompt, imageBuffer, mimeType) {
  return runGeminiAndParse([
    { text: prompt },
    {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: mimeType || 'image/jpeg',
      },
    },
  ], {
    maxOutputTokens: MULTIMODAL_MAX_OUTPUT_TOKENS,
    retryOnInvalidJson: true,
  });
}

async function analyzeAudio(prompt, audioBuffer, mimeType) {
  try {
    return await runGeminiAndParse([
      { text: `${prompt}\n\nPrimero transcribe el audio y luego extrae los datos del gasto.` },
      {
        inlineData: {
          data: audioBuffer.toString('base64'),
          mimeType: mimeType || 'audio/ogg',
        },
      },
    ], {
      maxOutputTokens: MULTIMODAL_MAX_OUTPUT_TOKENS,
      retryOnInvalidJson: true,
    });
  } catch (error) {
    console.warn('Audio model fallo en Gemini, usando fallback de texto...');
    return analyzeText(
      `${prompt}\n\n[NOTA: No se pudo procesar el audio directamente. Pide al usuario que envie su gasto como texto.]`,
      '[El usuario envio una nota de voz que no se pudo transcribir]'
    );
  }
}

async function transcribeAudio(audioBuffer, mimeType, glossary = []) {
  const glossaryText = glossary.length > 0
    ? `\n\nGlosario de terminos frecuentes del usuario:\n${glossary.map((term) => `- ${term}`).join('\n')}`
    : '';

  return runGeminiAndParse([
    {
      text: `Transcribe el audio del usuario en espanol de Mexico.\n\nResponde SOLO con JSON valido:\n{\n  "type": "transcription",\n  "transcript": "texto transcrito limpio",\n  "confidence": 0.0,\n  "needs_confirmation": false\n}\n\nReglas:\n- Mantén nombres propios, sistemas, equipos, ubicaciones y montos.\n- Corrige errores obvios de transcripcion sin cambiar la intención.\n- Si el audio es confuso, incompleto o hay palabras clave dudosas, usa needs_confirmation true.\n- No ejecutes acciones; solo transcribe.\n- No agregues explicaciones.${glossaryText}`,
    },
    {
      inlineData: {
        data: audioBuffer.toString('base64'),
        mimeType: mimeType || 'audio/ogg',
      },
    },
  ], {
    maxOutputTokens: Number(process.env.GEMINI_TRANSCRIPTION_MAX_OUTPUT_TOKENS || 350),
    retryOnInvalidJson: true,
  });
}

async function analyzeDocument(prompt, docBuffer, mimeType) {
  return runGeminiAndParse([
    { text: prompt },
    {
      inlineData: {
        data: docBuffer.toString('base64'),
        mimeType: mimeType || 'application/pdf',
      },
    },
  ], {
    maxOutputTokens: MULTIMODAL_MAX_OUTPUT_TOKENS,
    retryOnInvalidJson: true,
  });
}

function extractJSON(text) {
  // Limpiar markdown code blocks y null/undefined defensivamente
  let cleaned = String(text || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Extraer solo el JSON si hay texto adicional
  const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  return JSON.parse(cleaned);
}

module.exports = { analyzeText, analyzeImage, analyzeAudio, analyzeDocument, transcribeAudio };
