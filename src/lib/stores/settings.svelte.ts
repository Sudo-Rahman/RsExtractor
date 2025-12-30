import { Store } from '@tauri-apps/plugin-store';

// Settings interface
export interface AppSettings {
  ffmpegPath: string;
  ffprobePath: string;
  theme: 'system' | 'light' | 'dark';
  outputPathHistory: string[];
}

const DEFAULT_SETTINGS: AppSettings = {
  ffmpegPath: '',
  ffprobePath: '',
  theme: 'system',
  outputPathHistory: []
};

// Persistent store
let store: Store | null = null;
let settings = $state<AppSettings>({ ...DEFAULT_SETTINGS });
let isLoaded = $state(false);

async function getStore(): Promise<Store> {
  if (!store) {
    store = await Store.load('settings.json');
  }
  return store;
}

export const settingsStore = {
  get settings() { return settings; },
  get isLoaded() { return isLoaded; },

  async load() {
    try {
      const s = await getStore();

      const ffmpegPath = await s.get<string>('ffmpegPath');
      const ffprobePath = await s.get<string>('ffprobePath');
      const theme = await s.get<'system' | 'light' | 'dark'>('theme');
      const outputPathHistory = await s.get<string[]>('outputPathHistory');

      settings = {
        ffmpegPath: ffmpegPath ?? DEFAULT_SETTINGS.ffmpegPath,
        ffprobePath: ffprobePath ?? DEFAULT_SETTINGS.ffprobePath,
        theme: theme ?? DEFAULT_SETTINGS.theme,
        outputPathHistory: outputPathHistory ?? DEFAULT_SETTINGS.outputPathHistory
      };

      isLoaded = true;
    } catch (e) {
      console.error('Failed to load settings:', e);
      settings = { ...DEFAULT_SETTINGS };
      isLoaded = true;
    }
  },

  async setFFmpegPath(path: string) {
    settings = { ...settings, ffmpegPath: path };
    const s = await getStore();
    await s.set('ffmpegPath', path);
  },

  async setFFprobePath(path: string) {
    settings = { ...settings, ffprobePath: path };
    const s = await getStore();
    await s.set('ffprobePath', path);
  },

  async setTheme(theme: 'system' | 'light' | 'dark') {
    settings = { ...settings, theme };
    const s = await getStore();
    await s.set('theme', theme);
  },

  async addOutputPathToHistory(path: string) {
    const history = settings.outputPathHistory.filter(p => p !== path);
    history.unshift(path);
    const newHistory = history.slice(0, 10); // Keep last 10
    settings = { ...settings, outputPathHistory: newHistory };
    const s = await getStore();
    await s.set('outputPathHistory', newHistory);
  },

  async reset() {
    settings = { ...DEFAULT_SETTINGS };
    const s = await getStore();
    await s.clear();
  }
};

