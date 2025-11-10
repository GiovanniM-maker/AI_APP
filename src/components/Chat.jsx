import { useEffect, useMemo, useRef, useState } from 'react';

function formatTime(timestamp) {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (error) {
    return '';
  }
}

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
  const [imageBase64, setImageBase64] = useState(null);
  const [imageName, setImageName] = useState('');
  const messagesEndRef = useRef(null);

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
    if (!supportsImages && imageBase64) {
      setImageBase64(null);
      setImageName('');
    }
  }, [supportsImages, imageBase64]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!input.trim()) {
      setLocalError('Scrivi un messaggio prima di inviare.');
      return;
    }

    try {
      await onSendMessage?.({
        text: input.trim(),
        imageBase64: imageBase64 ?? null,
      });
      setInput('');
      setImageBase64(null);
      setImageName('');
    } catch (err) {
      setLocalError(err?.message ?? 'Invio messaggio fallito.');
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setLocalError('Seleziona un file immagine valido.');
      return;
    }

    try {
      const base64 = await new Promise((resolve, reject) => {
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

      setImageBase64(base64);
      setImageName(file.name);
      setLocalError('');
    } catch (conversionError) {
      setLocalError(conversionError?.message ?? 'Impossibile caricare l’immagine.');
    }
  };

  const handleRemoveImage = () => {
    setImageBase64(null);
    setImageName('');
  };

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
                  {message.imageBase64 ? (
                    <img
                      src={`data:image/png;base64,${message.imageBase64}`}
                      alt="Allegato utente"
                      className="mt-3 max-h-48 w-auto rounded-lg border border-slate-200"
                    />
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
                  disabled={isGenerating}
                />
                📎 Allega immagine (PNG/JPEG)
              </label>
              {imageBase64 ? (
                <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-slate-600">
                  <span className="truncate pr-3 text-xs font-medium">{imageName || 'Immagine allegata'}</span>
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-500"
                  >
                    Rimuovi
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">
                  Imm. abilitate per questo modello — allega un file opzionale.
                </p>
              )}
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
              disabled={isGenerating}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isGenerating ? 'Generazione…' : 'Invia'}
            </button>
          </div>
        </form>
      </footer>
    </section>
  );
}

export default Chat;

