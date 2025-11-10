import crypto from 'node:crypto';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const GOOGLE_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';
const GOOGLE_SERVICE_ACCOUNT_SCOPE = 'https://www.googleapis.com/auth/generative-language';

const ALLOWED_ORIGINS = [
  'https://ai-app-vert-chi.vercel.app',
  'https://ai-88rcx293y-giovannim-makers-projects.vercel.app',
  'https://ai-6zj5iktzo-giovannim-makers-projects.vercel.app',
  'https://ai-z0a43mww7-giovannim-makers-projects.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
];

console.log(
  'GOOGLE_SERVICE_ACCOUNT available:',
  Boolean(process.env.GOOGLE_SERVICE_ACCOUNT)
);

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

let cachedServiceAccount = null;
let cachedAccessToken = null;
let cachedAccessTokenExpiry = 0;

const base64UrlEncode = (input) =>
  Buffer.from(typeof input === 'string' ? input : JSON.stringify(input))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const loadServiceAccount = () => {
  if (cachedServiceAccount) {
    return cachedServiceAccount;
  }

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT environment variable');
  }

  try {
    cachedServiceAccount = JSON.parse(raw);
    return cachedServiceAccount;
  } catch (error) {
    throw new Error(`Invalid GOOGLE_SERVICE_ACCOUNT JSON: ${error.message}`);
  }
};

const getAccessToken = async () => {
  const serviceAccount = loadServiceAccount();
  const nowInSeconds = Math.floor(Date.now() / 1000);

  if (cachedAccessToken && cachedAccessTokenExpiry - 60 > nowInSeconds) {
    return cachedAccessToken;
  }

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    scope: GOOGLE_SERVICE_ACCOUNT_SCOPE,
    aud: serviceAccount.token_uri,
    exp: nowInSeconds + 3600,
    iat: nowInSeconds,
  };

  if (!serviceAccount.private_key || !serviceAccount.client_email || !serviceAccount.token_uri) {
    throw new Error('Service account JSON missing required fields');
  }

  const headerSegment = base64UrlEncode(header);
  const payloadSegment = base64UrlEncode(payload);
  const signingInput = `${headerSegment}.${payloadSegment}`;

  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signingInput)
    .sign(serviceAccount.private_key, 'base64');

  const assertion = `${signingInput}.${signature
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')}`;

  const tokenResponse = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!tokenResponse.ok) {
    const errorPayload = await tokenResponse.text();
    throw new Error(
      `Failed to exchange service account JWT for access token (${tokenResponse.status}): ${errorPayload}`
    );
  }

  const tokenJson = await tokenResponse.json();
  const accessToken = tokenJson?.access_token;
  const expiresIn = tokenJson?.expires_in ?? 3600;

  if (!accessToken) {
    throw new Error('Access token missing in token response');
  }

  cachedAccessToken = accessToken;
  cachedAccessTokenExpiry = nowInSeconds + Math.min(expiresIn, 3600);

  return accessToken;
};

const callGeminiRest = async ({ modelId, requestBody, accessToken }) => {
  const endpoint = `${GOOGLE_API_ENDPOINT}/models/${encodeURIComponent(modelId)}:generateContent`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
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

    const accessToken = await getAccessToken();

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
      accessToken,
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
        accessToken,
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

