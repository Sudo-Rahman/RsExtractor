import type { Track } from '$lib/types';

export interface FileInfo {
  id: string;
  path: string;
  name: string;
  size: number;
  duration?: number;
  bitrate?: number;
  format?: string;
  tracks: Track[];
  status: 'scanning' | 'ready' | 'error';
  error?: string;
  rawData?: unknown;
}

let files = $state<FileInfo[]>([]);
let selectedFileId = $state<string | null>(null);
let idCounter = 0;

export const infoStore = {
  get files() {
    return files;
  },

  get selectedFileId() {
    return selectedFileId;
  },

  get selectedFile(): FileInfo | undefined {
    return files.find(f => f.id === selectedFileId);
  },

  generateId(): string {
    return `info-${Date.now()}-${++idCounter}`;
  },

  addFile(file: FileInfo): boolean {
    if (files.some(f => f.path === file.path)) return false;
    files = [...files, file];
    if (!selectedFileId) selectedFileId = file.id;
    return true;
  },

  updateFile(id: string, updates: Partial<FileInfo>) {
    files = files.map(f => f.id === id ? { ...f, ...updates } : f);
  },

  removeFile(id: string) {
    files = files.filter(f => f.id !== id);
    if (selectedFileId === id) {
      selectedFileId = files.length > 0 ? files[0].id : null;
    }
  },

  selectFile(id: string | null) {
    selectedFileId = id;
  },

  clear() {
    files = [];
    selectedFileId = null;
  },

  hasFile(path: string): boolean {
    return files.some(f => f.path === path);
  }
};
