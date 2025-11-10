const DEFAULT_MODEL = 'gemini-2.5-flash';
const GOOGLE_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

const ALLOWED_ORIGINS = [
  'https://ai-app-vert-chi.vercel.app',
  'https://ai-88rcx293y-giovannim-makers-projects.vercel.app',
  'https://ai-6zj5iktzo-giovannim-makers-projects.vercel.app',
  'https://ai-z0a43mww7-giovannim-makers-projects.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
];

const applyCorsHeaders = (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (ALLOWED_ORIGINS.length > 0) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }
  res.setHeader('Vary', 'Origin');
};

const parseBody = (body) => {
  if (!body) {
    return {};
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (error) {
      console.warn('⚠️ Impossibile parsare il body della richiesta:', error);
      return {};
    }
  }

  return body;
};

const buildRequestBody = ({ userPrompt, imageBase64, temperature, topP, maxOutputTokens }) => {
  const parts = [];

  if (typeof userPrompt === 'string' && userPrompt.trim().length > 0) {
    parts.push({ text: userPrompt.trim() });
  }

  if (typeof imageBase64 === 'string' && imageBase64.trim().length > 0) {
    parts.push({
      inline_data: {
        mime_type: 'image/png',
        data: imageBase64.trim(),
      },
    });
  }

  if (parts.length === 0) {
    parts.push({ text: 'Hello Gemini!' });
  }

  return {
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    generationConfig: {
      temperature: typeof temperature === 'number' ? temperature : 0.7,
      topP: typeof topP === 'number' ? topP : 0.9,
      maxOutputTokens:
        typeof maxOutputTokens === 'number' && Number.isFinite(maxOutputTokens)
          ? maxOutputTokens
          : 1024,
    },
  };
};

const callGeminiRest = async ({ modelId, requestBody, apiKey }) => {
  const endpoint = `${GOOGLE_API_ENDPOINT}/models/${encodeURIComponent(modelId)}:generateContent`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: data?.error?.message ?? `Gemini API returned ${response.status}`,
    };
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.find((part) => typeof part?.text === 'string')?.text ??
    'Nessuna risposta generata';

  return {
    ok: true,
    text,
    raw: data,
  };
};

export default async function handler(req, res) {
  applyCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { model, userPrompt, imageBase64, temperature, top_p: topP, maxOutputTokens } =
      parseBody(req.body);

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing GOOGLE_API_KEY' });
    }

    const requestedModel =
      typeof model === 'string' && model.trim().length > 0 ? model.trim() : DEFAULT_MODEL;

    const requestBody = buildRequestBody({
      userPrompt,
      imageBase64,
      temperature,
      topP,
      maxOutputTokens,
    });

    const result = await callGeminiRest({
      modelId: requestedModel,
      requestBody,
      apiKey,
    });

    if (result.ok) {
      return res.status(200).json({
        reply: result.text,
        modelUsed: requestedModel,
        fallbackApplied: false,
      });
    }

    const isModelUnavailable =
      result.status === 404 ||
      result.status === 400 ||
      /model/i.test(result.message ?? '') ||
      /not\s+found/i.test(result.message ?? '');

    if (requestedModel !== DEFAULT_MODEL && isModelUnavailable) {
      console.warn(
        `⚠️ Modello ${requestedModel} non disponibile (${result.status}). Fallback a ${DEFAULT_MODEL}`
      );

      const fallback = await callGeminiRest({
        modelId: DEFAULT_MODEL,
        requestBody,
        apiKey,
      });

      if (fallback.ok) {
        return res.status(200).json({
          reply: fallback.text,
          modelUsed: DEFAULT_MODEL,
          fallbackApplied: true,
        });
      }

      console.error(
        `❌ Fallback a ${DEFAULT_MODEL} fallito`,
        fallback.status,
        fallback.message
      );
      return res.status(fallback.status ?? 500).json({
        error: fallback.message ?? 'Errore durante il fallback del modello',
      });
    }

    return res.status(result.status ?? 500).json({
      error: result.message ?? 'Errore sconosciuto dal modello',
    });
  } catch (err) {
    console.error('❌ API Gemini error:', err);
    return res.status(500).json({ error: err?.message ?? 'Unexpected error' });
  }
}

