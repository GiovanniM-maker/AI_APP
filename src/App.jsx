import { useEffect, useState } from 'react';
import { app } from './firebase';

const DEFAULT_REQUEST = {
  model: 'gemini-1.5-flash',
  messages: [{ role: 'user', text: 'Hello Gemini!' }],
};

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [responseText, setResponseText] = useState('');

  useEffect(() => {
    if (app?.name) {
      console.log(`🔥 Firebase connesso correttamente: ${app.name}`);
    }
  }, []);

  const handleTest = async () => {
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(DEFAULT_REQUEST),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error ?? `Request failed with ${res.status}`);
      }

      const payload = await res.json();
      setResponseText(payload?.text ?? '');
    } catch (err) {
      console.error('Test API error', err);
      setError(err?.message ?? 'Errore inatteso');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold">Gemini Chat — setup completo ✅</h1>
        <p className="mt-3 text-sm text-slate-300">
          Base pronta per Vercel con Firebase, Tailwind CSS e API Gemini. Premi il bottone per testare la
          funzione serverless.
        </p>

        <button
          type="button"
          onClick={handleTest}
          disabled={isLoading}
          className="mt-6 inline-flex items-center rounded-lg bg-emerald-500 px-4 py-2 font-medium text-slate-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isLoading ? 'Invio…' : 'Test API'}
        </button>

        <section className="mt-6 space-y-2 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Risposta</h2>
          {error ? (
            <p className="text-sm text-rose-400">{error}</p>
          ) : (
            <p className="text-sm text-slate-100">{responseText || 'Ancora nessuna risposta.'}</p>
          )}
        </section>
      </div>
    </main>
  );
}

export default App;

