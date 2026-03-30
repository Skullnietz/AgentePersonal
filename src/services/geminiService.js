const { GoogleGenerativeAI } = require('@google/generative-ai');

let model;
let visionModel;

function getModel() {
  if (!model) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }
  return model;
}

function getVisionModel() {
  if (!visionModel) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    visionModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }
  return visionModel;
}

async function analyzeText(prompt, userMessage) {
  const result = await getModel().generateContent(`${prompt}\n\nMensaje del usuario: "${userMessage}"`);
  return extractJSON(result.response.text());
}

async function analyzeImage(prompt, imageBuffer, mimeType) {
  const imagePart = {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType: mimeType || 'image/jpeg',
    },
  };
  const result = await getVisionModel().generateContent([prompt, imagePart]);
  return extractJSON(result.response.text());
}

async function analyzeAudio(prompt, audioBuffer, mimeType) {
  const audioPart = {
    inlineData: {
      data: audioBuffer.toString('base64'),
      mimeType: mimeType || 'audio/ogg',
    },
  };
  const result = await getModel().generateContent([prompt, audioPart]);
  return extractJSON(result.response.text());
}

function extractJSON(text) {
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned);
}

module.exports = { analyzeText, analyzeImage, analyzeAudio };
