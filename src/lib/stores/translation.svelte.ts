import type {
  SubtitleFile,
  TranslationConfig,
  TranslationProgress,
  TranslationResult,
  LLMProvider,
  LanguageCode
} from '$lib/types';

// Translation state
let subtitleFile = $state<SubtitleFile | null>(null);
let config = $state<TranslationConfig>({
  sourceLanguage: 'auto',
  targetLanguage: 'fr',
  provider: 'google',
  model: 'gemini-2.5-flash'
});
let progress = $state<TranslationProgress>({
  status: 'idle',
  currentFile: '',
  progress: 0
});
let result = $state<TranslationResult | null>(null);

export const translationStore = {
  get subtitleFile() {
    return subtitleFile;
  },

  get config() {
    return config;
  },

  get progress() {
    return progress;
  },

  get result() {
    return result;
  },

  get isTranslating() {
    return progress.status === 'translating';
  },

  get hasFile() {
    return subtitleFile !== null;
  },

  setSubtitleFile(file: SubtitleFile | null) {
    subtitleFile = file;
    // Reset progress and result when new file is loaded
    progress = { status: 'idle', currentFile: '', progress: 0 };
    result = null;
  },

  setSourceLanguage(lang: LanguageCode) {
    config = { ...config, sourceLanguage: lang };
  },

  setTargetLanguage(lang: LanguageCode) {
    config = { ...config, targetLanguage: lang };
  },

  setProvider(provider: LLMProvider) {
    config = { ...config, provider, model: '' };
  },

  setModel(model: string) {
    config = { ...config, model };
  },

  updateProgress(updates: Partial<TranslationProgress>) {
    progress = { ...progress, ...updates };
  },

  setResult(translationResult: TranslationResult) {
    result = translationResult;
  },

  reset() {
    subtitleFile = null;
    config = {
      sourceLanguage: 'auto',
      targetLanguage: 'fr',
      provider: 'google',
      model: 'gemini-2.5-flash'
    };
    progress = { status: 'idle', currentFile: '', progress: 0 };
    result = null;
  },

  clearResult() {
    result = null;
    progress = { status: 'idle', currentFile: '', progress: 0 };
  }
};
