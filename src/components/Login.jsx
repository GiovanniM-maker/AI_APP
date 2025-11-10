import { useState } from 'react';

function Login({ onEmailAuth, onGoogleSignIn, isLoading }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Inserisci email e password.');
      return;
    }

    try {
      await onEmailAuth?.(email, password, mode);
      setPassword('');
    } catch (err) {
      setError(err?.message ?? 'Autenticazione fallita.');
    }
  };

  const handleGoogle = async () => {
    setError('');
    try {
      await onGoogleSignIn?.();
    } catch (err) {
      setError(err?.message ?? 'Accesso con Google non riuscito.');
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-10 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Gemini Chat</h1>
          <p className="mt-2 text-sm text-slate-500">
            Accedi per iniziare a chattare con i modelli Gemini usando la tua libreria di chat personale.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span aria-hidden>🔐</span>
          Accedi con Google
        </button>

        <div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-slate-400">
          <span className="h-px flex-1 bg-slate-200" aria-hidden />
          oppure
          <span className="h-px flex-1 bg-slate-200" aria-hidden />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="space-y-1 text-sm font-medium text-slate-600">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              placeholder="tu@esempio.com"
              autoComplete="email"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-600">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              placeholder="********"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </label>

          {error ? <p className="text-sm text-rose-500">{error}</p> : null}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {mode === 'signin' ? 'Accedi con email' : 'Crea account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          {mode === 'signin' ? 'Non hai un account?' : 'Hai già un account?'}{' '}
          <button
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="font-semibold text-emerald-600 hover:underline"
          >
            {mode === 'signin' ? 'Registrati' : 'Accedi'}
          </button>
        </p>
      </div>
    </div>
  );
}

export default Login;

