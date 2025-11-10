import { GoogleGenerativeAI } from '@google/generative-ai';

const parseMessages = (messages = []) =>
  Array.isArray(messages)
    ? messages
        .filter((message) => typeof message?.text === 'string' && message.text.trim().length > 0)
        .map((message) => ({
          role: message.role ?? 'user',
          parts: [{ text: message.text }],
        }))
    : [];

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', ['POST']);
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return response.status(500).json({ error: 'Missing GOOGLE_API_KEY environment variable' });
  }

  try {
    const { model = 'gemini-1.5-flash', messages, temperature, top_p: topP, imageBase64 } =
      typeof request.body === 'string' ? JSON.parse(request.body) : request.body ?? {};

    const generationConfig = {};
    if (typeof temperature === 'number') {
      generationConfig.temperature = temperature;
    }
    if (typeof topP === 'number') {
      generationConfig.topP = topP;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel(
      Object.keys(generationConfig).length > 0
        ? { model, generationConfig }
        : { model }
    );

    const contents = parseMessages(messages);

    if (imageBase64) {
      contents.push({
        role: 'user',
        parts: [
          {
            inlineData: {
              data: imageBase64,
              mimeType: 'image/png',
            },
          },
        ],
      });
    }

    if (contents.length === 0) {
      contents.push({
        role: 'user',
        parts: [{ text: 'Hello Gemini!' }],
      });
    }

    const result = await geminiModel.generateContent({
      contents,
    });

    const text = result?.response?.text?.();

    return response.status(200).json({ text: text ?? '' });
  } catch (error) {
    console.error('Gemini API error:', error);
    const message = error?.message ?? 'Unexpected error';
    return response.status(500).json({ error: message });
  }
}

