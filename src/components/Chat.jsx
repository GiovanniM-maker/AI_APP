import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function formatTime(timestamp) {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (error) {
    return '';
  }
}

const MAX_IMAGE_INLINE_BYTES = 900_000;
const MAX_IMAGE_DIMENSIONS = [1600, 1280, 1024, 720, 512];
const JPEG_QUALITY_STEPS = [0.88, 0.75, 0.65, 0.5];
const SESSION_STORAGE_KEY = 'chat.pendingAttachments';

const base64ToFile = (base64, fileName, mimeType) => {
  try {
    if (typeof window === 'undefined' || typeof atob !== 'function') {
      return null;
    }
    const binaryString = atob(base64);
    const length = binaryString.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const safeName =
      typeof fileName === 'string' && fileName.trim().length > 0
        ? fileName.trim()
        : `attachment-${Date.now()}.png`;
    const type =
      typeof mimeType === 'string' && mimeType.trim().length > 0 ? mimeType.trim() : 'image/png';

    if (typeof File === 'function') {
      return new File([bytes], safeName, { type });
    }
    return new Blob([bytes], { type });
  } catch (error) {
    console.warn('Impossibile ricostruire il file da base64', error);
    return null;
  }
};

const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const commaIndex = result.indexOf(',');
        resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
      } else {
        reject(new Error('Conversione immagine fallita.'));
      }
    };
    reader.onerror = () => reject(new Error('Impossibile leggere il file.'));
    reader.readAsDataURL(file);
  });

const estimateBase64Bytes = (base64) => {
  if (typeof base64 !== 'string' || base64.length === 0) {
    return 0;
  }
  const sanitized = base64.replace(/=+$/, '');
  return Math.floor((sanitized.length * 3) / 4);
};

const generateCompressedBase64 = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (!image.width || !image.height) {
        reject(new Error('Impossibile determinare le dimensioni dell’immagine.'));
        return;
      }

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Canvas non supportato dal browser.'));
        return;
      }

      context.imageSmoothingQuality = 'high';

      const originalMimeType =
        typeof file.type === 'string' && file.type.startsWith('image/')
          ? file.type
          : 'image/jpeg';

      const mimeCandidates =
        originalMimeType === 'image/png'
          ? ['image/png', 'image/jpeg']
          : [originalMimeType, 'image/jpeg'];

      const attempts = [];

      for (const maxDimension of MAX_IMAGE_DIMENSIONS) {
        const scale = Math.min(maxDimension / image.width, maxDimension / image.height, 1);
        const targetWidth = Math.max(1, Math.round(image.width * scale));
        const targetHeight = Math.max(1, Math.round(image.height * scale));

        canvas.width = targetWidth;
        canvas.height = targetHeight;
        context.clearRect(0, 0, targetWidth, targetHeight);
        context.drawImage(image, 0, 0, targetWidth, targetHeight);

        for (const mime of mimeCandidates) {
          const qualitySteps = mime === 'image/jpeg' ? JPEG_QUALITY_STEPS : [undefined];
          for (const quality of qualitySteps) {
            const dataUrl = canvas.toDataURL(mime, quality);
            const commaIndex = dataUrl.indexOf(',');
            const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
            const bytes = estimateBase64Bytes(base64);

            attempts.push({
              base64,
              bytes,
              mimeType: mime,
              width: targetWidth,
              height: targetHeight,
            });

            if (bytes <= MAX_IMAGE_INLINE_BYTES) {
              return resolve({
                data: base64,
                mimeType: mime,
                width: targetWidth,
                height: targetHeight,
              });
            }
          }
        }
      }

      const smallest =
        attempts.length > 0
          ? attempts.reduce((prev, current) => (current.bytes < prev.bytes ? current : prev))
          : null;

      if (smallest) {
        resolve({
          data: smallest.base64,
          mimeType: smallest.mimeType,
          width: smallest.width,
          height: smallest.height,
        });
        return;
      }

      reject(new Error('Impossibile comprimere l’immagine selezionata.'));
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Impossibile elaborare l’immagine selezionata.'));
    };

    image.src = objectUrl;
  });

const processImageFile = async (file) => {
  const fallbackMime =
    typeof file.type === 'string' && file.type.startsWith('image/')
      ? file.type
      : 'image/jpeg';

  try {
    if (file.size <= MAX_IMAGE_INLINE_BYTES * 0.7) {
      const data = await readFileAsBase64(file);
      const bytes = estimateBase64Bytes(data);
      if (bytes <= MAX_IMAGE_INLINE_BYTES) {
        return { data, mimeType: fallbackMime };
      }
    }

    const compressed = await generateCompressedBase64(file);
    if (compressed?.data) {
      return {
        data: compressed.data,
        mimeType: compressed.mimeType ?? fallbackMime,
      };
    }

    const fallbackData = await readFileAsBase64(file);
    return { data: fallbackData, mimeType: fallbackMime };
  } catch (error) {
    const fallbackData = await readFileAsBase64(file);
    return { data: fallbackData, mimeType: fallbackMime };
  }
};

function Chat({
  chat,
  onSendMessage,
  onStartNewChat,
  isGenerating,
  streamingText,
  error,
  supportsImages = false,
}) {
  const [input, setInput] = useState('');
  const [localError, setLocalError] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const attachmentsRef = useRef([]);

  const hasMessages = Boolean(chat?.messages?.length);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.messages, streamingText]);

  useEffect(() => {
    if (!isGenerating) {
      setLocalError('');
    }
  }, [isGenerating]);

  const orderedMessages = useMemo(() => {
    if (!chat?.messages) return [];
    return [...chat.messages].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  }, [chat?.messages]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => () => {
    attachmentsRef.current.forEach((attachment) => {
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });
  }, []);

const clearAttachments = useCallback(() => {
  setAttachments((prev) => {
    prev.forEach((attachment) => {
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });
    return [];
  });
  setIsUploading(false);
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }
}, []);

  useEffect(() => {
    if (!supportsImages && attachments.length > 0) {
      clearAttachments();
    }
  }, [supportsImages, attachments.length, clearAttachments]);

useEffect(() => {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return;
    }

    const restored = parsed
      .map((item) => {
        const mimeType =
          typeof item?.mimeType === 'string' && item.mimeType.trim().length > 0
            ? item.mimeType.trim()
            : 'image/png';
        const name = typeof item?.name === 'string' ? item.name : '';
        const data = typeof item?.data === 'string' ? item.data : '';
        if (!data) {
          return null;
        }

        const errorMessage =
          typeof item?.errorMessage === 'string' && item.errorMessage.trim().length > 0
            ? item.errorMessage.trim()
            : null;

        const fileLike = base64ToFile(data, name, mimeType);
        let file = null;
        if (fileLike instanceof File) {
          file = fileLike;
        } else if (fileLike instanceof Blob && typeof File === 'function') {
          try {
            file = new File([fileLike], name || `attachment-${Date.now()}`, { type: mimeType });
          } catch (_) {
            file = null;
          }
        }

        const previewUrl =
          file instanceof File ? URL.createObjectURL(file) : `data:${mimeType};base64,${data}`;

        return {
          id:
            typeof item?.id === 'string' && item.id.trim().length > 0
              ? item.id
              : `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file: file instanceof File ? file : null,
          name,
          mimeType,
          size:
            typeof item?.size === 'number' && Number.isFinite(item.size) ? item.size : undefined,
          data,
          previewUrl,
          status: item?.status ?? 'ready',
          lastError: errorMessage,
          isRestored: true,
        };
      })
      .filter(Boolean);

    if (restored.length > 0) {
      setAttachments(restored);
    }
  } catch (restoreError) {
    console.warn('Impossibile ripristinare gli allegati dalla sessione.', restoreError);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }
}, []);

useEffect(() => {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  if (attachments.length === 0) {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  const serializable = attachments
    .filter((attachment) => typeof attachment?.data === 'string' && attachment.data.length > 0)
    .map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      data: attachment.data,
      size: attachment.size,
      status: attachment.status ?? 'ready',
      ...(typeof attachment?.lastError === 'string' && attachment.lastError.trim().length > 0
        ? { errorMessage: attachment.lastError.trim() }
        : {}),
    }));

  if (serializable.length > 0) {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(serializable));
  } else {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }
}, [attachments]);

const updateAttachmentStatus = useCallback((attachmentId, status, metadata = {}) => {
  setAttachments((prev) =>
    prev.map((attachment) => {
      if (attachment.id !== attachmentId) {
        return attachment;
      }

      const errorMessage =
        typeof metadata?.error === 'string'
          ? metadata.error
          : metadata?.error?.message ?? null;

      return {
        ...attachment,
        status,
        ...(metadata?.url ? { uploadedUrl: metadata.url } : {}),
        lastError: errorMessage,
      };
    })
  );
}, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const trimmedText = input.trim();
    const hasText = trimmedText.length > 0;
    const hasImages = attachments.length > 0;

    if (isProcessingFiles) {
      setLocalError('Attendi il caricamento delle immagini prima di inviare.');
      return;
    }

    if (!hasText && !hasImages) {
      setLocalError('Scrivi un messaggio o allega almeno un’immagine prima di inviare.');
      return;
    }

    const messageParts = [];

    if (hasText) {
      messageParts.push({
        type: 'text',
        text: trimmedText,
      });
    }

    if (hasImages) {
      attachments.forEach(({ data, mimeType, name, size }) => {
        if (typeof data === 'string' && data.trim().length > 0) {
          messageParts.push({
            type: 'image',
            data,
            mimeType,
            name,
            size,
          });
        }
      });
    }

    try {
      let uploadStatusHandler = undefined;
      if (hasImages) {
        setAttachments((prev) =>
          prev.map((attachment) => ({
            ...attachment,
            status: 'uploading',
          lastError: null,
          }))
        );
        setIsUploading(true);

        uploadStatusHandler = (attachmentId, status, metadata) => {
          if (status === 'retrying') {
            updateAttachmentStatus(attachmentId, 'retry', metadata);
          } else {
            updateAttachmentStatus(attachmentId, status, metadata);
          }
        };
      }

      await onSendMessage?.({
        text: trimmedText,
        images: attachments.map(({ data, mimeType, name, size }) => ({
          data,
          mimeType,
          name,
          size,
        })),
        attachments: attachments.map(
          ({ id, file, name, mimeType, size, data, previewUrl }) => ({
            id,
            file,
            name,
            mimeType,
            size,
            data,
            previewUrl,
          })
        ),
        parts: messageParts,
        onUploadStatusChange: uploadStatusHandler,
      });
      if (hasImages) {
        setAttachments((prev) =>
          prev.map((attachment) => ({
            ...attachment,
            status: 'success',
            lastError: null,
          }))
        );
      }
      setTimeout(() => {
        setInput('');
        clearAttachments();
        setLocalError('');
      }, hasImages ? 500 : 0);
    } catch (err) {
      setLocalError(err?.message ?? 'Invio messaggio fallito.');
      if (hasImages) {
        setAttachments((prev) =>
          prev.map((attachment) => ({
            ...attachment,
            status: attachment.status === 'success' ? attachment.status : 'error',
            lastError:
              typeof err?.message === 'string' && err.message.trim().length > 0
                ? err.message
                : 'Errore upload',
          }))
        );
      }
    }
    setIsUploading(false);
  };

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setLocalError('Seleziona uno o più file immagine validi.');
      if (event.target) {
        event.target.value = '';
      }
      return;
    }

    setIsProcessingFiles(true);

    try {
      const upcomingAttachments = await Promise.all(
        imageFiles.map(async (file) => {
          const processed = await processImageFile(file);
          return {
            id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
            file,
            name: file.name,
            mimeType: processed.mimeType || file.type || 'image/png',
            size: file.size,
            data: processed.data,
            previewUrl: URL.createObjectURL(file),
          };
        })
      );

      setAttachments((prev) => {
        const existingSignatures = new Set(
          prev.map((item) => `${item.mimeType ?? 'image/png'}-${item.data}`)
        );
        const next = [...prev];

        upcomingAttachments.forEach((attachment) => {
          const signature = `${attachment.mimeType ?? 'image/png'}-${attachment.data}`;
          if (!existingSignatures.has(signature)) {
            existingSignatures.add(signature);
            next.push(attachment);
          } else if (attachment.previewUrl) {
            URL.revokeObjectURL(attachment.previewUrl);
          }
        });

        return next;
      });
      setLocalError('');
    } catch (conversionError) {
      setLocalError(conversionError?.message ?? 'Impossibile caricare le immagini selezionate.');
    } finally {
      setIsProcessingFiles(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleRemoveImage = useCallback((attachmentId) => {
    setAttachments((prev) => {
      const toRemove = prev.find((item) => item.id === attachmentId);
      if (toRemove?.previewUrl) {
        URL.revokeObjectURL(toRemove.previewUrl);
      }
      return prev.filter((item) => item.id !== attachmentId);
    });
  }, []);

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {chat?.title || 'Nuova chat'}
          </h2>
          <p className="text-xs text-slate-400">
            {hasMessages
              ? `${orderedMessages.length} messaggi`
              : 'Inizia una nuova conversazione'}
          </p>
        </div>
        <button
          type="button"
          onClick={onStartNewChat}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-emerald-300 hover:text-emerald-600"
        >
          Nuova chat
        </button>
      </header>

      {/* Per rimuovere o personalizzare il banner d'errore condiviso, aggiorna la gestione dello stato `error` in App.jsx. */}
      {error ? (
        <div className="mx-6 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 shadow-sm">
          {error}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {orderedMessages.length === 0 && !streamingText ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
            <p className="text-sm font-medium">
              Nessuna conversazione ancora. Invia un messaggio per iniziare!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {orderedMessages.map((message, index) => (
              <article
                key={`${message.timestamp}-${index}`}
                className={`flex items-start gap-3 ${
                  message.role === 'assistant' ? 'flex-row' : 'flex-row-reverse'
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    message.role === 'assistant'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {message.role === 'assistant' ? 'AI' : 'Tu'}
                </span>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    message.role === 'assistant'
                      ? 'bg-emerald-50 text-slate-900'
                      : 'bg-slate-100 text-slate-900'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {Array.isArray(message.images) && message.images.length > 0 ? (
                    <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-3">
                      {message.images.map((image, imageIndex) => {
                        const mimeType =
                          image?.mimeType ||
                          image?.mime_type ||
                          (typeof image?.url === 'string' && image.url.includes('image/')
                            ? image.url.split('?')[0]?.split('.').pop()
                            : undefined) ||
                          'image/png';
                        let src = null;
                        if (typeof image?.url === 'string' && image.url.length > 0) {
                          src = image.url;
                        } else if (
                          typeof image?.previewUrl === 'string' &&
                          image.previewUrl.length > 0
                        ) {
                          src = image.previewUrl;
                        } else if (typeof image?.data === 'string' && image.data.length > 0) {
                          src = `data:${mimeType};base64,${image.data}`;
                        }

                        if (!src) {
                          return null;
                        }

                        const altLabel =
                          image?.name ??
                          image?.fileName ??
                          (image?.isPreview ? 'Immagine in caricamento' : 'Allegato immagine');

                        return (
                          <img
                            key={`${message.timestamp}-${imageIndex}`}
                            src={src}
                            alt={altLabel}
                            className="max-h-48 w-full rounded-lg border border-slate-200 object-cover"
                          />
                        );
                      })}
                    </div>
                  ) : null}
                  <span className="mt-2 block text-xs font-medium text-slate-400">
                    {formatTime(message.timestamp)}
                  </span>
                </div>
              </article>
            ))}

            {streamingText ? (
              <article className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
                  AI
                </span>
                <div className="max-w-[75%] rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-slate-900 shadow-sm">
                  <p className="whitespace-pre-wrap">{streamingText}</p>
                  <span className="mt-2 block text-xs font-medium text-slate-400">Sta scrivendo…</span>
                </div>
              </article>
            ) : null}

            <div ref={messagesEndRef} aria-hidden />
          </div>
        )}
      </div>

      <footer className="border-t border-slate-200 px-6 py-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            rows={3}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={isGenerating}
            placeholder="Scrivi il tuo messaggio..."
            className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          />

          {supportsImages ? (
            <div className="flex flex-col gap-2 text-xs text-slate-500">
              <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-emerald-300 px-3 py-2 font-medium text-emerald-600 transition hover:border-emerald-400 hover:bg-emerald-50">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={isGenerating || isProcessingFiles}
                  multiple
                />
                📎 Allega immagine (PNG/JPEG)
              </label>
              {attachments.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="relative overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50 shadow-sm"
                    >
                      <img
                        src={attachment.previewUrl}
                        alt={attachment.name || 'Immagine allegata'}
                        className="h-24 w-24 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(attachment.id)}
                        className="absolute right-1 top-1 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-emerald-600 shadow hover:bg-white"
                        aria-label={`Rimuovi ${attachment.name}`}
                      >
                        Rimuovi
                      </button>
                      <span
                        className={`absolute left-1 top-1 rounded-full px-2 py-[3px] text-[10px] font-semibold ${
                          attachment.status === 'success'
                            ? 'bg-emerald-500/90 text-white'
                            : attachment.status === 'uploading' || attachment.status === 'retry'
                            ? 'bg-amber-500/90 text-white'
                            : attachment.status === 'error'
                            ? 'bg-rose-500/90 text-white'
                            : 'bg-slate-500/70 text-white'
                        }`}
                      >
                        {attachment.status === 'success'
                          ? 'Upload completato'
                          : attachment.status === 'uploading'
                          ? 'Upload in corso…'
                          : attachment.status === 'retry'
                          ? 'Riprovo...'
                          : attachment.status === 'error'
                          ? 'Errore upload'
                          : 'Pronto'}
                      </span>
                      <p className="w-24 truncate px-2 pb-2 pt-1 text-[10px] font-medium text-emerald-700">
                        {attachment.name || 'Immagine'}
                      </p>
                      {typeof attachment.lastError === 'string' && attachment.lastError.length > 0 ? (
                        <p className="w-28 px-2 pb-2 text-[10px] font-medium text-rose-600">
                          {attachment.lastError}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">
                  Imm. abilitate per questo modello — allega un file opzionale.
                </p>
              )}
              {isProcessingFiles ? (
                <p className="text-[11px] font-semibold text-emerald-600">
                  Caricamento immagini in corso…
                </p>
              ) : null}
              {isUploading ? (
                <p className="text-[11px] font-semibold text-emerald-600">
                  Upload verso Firebase Storage…
                </p>
              ) : null}
            </div>
          ) : null}

          {(localError || error) && (
            <p className="text-xs text-rose-500">{localError || error}</p>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Suggerimento: usa le istruzioni personalizzate per guidare il tono dell’AI.
            </p>
            <button
              type="submit"
              disabled={isGenerating || isProcessingFiles || isUploading}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isGenerating
                ? 'Generazione…'
                : isUploading
                ? 'Upload in corso…'
                : isProcessingFiles
                ? 'Caricamento…'
                : 'Invia'}
            </button>
          </div>
        </form>
      </footer>
    </section>
  );
}

export default Chat;

