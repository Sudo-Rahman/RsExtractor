import type { FileRunState } from '$lib/types';

type ScannableFileStatus = 'pending' | 'scanning' | 'ready' | 'error';

export type FileCardStatus =
  | 'pending'
  | 'scanning'
  | 'ready'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'error';

export function getFileCardStatus(
  fileStatus: ScannableFileStatus,
  runState?: FileRunState,
): FileCardStatus {
  if (fileStatus === 'scanning') {
    return 'scanning';
  }

  if (fileStatus === 'error' || runState?.status === 'error') {
    return 'error';
  }

  if (runState?.status === 'queued') {
    return 'queued';
  }
  if (runState?.status === 'processing') {
    return 'processing';
  }
  if (runState?.status === 'completed') {
    return 'completed';
  }
  if (runState?.status === 'cancelled') {
    return 'cancelled';
  }

  if (fileStatus === 'pending') {
    return 'pending';
  }

  return 'ready';
}

export function shouldShowFileCardProgress(status: FileCardStatus): boolean {
  return status === 'processing' || status === 'queued';
}
