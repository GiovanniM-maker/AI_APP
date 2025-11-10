export const MODEL_OPTIONS = [
  {
    value: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    supportsImages: true,
    description: 'Qualità massima, multimodale',
  },
  {
    value: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    supportsImages: true,
    description: 'Risposte rapide, multimodale',
  },
  {
    value: 'gemini-2.5-flash-image',
    label: 'Gemini 2.5 Flash Image',
    supportsImages: true,
    description: 'Ottimizzato per immagini (“flash-image”)',
  },
  {
    value: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    supportsImages: false,
    description: 'Versione più leggera, solo testo',
  },
  {
    value: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    supportsImages: true,
    description: 'Multimodale generazione rapida',
  },
  {
    value: 'imagen-3',
    label: 'Imagen 3',
    supportsImages: true,
    description: 'Generazione immagini (testo → immagine)',
  },
];

export const DEFAULT_MODEL = 'gemini-2.5-flash';

export const getModelMeta = (modelId) =>
  MODEL_OPTIONS.find((option) => option.value === modelId) ??
  MODEL_OPTIONS.find((option) => option.value === DEFAULT_MODEL) ??
  MODEL_OPTIONS[0];

