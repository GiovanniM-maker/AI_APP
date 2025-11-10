import { useMemo } from 'react';

const MODEL_OPTIONS = [
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  { value: 'gemini-1.0-pro', label: 'Gemini 1.0 Pro' },
  { value: 'gemini-pro', label: 'Gemini Pro (Legacy)' },
];

function SettingsPanel({ settings, onUpdate, disabled }) {
  const safeSettings = useMemo(
    () => ({
      model: settings?.model ?? MODEL_OPTIONS[0].value,
      temperature: settings?.temperature ?? 0.8,
      topP: settings?.topP ?? 0.9,
      instructions: settings?.instructions ?? '',
    }),
    [settings]
  );

  return (
    <aside className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Impostazioni</h2>
        <p className="mt-1 text-sm text-slate-500">
          Personalizza il comportamento dei modelli Gemini e salva le preferenze per il tuo account.
        </p>
      </div>

      <div className="mt-6 space-y-6 text-sm text-slate-700">
        <label className="flex flex-col gap-2">
          <span className="font-medium text-slate-600">Modello</span>
          <select
            value={safeSettings.model}
            onChange={(event) => onUpdate?.({ model: event.target.value })}
            disabled={disabled}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {MODEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-600">Temperature</span>
            <span className="text-xs font-semibold text-slate-400">
              {safeSettings.temperature.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={safeSettings.temperature}
            onChange={(event) =>
              onUpdate?.({ temperature: Number.parseFloat(event.target.value) })
            }
            disabled={disabled}
            className="accent-emerald-500"
          />
          <p className="text-xs text-slate-400">
            Valori più alti generano risposte più creative, quelli più bassi più precise.
          </p>
        </label>

        <label className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-600">Top P</span>
            <span className="text-xs font-semibold text-slate-400">
              {safeSettings.topP.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={safeSettings.topP}
            onChange={(event) =>
              onUpdate?.({ topP: Number.parseFloat(event.target.value) })
            }
            disabled={disabled}
            className="accent-emerald-500"
          />
          <p className="text-xs text-slate-400">
            Limita le scelte del modello a token entro questa probabilità cumulativa.
          </p>
        </label>

        <label className="flex flex-col gap-2">
          <span className="font-medium text-slate-600">Istruzioni personalizzate</span>
          <textarea
            value={safeSettings.instructions}
            onChange={(event) => onUpdate?.({ instructions: event.target.value })}
            disabled={disabled}
            rows={6}
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="Spiega come vuoi che il modello risponda..."
          />
        </label>
      </div>
    </aside>
  );
}

export default SettingsPanel;

