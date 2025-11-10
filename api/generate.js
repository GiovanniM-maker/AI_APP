import { GoogleGenerativeAI } from '@google/generative-ai';

const formatMessages = (messages = []) =>
  Array.isArray(messages)
    ? messages
        .filter(
          (message) =>
            typeof message?.role === 'string' &&
            typeof message?.content === 'string' &&
            message.content.trim().length > 0
        )
        .map((message) => ({
          role: message.role,
          parts: [{ text: message.content }],
        }))
    : [];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { model, messages, temperature, top_p: topP, imageBase64 } = req.body ?? {};

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('Missing GOOGLE_API_KEY');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const gemini = genAI.getGenerativeModel({ model: model || 'gemini-1.5-flash' });

    const contents = formatMessages(messages);

    if (imageBase64) {
      contents.push({
        role: 'user',
        parts: [
          { text: 'Analyze this image:' },
          { inlineData: { mimeType: 'image/png', data: imageBase64 } },
        ],
      });
    }

    if (contents.length === 0) {
      contents.push({
        role: 'user',
        parts: [{ text: 'Hello Gemini!' }],
      });
    }

    const generationConfig = {};
    if (typeof temperature === 'number') {
      generationConfig.temperature = temperature;
    }
    if (typeof topP === 'number') {
      generationConfig.topP = topP;
    }

    const result = await gemini.generateContent({
      contents,
      generationConfig,
    });

    return res.status(200).json({ reply: result?.response?.text?.() ?? '' });
  } catch (err) {
    console.error('❌ API error:', err);
    return res.status(500).json({ error: err?.message ?? 'Unexpected error' });
  }
}

