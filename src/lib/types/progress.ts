export type FileRunStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'error' | 'cancelled';

export interface FileRunState {
  status: FileRunStatus;
  progress: number;
  speedBytesPerSec?: number;
  error?: string;
}

export interface ExtractProgressEvent {
  inputPath: string;
  outputPath: string;
  trackIndex: number;
  progress: number;
  speedBytesPerSec?: number;
}

export interface MergeProgressEvent {
  videoPath: string;
  outputPath: string;
  progress: number;
  speedBytesPerSec?: number;
}

export interface RenameCopyProgressEvent {
  sourcePath: string;
  destPath: string;
  bytesCopied: number;
  totalBytes: number;
  progress: number;
  speedBytesPerSec?: number;
}
