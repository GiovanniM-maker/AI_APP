import { GoogleGenerativeAI } from '@google/generative-ai';

const formatMessages = (messages = []) =>
  Array.isArray(messages)
    ? messages
        .filter((message) => typeof message?.role === 'string')
        .map((message) => {
          const parts = [];

          if (typeof message?.content === 'string' && message.content.trim().length > 0) {
            parts.push({ text: message.content });
          }

          if (typeof message?.imageBase64 === 'string' && message.imageBase64.trim().length > 0) {
            parts.push({
              inlineData: {
                mimeType: 'image/png',
                data: message.imageBase64,
              },
            });
          }

          return {
            role: message.role,
            parts: parts.length > 0 ? parts : [{ text: '' }],
          };
        })
    : [];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const {
      model,
      messages,
      temperature,
      top_p: topP,
      imageBase64,
      max_output_tokens: maxOutputTokensLegacy,
      maxOutputTokens,
    } = req.body ?? {};

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('Missing GOOGLE_API_KEY');
    }

    const selectedModel = typeof model === 'string' && model.trim().length > 0 ? model.trim() : 'gemini-2.5-flash';

    const genAI = new GoogleGenerativeAI(apiKey);
    const gemini = genAI.getGenerativeModel({ model: selectedModel });

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
    const resolvedMaxTokens =
      typeof maxOutputTokens === 'number'
        ? maxOutputTokens
        : typeof maxOutputTokensLegacy === 'number'
        ? maxOutputTokensLegacy
        : undefined;

    if (typeof resolvedMaxTokens === 'number' && Number.isFinite(resolvedMaxTokens)) {
      generationConfig.maxOutputTokens = resolvedMaxTokens;
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

