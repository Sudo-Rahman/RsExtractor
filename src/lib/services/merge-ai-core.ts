export type MergeAiConfidence = 'high' | 'medium' | 'low';

export interface MergeAiTrackSummary {
  type: string;
  codec?: string;
  language?: string;
  title?: string;
  default?: boolean;
  forced?: boolean;
}

export interface MergeAiProbeSummary {
  status: 'ready' | 'error' | 'unavailable';
  format?: string;
  duration?: number;
  size?: number;
  tracks: MergeAiTrackSummary[];
  error?: string;
}

export interface MergeAiCandidateVideo {
  id: string;
  filename: string;
  normalizedBasename: string;
  seasonNumber?: number;
  episodeNumber?: number;
  duration?: number;
  size?: number;
  sourceTrackSummary: MergeAiTrackSummary[];
}

export interface MergeAiCandidateTrack {
  id: string;
  filename: string;
  normalizedBasename: string;
  type: string;
  codec: string;
  language?: string;
  title?: string;
  default?: boolean;
  forced?: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
  probe: MergeAiProbeSummary;
}

export interface MergeAiPromptPayload {
  videos: MergeAiCandidateVideo[];
  tracks: MergeAiCandidateTrack[];
}

export interface MergeAiValidatedMatch {
  trackId: string;
  videoId: string | null;
  confidence: MergeAiConfidence;
  reason: string;
}

const RELEASE_TAG_PATTERN =
  /\b(?:480p|576p|720p|1080p|2160p|4k|x264|x265|h\.?264|h\.?265|hevc|av1|aac|ac3|eac3|dts|flac|opus|webrip|web[-.\s]?dl|bluray|bdrip|dvdrip|hdr|multi|sub(?:bed|s)?|dub(?:bed)?|proper|repack|complete)\b/gi;

export function normalizeMergeAiName(name: string): string {
  return name
    .replace(/\.[^/.]+$/, '')
    .replace(/(?:\.[a-z]{2,8})?\.track\d+$/i, '')
    .replace(/\[[^\]]*\]|\([^)]+\)|\{[^}]+\}/g, ' ')
    .replace(RELEASE_TAG_PATTERN, ' ')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function buildMergeAiPromptPayload(
  videos: MergeAiCandidateVideo[],
  tracks: MergeAiCandidateTrack[],
): MergeAiPromptPayload {
  return {
    videos,
    tracks,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeConfidence(value: unknown): MergeAiConfidence | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized;
  }

  return null;
}

export function parseAndValidateMergeAiResponse(
  responseText: string,
  trackIds: Iterable<string>,
  videoIds: Iterable<string>,
): MergeAiValidatedMatch[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error('The AI response was not valid JSON');
  }

  if (!isObject(parsed) || !Array.isArray(parsed.matches)) {
    throw new Error('The AI response did not match the expected schema');
  }

  const validTrackIds = new Set(trackIds);
  const validVideoIds = new Set(videoIds);
  const seenTrackIds = new Set<string>();

  return parsed.matches.map((match, index) => {
    if (!isObject(match)) {
      throw new Error(`Match ${index + 1} was not an object`);
    }

    if (typeof match.trackId !== 'string' || !validTrackIds.has(match.trackId)) {
      throw new Error(`Match ${index + 1} referenced an unknown trackId`);
    }

    if (seenTrackIds.has(match.trackId)) {
      throw new Error(`The AI response contained duplicate entries for ${match.trackId}`);
    }
    seenTrackIds.add(match.trackId);

    const videoId = match.videoId;
    if (videoId !== null && (typeof videoId !== 'string' || !validVideoIds.has(videoId))) {
      throw new Error(`Match ${index + 1} referenced an unknown videoId`);
    }

    const confidence = normalizeConfidence(match.confidence);
    if (!confidence) {
      throw new Error(`Match ${index + 1} contained an invalid confidence value`);
    }

    return {
      trackId: match.trackId,
      videoId,
      confidence,
      reason: typeof match.reason === 'string' && match.reason.trim().length > 0
        ? match.reason.trim()
        : 'No reason provided.',
    };
  });
}
