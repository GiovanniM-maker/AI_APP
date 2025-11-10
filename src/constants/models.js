// Elenco modelli supportati in UI. Consulta https://ai.google.dev/gemini-api/docs/models?hl=it
// (endpoint `models.list`) per aggiungere nuove varianti senza modificare la logica.
export const MODEL_OPTIONS = [
  {
    value: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro (testo)',
    supportsImages: true,
    description: 'Qualità massima, multimodale',
  },
  {
    value: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash (testo veloce)',
    supportsImages: true,
    description: 'Risposte rapide, multimodale',
  },
  {
    value: 'gemini-2.5-flash-image',
    label: 'Gemini 2.5 Flash Image (NanoBanana)',
    supportsImages: true,
    description: 'Modello ottimizzato per immagini + testo',
  },
  {
    value: 'imagen-3',
    label: 'Imagen 3 (immagini pure)',
    supportsImages: true,
    description: 'Generazione di immagini ad alta qualità',
  },
];

export const DEFAULT_MODEL = 'gemini-2.5-flash';

export const getModelMeta = (modelId) =>
  MODEL_OPTIONS.find((option) => option.value === modelId) ??
  MODEL_OPTIONS.find((option) => option.value === DEFAULT_MODEL) ??
  MODEL_OPTIONS[0];

