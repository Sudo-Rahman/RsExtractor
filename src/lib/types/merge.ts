import type { TrackType } from './media';

// Types pour le Merge Batch

// Fichier vidéo source (épisode)
export interface MergeVideoFile {
  id: string;
  path: string;
  name: string;
  size: number;
  duration?: number;
  tracks: MergeTrack[];
  status: 'pending' | 'scanning' | 'ready' | 'error';
  error?: string;
  // Episode number extracted from filename
  episodeNumber?: number;
  // Tracks to be merged into this file
  attachedTracks: AttachedTrack[];
}

// Piste importée (à merger)
export interface ImportedTrack {
  id: string;
  path: string;
  name: string;
  type: TrackType;
  codec: string;
  language?: string;
  title?: string;
  // Episode number extracted from filename (for auto-matching)
  episodeNumber?: number;
  // Track config
  config: MergeTrackConfig;
}

// Piste attachée à un fichier vidéo
export interface AttachedTrack {
  trackId: string; // Reference to ImportedTrack.id
  order: number;
}

// Track existant dans un fichier source
export interface MergeTrack {
  id: string;
  sourceFileId: string;
  originalIndex: number;
  type: TrackType;
  codec: string;
  codecLong?: string;
  language?: string;
  title?: string;
  bitrate?: number;
  width?: number;
  height?: number;
  frameRate?: string;
  channels?: number;
  sampleRate?: number;
  forced?: boolean;
  default?: boolean;
}

export interface MergeTrackConfig {
  trackId: string;
  enabled: boolean;
  language?: string;
  title?: string;
  default?: boolean;
  forced?: boolean;
  delayMs: number;
  order: number;
}

export interface MergeOutputConfig {
  outputPath: string;
  // Use source filename pattern or custom
  useSourceFilename: boolean;
  outputNamePattern: string;
  title?: string;
}

export interface BatchMergeJob {
  videoFileId: string;
  attachedTrackIds: string[];
  outputPath: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
}

// Languages communes pour le dropdown
export const COMMON_LANGUAGES = [
  { code: 'und', label: 'Undefined' },
  { code: 'fra', label: 'French' },
  { code: 'eng', label: 'English' },
  { code: 'jpn', label: 'Japanese' },
  { code: 'ger', label: 'German' },
  { code: 'spa', label: 'Spanish' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'rus', label: 'Russian' },
  { code: 'kor', label: 'Korean' },
  { code: 'chi', label: 'Chinese' },
  { code: 'ara', label: 'Arabic' },
] as const;

// Utility to extract episode number from filename
// Returns undefined for movies/non-series content
export function extractEpisodeNumber(filename: string): number | undefined {
  // First, check if it looks like a movie (year in title, common movie indicators)
  const moviePatterns = [
    /\b(19|20)\d{2}\b.*\b(bluray|bdrip|webrip|dvdrip|hdtv|hdrip|1080p|720p|2160p|4k)\b/i,
    /\b(movie|film)\b/i,
    /^\[.*?\]\s*[^-\[\]]+\s*\[\d{4}\]/i, // [Group] Movie Name [2024]
  ];

  for (const pattern of moviePatterns) {
    if (pattern.test(filename)) {
      return undefined;
    }
  }

  // Check for series indicators before extracting episode number
  const seriesIndicators = [
    /[Ss]\d+[Ee]\d+/,           // S01E01 - strong indicator
    /[Ee][Pp]\.?\s*\d+/i,       // EP01, Ep.01, Ep 01
    /Episode\s*\d+/i,           // Episode 01
    /第\s*\d+\s*話/,            // Japanese episode format
    /\b(season|saison)\s*\d+/i, // Season indicator
  ];

  let hasSeriesIndicator = false;
  for (const pattern of seriesIndicators) {
    if (pattern.test(filename)) {
      hasSeriesIndicator = true;
      break;
    }
  }

  // Patterns to extract episode number (ordered by reliability)
  const patterns = [
    /[Ss]\d+[Ee](\d+)/,           // S01E01 - most reliable
    /[Ee][Pp]\.?\s*(\d+)/i,       // E01, EP01, Ep.01
    /Episode\s*(\d+)/i,           // Episode 01
    /第\s*(\d+)\s*話/,            // Japanese: 第01話
  ];

  // Less reliable patterns - only use if series indicator found
  const lessReliablePatterns = [
    /[\s\-_\[]\s*(\d{2,3})\s*[\]\s\-_\.]/,  // - 01 -, _01_, [01] (2-3 digits only)
    /^(\d{2,3})\s*[\.\-_\s]/,       // 01 - Title (2-3 digits only)
  ];

  // Try reliable patterns first
  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (num > 0 && num < 1000) {
        return num;
      }
    }
  }

  // Only try less reliable patterns if we found a series indicator
  if (hasSeriesIndicator) {
    for (const pattern of lessReliablePatterns) {
      const match = filename.match(pattern);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        // More restrictive range for less reliable patterns
        if (num > 0 && num <= 500) {
          return num;
        }
      }
    }
  }

  return undefined;
}

