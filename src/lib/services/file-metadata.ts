import { invoke } from '@tauri-apps/api/core';

interface TauriFileMetadata {
  size: number;
  created_at: number | null;
  modified_at: number | null;
}

export interface FileMetadata {
  size?: number;
  createdAt?: Date;
  modifiedAt?: Date;
}

export async function fetchFileMetadata(path: string): Promise<FileMetadata> {
  try {
    const metadata = await invoke<TauriFileMetadata>('get_file_metadata', { path });
    return {
      size: metadata.size,
      createdAt: metadata.created_at ? new Date(metadata.created_at) : undefined,
      modifiedAt: metadata.modified_at ? new Date(metadata.modified_at) : undefined,
    };
  } catch (error) {
    console.error('Failed to fetch metadata for', path, error);
    return {};
  }
}
