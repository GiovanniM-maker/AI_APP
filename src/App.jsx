import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { getApps } from 'firebase/app';
import Login from './components/Login.jsx';
import Chat from './components/Chat.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  auth,
  db,
  storage,
  getBucketStorage,
  STORAGE_BUCKET_CANDIDATES,
  storageBucket as primaryStorageBucket,
} from './firebase.js';
import { DEFAULT_MODEL, MODEL_OPTIONS, getModelMeta } from './constants/models.js';

const normalizeImages = (rawImages) => {
  if (!Array.isArray(rawImages)) {
    return [];
  }

  return rawImages
    .map((image) => {
      if (!image || typeof image !== 'object') {
        return null;
      }

      const mimeType =
        typeof image?.mimeType === 'string' && image.mimeType.trim().length > 0
          ? image.mimeType.trim()
          : typeof image?.mime_type === 'string' && image.mime_type.trim().length > 0
          ? image.mime_type.trim()
          : 'image/png';

      const name = typeof image?.name === 'string' ? image.name : '';

      const url = typeof image?.url === 'string' ? image.url.trim() : '';
      if (url) {
        return {
          url,
          mimeType,
          name,
        };
      }

      const size =
        typeof image?.size === 'number' && Number.isFinite(image.size) ? image.size : undefined;

      const data = typeof image?.data === 'string' ? image.data.trim() : '';
      if (data) {
        return {
          data,
          mimeType,
          name,
          ...(size !== undefined ? { size } : {}),
        };
      }

      const previewUrl =
        typeof image?.previewUrl === 'string' && image.previewUrl.trim().length > 0
          ? image.previewUrl.trim()
          : '';
      if (previewUrl) {
        return {
          previewUrl,
          mimeType,
          name,
          ...(size !== undefined ? { size } : {}),
        };
      }

      return {
        mimeType,
        name,
        ...(size !== undefined ? { size } : {}),
      };
    })
    .filter(Boolean);
};

const estimateBase64Bytes = (base64) => {
  if (typeof base64 !== 'string' || base64.length === 0) {
    return 0;
  }
  const sanitized = base64.replace(/=+$/, '');
  return Math.floor((sanitized.length * 3) / 4);
};

const MAX_FIRESTORE_INLINE_BYTES = 900_000;

const collectImages = (rawImages, rawParts) => {
  const normalizedImages = normalizeImages(rawImages).filter(
    (image) => typeof image?.data === 'string' && image.data.trim().length > 0
  );

  const imagesFromParts = Array.isArray(rawParts)
    ? rawParts
        .map((part) => {
          if (!part || typeof part !== 'object' || part.type !== 'image') {
            return null;
          }
          const data = typeof part.data === 'string' ? part.data.trim() : '';
          if (!data) {
            return null;
          }
          const mimeType =
            typeof part.mimeType === 'string' && part.mimeType.trim().length > 0
              ? part.mimeType.trim()
              : 'image/png';
          const name = typeof part.name === 'string' ? part.name : '';
          const size =
            typeof part.size === 'number' && Number.isFinite(part.size) ? part.size : undefined;

          return {
            data,
            mimeType,
            name,
            ...(size !== undefined ? { size } : {}),
          };
        })
        .filter(Boolean)
    : [];

  const combined = [...normalizedImages, ...imagesFromParts];
  if (combined.length === 0) {
    return [];
  }

  const unique = [];
  const seen = new Set();

  combined.forEach((image) => {
    const data = typeof image?.data === 'string' ? image.data.trim() : '';
    if (!data) {
      return;
    }
    const mimeType =
      typeof image?.mimeType === 'string' && image.mimeType.trim().length > 0
        ? image.mimeType.trim()
        : 'image/png';
    const signature = `${mimeType}-${data}`;
    if (seen.has(signature)) {
      return;
    }
    seen.add(signature);

    const name = typeof image?.name === 'string' ? image.name : '';
    const size =
      typeof image?.size === 'number' && Number.isFinite(image.size) ? image.size : undefined;

    unique.push({
      data,
      mimeType,
      name,
      ...(size !== undefined ? { size } : {}),
    });
  });

  return unique;
};

const buildGeminiParts = ({ content, sanitizedImages, rawParts }) => {
  const parts = [];

  if (Array.isArray(rawParts)) {
    rawParts.forEach((part) => {
      if (!part || typeof part !== 'object') {
        return;
      }

      if (part.type === 'text') {
        const text = typeof part.text === 'string' ? part.text.trim() : '';
        if (text.length > 0) {
          parts.push({ text });
        }
        return;
      }

      if (part.type === 'image') {
        const data = typeof part.data === 'string' ? part.data.trim() : '';
        if (!data) {
          return;
        }
        const mimeTypeCandidate =
          typeof part.mimeType === 'string' && part.mimeType.trim().length > 0
            ? part.mimeType.trim()
            : null;
        const sanitizedMatch = sanitizedImages.find((image) => image.data === data);
        const mimeType = mimeTypeCandidate || sanitizedMatch?.mimeType || 'image/png';

        parts.push({
          inline_data: {
            mime_type: mimeType,
            data,
          },
        });
      }
    });
  }

  const trimmedContent = typeof content === 'string' ? content.trim() : '';
  const hasTextPart = parts.some((part) => typeof part.text === 'string' && part.text.length > 0);

  if (trimmedContent && !hasTextPart) {
    parts.unshift({ text: trimmedContent });
  }

  sanitizedImages.forEach((image) => {
    const alreadyIncluded = parts.some(
      (part) =>
        part.inline_data &&
        part.inline_data.data === image.data &&
        part.inline_data.mime_type === (image.mimeType ?? 'image/png')
    );
    if (!alreadyIncluded) {
      parts.push({
        inline_data: {
          mime_type: image.mimeType ?? 'image/png',
          data: image.data,
        },
      });
    }
  });

  if (parts.length === 0) {
    parts.push({ text: 'Hello Gemini!' });
  }

  return parts;
};

const randomId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

const sanitizeExtension = (fileName) => {
  if (typeof fileName !== 'string' || fileName.trim().length === 0) {
    return 'bin';
  }
  const rawExt = fileName.split('.').pop();
  if (!rawExt) {
    return 'bin';
  }
  const normalized = rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return normalized || 'bin';
};

const uploadAttachmentsToStorage = async (attachments, userId, onStatusChange) => {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  const results = [];

  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    const file = attachment?.file;
    const attachmentId =
      typeof attachment?.id === 'string' && attachment.id.trim().length > 0
        ? attachment.id
        : `${index}`;
    const isFileAvailable = typeof File !== 'undefined';

    if (!file || (isFileAvailable && !(file instanceof File))) {
      continue;
    }

    const mimeType =
      typeof attachment?.mimeType === 'string' && attachment.mimeType.trim().length > 0
        ? attachment.mimeType.trim()
        : file.type || 'image/jpeg';

    const extension = sanitizeExtension(file.name);
    let succeeded = false;
    let lastError = null;
    let lastClassification = 'unknown';

    for (const bucket of DEFAULT_STORAGE_CANDIDATES) {
      const trimmedBucket = typeof bucket === 'string' ? bucket.trim() : '';
      if (!trimmedBucket) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const statusPayload = { bucket: trimmedBucket };

      try {
        let attempt = 0;
        const MAX_UPLOAD_RETRIES = 3;

        while (attempt < MAX_UPLOAD_RETRIES) {
          attempt += 1;
          if (attempt === 1) {
            onStatusChange?.(attachmentId, 'uploading', { ...statusPayload, attempt });
          }

          try {
            const storageInstance =
              trimmedBucket === primaryStorageBucket ? storage : getBucketStorage(trimmedBucket);
            const storagePath = `uploads/${userId}/${Date.now()}-${index}-${randomId()}.${extension}`;
            const storageRef = ref(storageInstance, storagePath);

            await uploadBytes(storageRef, file, {
              contentType: mimeType,
            });

            const url = await getDownloadURL(storageRef);
            const record = {
              url,
              mimeType,
              name: attachment?.name ?? file.name ?? '',
              size: typeof file.size === 'number' ? file.size : undefined,
              bucket: trimmedBucket,
            };

            results.push(record);
            onStatusChange?.(attachmentId, 'success', { ...statusPayload, url });
            console.log('[UPLOAD OK]', url);
            succeeded = true;
            lastError = null;
            lastClassification = 'success';
            break;
          } catch (error) {
            lastError = error;
            lastClassification = classifyStorageError(error);
            const isFetchError =
              error instanceof TypeError ||
              (typeof error?.message === 'string' && error.message.includes('Failed to fetch'));
            const isCors =
              lastClassification === 'cors' || error?.code === 'storage/unauthorized';
            const isRetryable = isCors || lastClassification === 'network' || isFetchError;

            console.error(
              `[ERROR] Upload fallito su ${trimmedBucket} [${lastClassification}]`,
              error
            );

            if (isRetryable && attempt < MAX_UPLOAD_RETRIES) {
              console.warn(
                `[UPLOAD RETRY] Tentativo ${attempt + 1} dopo errore ${lastClassification} su ${trimmedBucket}`
              );
              onStatusChange?.(attachmentId, 'retrying', {
                ...statusPayload,
                attempt: attempt + 1,
                error,
              });
              await wait(3000);
              continue;
            }

            if (isCors) {
              console.warn(
                `[UPLOAD RETRY] Passo al prossimo bucket dopo errore CORS su ${trimmedBucket}`
              );
              onStatusChange?.(attachmentId, 'retrying', {
                ...statusPayload,
                attempt: attempt + 1,
                error,
              });
              break;
            }

            onStatusChange?.(attachmentId, 'error', { ...statusPayload, error });
            throw error;
          }
        }

        if (succeeded) {
          break;
        }
      } catch (error) {
        lastError = error;
        lastClassification = classifyStorageError(error);
        onStatusChange?.(attachmentId, 'error', { ...statusPayload, error });
        throw error;
      }
    }

    if (!succeeded) {
      if (lastError) {
        onStatusChange?.(attachmentId, 'error', { error: lastError });
        throw lastError;
      } else {
        const genericError = new Error('Upload fallito su tutti i bucket disponibili.');
        onStatusChange?.(attachmentId, 'error', { error: genericError });
        throw genericError;
      }
    }
  }

  return results;
};

const mapImagesForUi = (images) =>
  (Array.isArray(images) ? images : [])
    .map((image) => {
      const url = typeof image?.url === 'string' ? image.url.trim() : '';
      if (!url) {
        return null;
      }

      const mimeType =
        typeof image?.mimeType === 'string' && image.mimeType.trim().length > 0
          ? image.mimeType.trim()
          : 'image/png';

      const uiImage = {
        url,
        mimeType,
        name: image?.name ?? '',
      };

      if (typeof image?.size === 'number' && Number.isFinite(image.size)) {
        uiImage.size = image.size;
      }

      return uiImage;
    })
    .filter(Boolean);

const mapImagesForStorage = (images) =>
  (Array.isArray(images) ? images : [])
    .map((image) => {
      const url = typeof image?.url === 'string' ? image.url.trim() : '';
      if (!url) {
        return null;
      }

      const mimeType =
        typeof image?.mimeType === 'string' && image.mimeType.trim().length > 0
          ? image.mimeType.trim()
          : typeof image?.mime_type === 'string' && image.mime_type.trim().length > 0
          ? image.mime_type.trim()
          : '';

      const payload = {
        url,
        ...(mimeType ? { mime_type: mimeType } : {}),
      };

      if (typeof image?.name === 'string' && image.name.trim().length > 0) {
        payload.name = image.name.trim();
      }

      if (typeof image?.size === 'number' && Number.isFinite(image.size)) {
        payload.size = image.size;
      }

      return payload;
    })
    .filter(Boolean);

const serializeMessagesForStorage = (messages) =>
  (Array.isArray(messages) ? messages : []).map((message) => ({
    ...message,
    images: mapImagesForStorage(message?.images),
    imageBase64: null,
  }));

const DEFAULT_SETTINGS = {
  model: DEFAULT_MODEL,
  temperature: 0.8,
  topP: 0.9,
  instructions: '',
};

const DEFAULT_STORAGE_CANDIDATES = Array.from(
  new Set([
    'auiki-x-eataly.firebasestorage.app',
    'auiki-x-eataly.appspot.com',
    ...(Array.isArray(STORAGE_BUCKET_CANDIDATES) ? STORAGE_BUCKET_CANDIDATES : []),
  ])
);

const corsTestCache = new Map();
const CORS_CACHE_TTL = 60_000;

const wait = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const testFirebaseCors = async (bucketHost) => {
  const cacheKey = bucketHost || 'default';
  const cached = corsTestCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CORS_CACHE_TTL) {
    return cached.ok;
  }

  const endpoint = `https://firebasestorage.googleapis.com/v0/b/${bucketHost}/o`;

  try {
    const response = await fetch(endpoint, {
      method: 'OPTIONS',
      mode: 'cors',
    });

    const allowOrigin = response.headers.get('access-control-allow-origin');
    const ok = response.ok && Boolean(allowOrigin);

    if (ok) {
      console.log(`[CORS TEST] Firebase Storage attivo ✅ (${bucketHost})`);
    } else {
      console.warn(`[CORS TEST] Firebase Storage non attivo ❌ (${bucketHost})`, {
        status: response.status,
        allowOrigin,
      });
    }

    corsTestCache.set(cacheKey, { ok, timestamp: now });
    return ok;
  } catch (error) {
    console.error(`[CORS TEST] Firebase Storage (${bucketHost}) fallito ❌`, error);
    corsTestCache.set(cacheKey, { ok: false, timestamp: now });
    return false;
  }
};

const isLikelyCorsError = (error) => {
  if (!error) {
    return false;
  }

  const code = typeof error?.code === 'string' ? error.code.toLowerCase() : '';
  if (code.includes('cors')) {
    return true;
  }

  if (code === 'storage/unauthorized' || code === 'storage/retry-limit-exceeded') {
    return true;
  }

  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  if (!message) {
    return false;
  }

  const corsIndicators = [
    'cors',
    'no access-control-allow-origin',
    'blocked by cors policy',
    'preflight',
    'cross-origin',
    'permission denied',
  ];

  return corsIndicators.some((indicator) => message.includes(indicator));
};

const classifyStorageError = (error) => {
  if (!error) {
    return 'unknown';
  }
  if (isLikelyCorsError(error)) {
    return 'cors';
  }
  const code = typeof error?.code === 'string' ? error.code.toLowerCase() : '';
  if (code.includes('unauthorized')) {
    return 'auth';
  }
  if (
    code.includes('retry-limit-exceeded') ||
    code.includes('canceled') ||
    code.includes('timeout')
  ) {
    return 'network';
  }
  return 'unknown';
};

function App() {
  const [user, setUser] = useState(null);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const chatsListenerRef = useRef(null);
  const streamingTimerRef = useRef(null);
  const debugLoggedRef = useRef(false);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [chats, activeChatId]
  );

  const selectedModelMeta = useMemo(() => getModelMeta(settings.model), [settings.model]);

  useEffect(() => {
    if (debugLoggedRef.current) {
      return;
    }
    debugLoggedRef.current = true;

    try {
      const envKeys = Object.keys(import.meta.env ?? {}).sort();
      let firebaseApps = [];

      try {
        firebaseApps = getApps();
      } catch (firebaseError) {
        console.error(
          '%c[Debug] Firebase getApps() failed',
          'color:#ef4444;font-weight:bold;',
          firebaseError
        );
      }

      console.groupCollapsed(
        '%c[Gemini Debug] App bootstrap diagnostics',
        'color:#6366f1;font-weight:bold;'
      );
      console.info('%c✓ App loaded', 'color:#10b981;font-weight:bold;', new Date().toISOString());

      console.group('%cEnvironment variables (import.meta.env)', 'color:#0ea5e9;font-weight:bold;');
      envKeys.forEach((key) => {
        if (typeof key !== 'string') return;
        const isDefined = import.meta.env[key] !== undefined && import.meta.env[key] !== null;
        console.log(
          '%c%s%c %s',
          'color:#475569;font-weight:500;',
          key,
          'color:#94a3b8;margin-left:8px;',
          isDefined ? '✅ definita' : '❌ non definita'
        );
      });
      console.groupEnd();

      console.group('%cFirebase', 'color:#f97316;font-weight:bold;');
      console.log(
        '%cgetApps().length%c %d (%s)',
        'color:#475569;font-weight:500;',
        'color:#94a3b8;margin-left:8px;',
        firebaseApps.length,
        firebaseApps.length > 0 ? '✅ inizializzato' : '⚠️ nessuna app'
      );
      console.groupEnd();

      console.group('%cRuntime info', 'color:#22c55e;font-weight:bold;');
      const href =
        typeof window !== 'undefined' && window?.location?.href
          ? window.location.href
          : 'N/D';
      console.log('%cwindow.location.href%c %s', 'color:#475569;font-weight:500;', 'color:#94a3b8;', href);
      console.log(
        '%cprocess.env.NODE_ENV%c %s',
        'color:#475569;font-weight:500;',
        'color:#94a3b8;',
        typeof process !== 'undefined' ? process.env?.NODE_ENV ?? 'N/D' : 'process non definito'
      );
      console.log(
        '%cimport.meta.env.MODE%c %s',
        'color:#475569;font-weight:500;',
        'color:#94a3b8;',
        import.meta.env?.MODE ?? 'N/D'
      );
      console.groupEnd();
      console.groupEnd();
    } catch (err) {
      console.error('%c[Debug] Bootstrap diagnostics failed', 'color:#ef4444;font-weight:bold;', err);
    }
  }, []);

  const resetStreaming = useCallback(() => {
    if (streamingTimerRef.current) {
      clearInterval(streamingTimerRef.current);
      streamingTimerRef.current = null;
    }
    setStreamingText('');
  }, []);

  const simulateStreaming = useCallback(
    (text) =>
      new Promise((resolve) => {
        resetStreaming();

        if (!text) {
          resolve();
          return;
        }

        let index = 0;
        const chunk = Math.max(1, Math.round(text.length / 60));

        streamingTimerRef.current = setInterval(() => {
          index = Math.min(text.length, index + chunk);
          setStreamingText(text.slice(0, index));

          if (index >= text.length) {
            if (streamingTimerRef.current) {
              clearInterval(streamingTimerRef.current);
              streamingTimerRef.current = null;
            }
            resolve();
          }
        }, 25);
      }),
    [resetStreaming]
  );

  useEffect(
    () => () => {
      if (streamingTimerRef.current) {
        clearInterval(streamingTimerRef.current);
      }
      chatsListenerRef.current?.();
    },
    []
  );

  const loadUserPreferences = useCallback(async (uid) => {
    try {
      const userDocRef = doc(db, 'users', uid);
      const snapshot = await getDoc(userDocRef);

      if (snapshot.exists()) {
        const data = snapshot.data();
        const preferences = data?.preferences ?? {};
        setSettings((prev) => ({
          ...prev,
          ...DEFAULT_SETTINGS,
          ...preferences,
        }));
      } else {
        setSettings(DEFAULT_SETTINGS);
      }
    } catch (err) {
      console.error('Impossibile caricare le preferenze utente', err);
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setIsSettingsLoaded(true);
    }
  }, []);

  const subscribeToChats = useCallback((uid) => {
    chatsListenerRef.current?.();

    const chatsQuery = query(
      collection(db, 'chats'),
      where('userId', '==', uid),
      orderBy('updatedAt', 'desc')
    );

    chatsListenerRef.current = onSnapshot(
      chatsQuery,
      (snapshot) => {
        const nextChats = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const messages = Array.isArray(data?.messages)
            ? data.messages.map((message) => ({
                role: message?.role ?? 'user',
                content: message?.content ?? '',
                timestamp: message?.timestamp ?? Date.now(),
                images: normalizeImages(message?.images),
                imageBase64:
                  typeof message?.imageBase64 === 'string' && message.imageBase64.trim().length > 0
                    ? message.imageBase64.trim()
                    : null,
              }))
            : [];

          return {
            id: docSnap.id,
            title: data?.title ?? 'Nuova chat',
            messages,
            updatedAt: data?.updatedAt?.toMillis?.() ?? Date.now(),
          };
        });

        setChats(nextChats);
        setActiveChatId((prev) => {
          if (prev && nextChats.some((chat) => chat.id === prev)) {
            return prev;
          }
          return nextChats[0]?.id ?? null;
        });
      },
      (err) => {
        console.error('Errore nel recupero delle chat', err);
      }
    );
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setError(null);

      if (currentUser) {
        loadUserPreferences(currentUser.uid);
        subscribeToChats(currentUser.uid);
      } else {
        chatsListenerRef.current?.();
        setChats([]);
        setActiveChatId(null);
        setSettings(DEFAULT_SETTINGS);
        setIsSettingsLoaded(false);
      }
    });

    return unsubscribe;
  }, [loadUserPreferences, subscribeToChats]);

  useEffect(() => {
    if (!user || !isSettingsLoaded) {
      return undefined;
    }

      const timeout = setTimeout(() => {
      const userDocRef = doc(db, 'users', user.uid);
      setDoc(
        userDocRef,
        {
          preferences: {
            model: settings.model,
            temperature: settings.temperature,
            topP: settings.topP,
            instructions: settings.instructions,
          },
        },
        { merge: true }
      ).catch((err) => {
        console.error('Impossibile salvare le preferenze', err);
      });
    }, 500);

    return () => clearTimeout(timeout);
  }, [settings, user, isSettingsLoaded]);

  const handleEmailAuth = useCallback(async (email, password, mode) => {
    setIsAuthenticating(true);
    try {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    setIsAuthenticating(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    await signOut(auth);
    resetStreaming();
  }, [resetStreaming]);

  const ensureChatExists = useCallback(
    async (currentChatId, initialTitle) => {
      if (!user) return null;

      if (currentChatId) {
        return currentChatId;
      }

      const chatTitle =
        initialTitle?.trim()?.slice(0, 60) || 'Nuova chat';

      const chatPayload = {
        userId: user.uid,
        title: chatTitle,
        messages: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const chatRef = await addDoc(collection(db, 'chats'), chatPayload);
      const newChat = {
        id: chatRef.id,
        title: chatTitle,
        messages: [],
        updatedAt: Date.now(),
      };

      setChats((prev) => [newChat, ...prev.filter((chat) => chat.id !== chatRef.id)]);

      return chatRef.id;
    },
    [user]
  );

  const handleUpdateSettings = useCallback((partialSettings) => {
    setSettings((prev) => ({
      ...prev,
      ...partialSettings,
    }));
  }, []);

  const handleSelectChat = useCallback((chatId) => {
    setActiveChatId(chatId);
    resetStreaming();
    setError(null);
  }, [resetStreaming]);

  const handleStartNewChat = useCallback(async () => {
    resetStreaming();
    setError(null);
    const newChatId = await ensureChatExists(null, 'Nuova chat');
    if (newChatId) {
      setActiveChatId(newChatId);
    }
  }, [ensureChatExists, resetStreaming]);

  useEffect(() => {
    if (!error) {
      return undefined;
    }

    const timer = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleSendMessage = useCallback(
    async ({
      text: rawContent = '',
      images: rawImages = [],
      attachments: rawAttachments = [],
      parts: rawParts = [],
      onUploadStatusChange,
    }) => {
      if (!user) {
        throw new Error('Devi essere autenticato per inviare messaggi.');
      }

      const contentFromProp = typeof rawContent === 'string' ? rawContent.trim() : '';
      const firstTextPart =
        Array.isArray(rawParts) && rawParts.length > 0
          ? rawParts.find(
              (part) => part?.type === 'text' && typeof part.text === 'string' && part.text.trim()
            )
          : null;
      const derivedContent =
        contentFromProp ||
        (typeof firstTextPart?.text === 'string' ? firstTextPart.text.trim() : '');

      const sanitizedImages = collectImages(rawImages, rawParts);

      const attachmentsWithFile = Array.isArray(rawAttachments)
        ? rawAttachments.filter((attachment) => {
            if (!attachment) return false;
            if (typeof File === 'undefined') {
              return Boolean(attachment.file);
            }
            return attachment.file instanceof File;
          })
        : [];

      let uploadedImages = [];

      const inlineBytes = sanitizedImages.reduce(
        (sum, image) => sum + estimateBase64Bytes(image?.data ?? ''),
        0
      );

      if (inlineBytes > MAX_FIRESTORE_INLINE_BYTES) {
        throw new Error(
          'Le immagini selezionate sono troppo grandi per essere salvate nella chat. Riduci la risoluzione o il numero di immagini e riprova.'
        );
      }

      if (attachmentsWithFile.length > 0) {
        const corsOk = await testFirebaseCors(primaryStorageBucket);
        if (!corsOk) {
          const corsErrorMessage =
            '⚠️ Il bucket Firebase non accetta upload da questo dominio. Verifica la configurazione CORS su Firebase Storage.';
          console.warn(
            `[CORS TEST] Firebase Storage (${primaryStorageBucket}) non attivo per questo dominio.`
          );
          setError(corsErrorMessage);
          attachmentsWithFile.forEach((attachment, index) => {
            const attachmentId =
              typeof attachment?.id === 'string' && attachment.id.trim().length > 0
                ? attachment.id
                : `${index}`;
            onUploadStatusChange?.(attachmentId, 'error', {
              error: new Error(corsErrorMessage),
            });
          });
          throw new Error(corsErrorMessage);
        }

        uploadedImages = await uploadAttachmentsToStorage(
          attachmentsWithFile,
          user.uid,
          onUploadStatusChange
        );
      }

      const uiUploadedImages = mapImagesForUi(uploadedImages);

      if (!derivedContent && sanitizedImages.length === 0) {
        return;
      }

      setError(null);
      setIsGenerating(true);

      try {
        const initialTitle =
          derivedContent || (sanitizedImages.length > 0 ? 'Chat con immagini' : '');
        const chatId = await ensureChatExists(activeChatId, initialTitle);

        if (!chatId) {
          throw new Error('Impossibile creare la chat.');
        }

        setActiveChatId(chatId);

        const chatRef = doc(db, 'chats', chatId);
        const existingChat =
          chats.find((chat) => chat.id === chatId) ?? {
            id: chatId,
            title: derivedContent.slice(0, 40),
            messages: [],
          };

        const title =
          existingChat.title && existingChat.title !== 'Nuova chat'
            ? existingChat.title
            : derivedContent
            ? derivedContent.slice(0, 60)
            : 'Chat con immagini';

        const userParts = buildGeminiParts({
          content: derivedContent,
          sanitizedImages,
          rawParts,
        });

        const userMessage = {
          role: 'user',
          content: derivedContent,
          timestamp: Date.now(),
          images: uiUploadedImages,
          imageBase64: null,
        };

        const updatedMessages = [...(existingChat.messages ?? []), userMessage];

        setChats((prevChats) => {
          const others = prevChats.filter((chatItem) => chatItem.id !== chatId);
          return [
            {
              id: chatId,
              title: title || 'Nuova chat',
              messages: updatedMessages,
              updatedAt: Date.now(),
            },
            ...others,
          ];
        });

        await setDoc(
          chatRef,
          {
            userId: user.uid,
            title: title || 'Nuova chat',
            messages: serializeMessagesForStorage(updatedMessages),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        const meta = getModelMeta(selectedModelMeta.value);
        console.log(
          '📡 Chiamata API /api/generate con metodo: POST e modello:',
          selectedModelMeta.value,
          'supportsImages:',
          meta.supportsImages
        );

        const instructionText =
          typeof settings.instructions === 'string' ? settings.instructions.trim() : '';

        const requestPayload = {
          model: selectedModelMeta.value,
          contents: [
            {
              role: 'user',
              parts: userParts,
            },
          ],
          userPrompt: derivedContent,
          images: meta.supportsImages ? sanitizedImages : [],
          temperature: settings.temperature,
          top_p: settings.topP,
          maxOutputTokens: 2048,
        };

        if (instructionText) {
          requestPayload.systemInstruction = {
            role: 'system',
            parts: [{ text: instructionText }],
          };
        }

        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestPayload),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          console.error('❌ Errore API:', response.status, errText);

          let readableMessage = 'Errore sconosciuto';
          switch (response.status) {
            case 405:
              readableMessage = 'Errore API: metodo non consentito (405). Controlla il backend.';
              break;
            case 403:
              readableMessage = 'Accesso negato o chiave API non valida (403).';
              break;
            case 429:
              readableMessage = 'Troppe richieste. Attendi qualche secondo (429).';
              break;
            case 500:
              readableMessage = 'Errore interno del server (500).';
              break;
            default:
              readableMessage = `Errore API (${response.status}).`;
          }
          setError(`⚠️ ${readableMessage}`);
          return;
        }

        const payload = await response.json();
        if (payload?.fallbackApplied && selectedModelMeta.value !== DEFAULT_MODEL) {
          setSettings((prev) => ({ ...prev, model: DEFAULT_MODEL }));
          setError('⚠️ Modello non disponibile, riuso flash-standard.');
        }

        const replyText = payload?.reply;
        if (!replyText) {
          throw new Error('La risposta del modello è vuota o non valida.');
        }

        console.log('✅ Risposta API:', payload);
        await simulateStreaming(replyText);

        const assistantMessage = {
          role: 'assistant',
          content: replyText || 'Nessuna risposta dal modello.',
          timestamp: Date.now(),
        };

        const finalMessages = [...updatedMessages, assistantMessage];

        setChats((prevChats) => {
          const others = prevChats.filter((chatItem) => chatItem.id !== chatId);
          return [
            {
              id: chatId,
              title: title || 'Nuova chat',
              messages: finalMessages,
              updatedAt: Date.now(),
            },
            ...others,
          ];
        });

        await setDoc(
          chatRef,
          {
            messages: serializeMessagesForStorage(finalMessages),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        resetStreaming();
      } catch (err) {
        const category = classifyStorageError(err);
        console.error(`❌ Errore di rete o durante la generazione [${category}]:`, err);

        if (category === 'cors') {
          setError('⚠️ Errore upload (probabile CORS non configurato su Firebase)');
        } else if (category === 'auth') {
          setError('⚠️ Permessi insufficienti su Firebase Storage. Controlla le regole e l’API key.');
        } else if (category === 'network') {
          setError('⚠️ Errore di rete con Firebase Storage. Controlla la connessione e riprova.');
        } else {
          const fallbackMessage = 'Errore di connessione. Riprova tra poco.';
          const friendlyMessage =
            typeof err?.message === 'string' && err.message.trim().length > 0
              ? err.message
              : fallbackMessage;
          setError(`⚠️ ${friendlyMessage}`);
        }

        resetStreaming();
      } finally {
        setIsGenerating(false);
      }
    },
    [user, activeChatId, ensureChatExists, chats, settings, simulateStreaming, resetStreaming]
  );

  if (!user) {
    return (
      <>
        <div className="bg-emerald-50 px-4 py-2 text-center text-xs font-semibold text-emerald-600">
          App caricata ✅ — controlla la console del browser per il debug log.
        </div>
        <Login
          onEmailAuth={handleEmailAuth}
          onGoogleSignIn={handleGoogleSignIn}
          isLoading={isAuthenticating}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-emerald-50 px-4 py-2 text-center text-xs font-semibold text-emerald-600">
        App caricata ✅ — controlla la console del browser per il debug log.
      </div>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Gemini Chat Workspace</h1>
            <p className="text-sm text-slate-500">
              Connesso come{' '}
              <span className="font-semibold text-slate-700">
                {user.displayName || user.email}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleStartNewChat}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-emerald-300 hover:text-emerald-600"
            >
              Nuova chat
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-80px)] max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[260px_1fr_300px]">
        <aside className="hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex lg:flex-col">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Le tue chat</h2>
            <span className="text-xs font-medium text-slate-400">
              {chats.length}
            </span>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto">
            {chats.length === 0 ? (
              <p className="text-xs text-slate-400">Nessuna chat ancora. Creane una nuova!</p>
            ) : (
              chats.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => handleSelectChat(chat.id)}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                    chat.id === activeChatId
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <p className="font-medium">{chat.title || 'Nuova chat'}</p>
                  <p className="line-clamp-2 text-xs text-slate-400">
                    {chat.messages?.[chat.messages.length - 1]?.content ||
                      'Ancora nessun messaggio'}
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="lg:col-span-1">
          <Chat
            chat={activeChat}
            onSendMessage={handleSendMessage}
            onStartNewChat={handleStartNewChat}
            isGenerating={isGenerating}
            streamingText={streamingText}
            error={error}
            supportsImages={selectedModelMeta.supportsImages}
          />
        </div>

        <SettingsPanel
          settings={settings}
          onUpdate={handleUpdateSettings}
          disabled={isGenerating}
        />
      </main>
    </div>
  );
}

export default App;

