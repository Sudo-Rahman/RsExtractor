import { Film, Subtitles, Video, Volume2 } from '@lucide/svelte';

import type { Track, TrackType } from '$lib/types';

export interface InfoTrackGroups {
  video: Track[];
  audio: Track[];
  subtitle: Track[];
}

export const SUPPORTED_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.mov', '.webm', '.m4v', '.mks', '.mka'] as const;
export const SUPPORTED_FORMATS = SUPPORTED_EXTENSIONS.map((extension) => extension.slice(1).toUpperCase());

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const kilo = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.floor(Math.log(bytes) / Math.log(kilo));

  return `${parseFloat((bytes / Math.pow(kilo, index)).toFixed(2))} ${sizes[index]}`;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function formatBitrate(bps: number): string {
  if (bps > 1000000) {
    return `${(bps / 1000000).toFixed(2)} Mbps`;
  }

  return `${(bps / 1000).toFixed(0)} kbps`;
}

export function getTrackIcon(type: TrackType | string) {
  switch (type) {
    case 'video':
      return Video;
    case 'audio':
      return Volume2;
    case 'subtitle':
      return Subtitles;
    default:
      return Film;
  }
}

export function getTrackTypeColor(type: TrackType | string): string {
  switch (type) {
    case 'video':
      return 'text-blue-500';
    case 'audio':
      return 'text-green-500';
    case 'subtitle':
      return 'text-yellow-500';
    default:
      return 'text-gray-500';
  }
}

export function groupTracksByType(tracks: Track[]): InfoTrackGroups {
  const groups: InfoTrackGroups = { video: [], audio: [], subtitle: [] };

  for (const track of tracks) {
    if (track.type === 'video' || track.type === 'audio' || track.type === 'subtitle') {
      groups[track.type].push(track);
    }
  }

  return groups;
}
