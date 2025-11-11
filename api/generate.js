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

const sanitizeImageParts = (rawImages) => {
  if (!Array.isArray(rawImages)) {
    return [];
  }

  return rawImages
    .map((image, index) => {
      if (!image) {
        return null;
      }

      const rawData = typeof image.data === 'string' ? image.data.trim() : '';
      if (!rawData) {
        return null;
      }

      const normalizedData = rawData.replace(/\s/g, '');
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedData)) {
        console.warn(`⚠️ Immagine inline #${index} non valida: caratteri base64 non conformi`);
        return null;
      }

      try {
        const decoded = Buffer.from(normalizedData, 'base64');
        if (!decoded || decoded.length === 0) {
          console.warn(`⚠️ Immagine inline #${index} ignorata: dati vuoti dopo decode`);
          return null;
        }
      } catch (error) {
        console.warn(`⚠️ Immagine inline #${index} non valida: ${error.message}`);
        return null;
      }

      const mimeType =
        typeof image.mimeType === 'string' && image.mimeType.trim().length > 0
          ? image.mimeType.trim()
          : 'image/png';

      return {
        mime_type: mimeType,
        data: normalizedData,
      };
    })
    .filter(Boolean);
};

const sanitizeParts = (rawParts) => {
  if (!Array.isArray(rawParts)) {
    return [];
  }

  const sanitizedParts = [];

  rawParts.forEach((part) => {
    if (!part || typeof part !== 'object') {
      return;
    }

    if (typeof part.text === 'string') {
      const text = part.text.trim();
      if (text.length > 0) {
        sanitizedParts.push({ text });
      }
      return;
    }

    const inlineCandidate = part.inline_data ?? part.inlineData;
    if (inlineCandidate && typeof inlineCandidate === 'object') {
      const sanitizedInline = sanitizeImageParts([
        {
          data:
            typeof inlineCandidate.data === 'string'
              ? inlineCandidate.data
              : typeof inlineCandidate.base64 === 'string'
              ? inlineCandidate.base64
              : '',
          mimeType:
            typeof inlineCandidate.mime_type === 'string' && inlineCandidate.mime_type.trim().length > 0
              ? inlineCandidate.mime_type.trim()
              : typeof inlineCandidate.mimeType === 'string' && inlineCandidate.mimeType.trim().length > 0
              ? inlineCandidate.mimeType.trim()
              : undefined,
        },
      ])[0];

      if (sanitizedInline) {
        sanitizedParts.push({ inline_data: sanitizedInline });
      }
    }
  });

  return sanitizedParts;
};

const sanitizeContents = (rawContents) => {
  if (!Array.isArray(rawContents)) {
    return [];
  }

  const sanitized = [];

  rawContents.forEach((content, index) => {
    if (!content || typeof content !== 'object') {
      return;
    }

    const role =
      typeof content.role === 'string' && content.role.trim().length > 0
        ? content.role.trim()
        : index === 0
        ? 'user'
        : 'assistant';

    const parts = sanitizeParts(content.parts);
    if (parts.length > 0) {
      sanitized.push({
        role,
        parts,
      });
    }
  });

  return sanitized;
};

const sanitizeSystemInstruction = (rawInstruction) => {
  if (!rawInstruction) {
    return null;
  }

  if (typeof rawInstruction === 'string') {
    const text = rawInstruction.trim();
    if (!text) {
      return null;
    }
    return {
      role: 'system',
      parts: [{ text }],
    };
  }

  if (typeof rawInstruction !== 'object') {
    return null;
  }

  const role =
    typeof rawInstruction.role === 'string' && rawInstruction.role.trim().length > 0
      ? rawInstruction.role.trim()
      : 'system';

  const candidateParts =
    Array.isArray(rawInstruction.parts) && rawInstruction.parts.length > 0
      ? rawInstruction.parts
      : [
          {
            text: typeof rawInstruction.text === 'string' ? rawInstruction.text : '',
          },
        ];

  const sanitizedParts = sanitizeParts(candidateParts);
  if (sanitizedParts.length === 0) {
    return null;
  }

  return {
    role,
    parts: sanitizedParts,
  };
};

const buildRequestBody = ({
  userPrompt,
  images,
  temperature,
  topP,
  maxOutputTokens,
  contents,
  systemInstruction,
}) => {
  const fallbackParts = [];

  if (typeof userPrompt === 'string' && userPrompt.trim().length > 0) {
    fallbackParts.push({ text: userPrompt.trim() });
  }

  const inlineImages = sanitizeImageParts(images);
  if (inlineImages.length > 0) {
    inlineImages.forEach((inlineImage) => {
      fallbackParts.push({
        inline_data: inlineImage,
      });
    });
  }

  let sanitizedContents = sanitizeContents(contents);

  if (sanitizedContents.length === 0) {
    if (fallbackParts.length === 0) {
      fallbackParts.push({ text: 'Hello Gemini!' });
    }
    sanitizedContents = [
      {
        role: 'user',
        parts: fallbackParts,
      },
    ];
  } else if (inlineImages.length > 0) {
    const firstUserMessage =
      sanitizedContents.find((content) => content.role === 'user') ?? sanitizedContents[0];

    if (firstUserMessage) {
      const existingInline = new Set(
        firstUserMessage.parts
          .filter((part) => part.inline_data)
          .map(
            (part) =>
              `${part.inline_data.mime_type ?? 'image/png'}-${part.inline_data.data ?? ''}`
          )
      );

      inlineImages.forEach((inlineImage) => {
        const signature = `${inlineImage.mime_type ?? 'image/png'}-${inlineImage.data ?? ''}`;
        if (!existingInline.has(signature)) {
          firstUserMessage.parts.push({
            inline_data: inlineImage,
          });
          existingInline.add(signature);
        }
      });
    }
  }

  const requestBody = {
    contents: sanitizedContents,
    generationConfig: {
      temperature: typeof temperature === 'number' ? temperature : 0.7,
      topP: typeof topP === 'number' ? topP : 0.9,
      maxOutputTokens:
        typeof maxOutputTokens === 'number' && Number.isFinite(maxOutputTokens)
          ? maxOutputTokens
          : 1024,
    },
  };

  const sanitizedSystemInstruction = sanitizeSystemInstruction(systemInstruction);
  if (sanitizedSystemInstruction) {
    requestBody.systemInstruction = sanitizedSystemInstruction;
  }

  return requestBody;
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
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .join('\n')
      ?.trim() ?? 'Nessuna risposta generata';

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
    const {
      model,
      userPrompt,
      images,
      temperature,
      top_p: topP,
      maxOutputTokens,
      contents,
      systemInstruction,
    } = parseBody(req.body);

    const accessToken = await getAccessToken();

    const requestedModel =
      typeof model === 'string' && model.trim().length > 0 ? model.trim() : DEFAULT_MODEL;

    const requestBody = buildRequestBody({
      userPrompt,
      images,
      temperature,
      topP,
      maxOutputTokens,
      contents,
      systemInstruction,
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

