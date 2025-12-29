import type { VideoFile } from '$lib/types';

// État réactif avec Svelte 5 runes
let files = $state<VideoFile[]>([]);
let selectedFilePath = $state<string | null>(null);

export const fileListStore = {
  get files() {
    return files;
  },

  get selectedFilePath() {
    return selectedFilePath;
  },

  get selectedFile(): VideoFile | undefined {
    return files.find(f => f.path === selectedFilePath);
  },

  addFiles(newFiles: VideoFile[]) {
    // Éviter les doublons par chemin
    const existingPaths = new Set(files.map(f => f.path));
    const filesToAdd = newFiles.filter(f => !existingPaths.has(f.path));
    files = [...files, ...filesToAdd];
  },

  updateFile(path: string, updates: Partial<VideoFile>) {
    files = files.map(f =>
      f.path === path ? { ...f, ...updates } : f
    );
  },

  removeFile(path: string) {
    files = files.filter(f => f.path !== path);
    if (selectedFilePath === path) {
      selectedFilePath = files.length > 0 ? files[0].path : null;
    }
  },

  selectFile(path: string | null) {
    selectedFilePath = path;
  },

  clear() {
    files = [];
    selectedFilePath = null;
  },

  getFileByPath(path: string): VideoFile | undefined {
    return files.find(f => f.path === path);
  }
};

