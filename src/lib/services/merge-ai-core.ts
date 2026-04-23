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

export interface MergeAiParseResult {
  matches: MergeAiValidatedMatch[];
  warnings: string[];
}

export interface MergeAiPromptIdMaps {
  videoPromptIdByRealId: Map<string, string>;
  trackPromptIdByRealId: Map<string, string>;
  realVideoIdByPromptId: Map<string, string>;
  realTrackIdByPromptId: Map<string, string>;
}

export interface MergeAiEpisodeEntity {
  id: string;
  filename?: string;
  seasonNumber?: number;
  episodeNumber?: number;
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
  idMaps?: MergeAiPromptIdMaps,
): MergeAiPromptPayload {
  return {
    videos: videos.map(video => ({
      ...video,
      id: idMaps?.videoPromptIdByRealId.get(video.id) ?? video.id,
    })),
    tracks: tracks.map(track => ({
      ...track,
      id: idMaps?.trackPromptIdByRealId.get(track.id) ?? track.id,
    })),
  };
}

function formatPromptId(prefix: 'v' | 't', index: number): string {
  return `${prefix}${String(index + 1).padStart(3, '0')}`;
}

export function createMergeAiPromptIdMaps(
  videos: Array<{ id: string }>,
  tracks: Array<{ id: string }>,
): MergeAiPromptIdMaps {
  const videoPromptIdByRealId = new Map<string, string>();
  const trackPromptIdByRealId = new Map<string, string>();
  const realVideoIdByPromptId = new Map<string, string>();
  const realTrackIdByPromptId = new Map<string, string>();

  videos.forEach((video, index) => {
    const promptId = formatPromptId('v', index);
    videoPromptIdByRealId.set(video.id, promptId);
    realVideoIdByPromptId.set(promptId, video.id);
  });

  tracks.forEach((track, index) => {
    const promptId = formatPromptId('t', index);
    trackPromptIdByRealId.set(track.id, promptId);
    realTrackIdByPromptId.set(promptId, track.id);
  });

  return {
    videoPromptIdByRealId,
    trackPromptIdByRealId,
    realVideoIdByPromptId,
    realTrackIdByPromptId,
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
): MergeAiParseResult {
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
  const matches: MergeAiValidatedMatch[] = [];
  const warnings: string[] = [];

  parsed.matches.forEach((match, index) => {
    if (!isObject(match)) {
      warnings.push(`Match ${index + 1} was ignored because it was not an object.`);
      return;
    }

    if (typeof match.trackId !== 'string' || !validTrackIds.has(match.trackId)) {
      warnings.push(`Match ${index + 1} was ignored because it referenced an unknown trackId.`);
      return;
    }

    if (seenTrackIds.has(match.trackId)) {
      warnings.push(`Duplicate AI match for ${match.trackId} was ignored.`);
      return;
    }
    seenTrackIds.add(match.trackId);

    const rawVideoId = match.videoId;
    let videoId: string | null = null;
    let reason = typeof match.reason === 'string' && match.reason.trim().length > 0
      ? match.reason.trim()
      : 'No reason provided.';

    if (rawVideoId === null) {
      videoId = null;
    } else if (typeof rawVideoId === 'string' && validVideoIds.has(rawVideoId)) {
      videoId = rawVideoId;
    } else {
      warnings.push(`Match ${index + 1} referenced an unknown videoId and was left unmatched.`);
      reason = 'The AI referenced an unknown video, so this track was left unmatched.';
    }

    const confidence = normalizeConfidence(match.confidence);
    if (!confidence) {
      warnings.push(`Match ${index + 1} was ignored because it contained an invalid confidence value.`);
      return;
    }

    matches.push({
      trackId: match.trackId,
      videoId,
      confidence,
      reason,
    });
  });

  return { matches, warnings };
}

export function mapMergeAiPromptMatchesToRealIds(
  matches: MergeAiValidatedMatch[],
  idMaps: MergeAiPromptIdMaps,
): MergeAiValidatedMatch[] {
  return matches
    .map((match) => {
      const trackId = idMaps.realTrackIdByPromptId.get(match.trackId);
      if (!trackId) {
        return null;
      }

      return {
        ...match,
        trackId,
        videoId: match.videoId ? idMaps.realVideoIdByPromptId.get(match.videoId) ?? null : null,
      };
    })
    .filter((match): match is MergeAiValidatedMatch => match !== null);
}

function hasEpisodeMismatch(
  track: MergeAiEpisodeEntity,
  video: MergeAiEpisodeEntity,
): boolean {
  if (
    track.episodeNumber !== undefined
    && video.episodeNumber !== undefined
    && track.episodeNumber !== video.episodeNumber
  ) {
    return true;
  }

  return track.seasonNumber !== undefined
    && video.seasonNumber !== undefined
    && track.seasonNumber !== video.seasonNumber;
}

export function validateMergeAiSemanticMatches(
  matches: MergeAiValidatedMatch[],
  tracks: MergeAiEpisodeEntity[],
  videos: MergeAiEpisodeEntity[],
): MergeAiParseResult {
  const trackById = new Map(tracks.map(track => [track.id, track]));
  const videoById = new Map(videos.map(video => [video.id, video]));
  const warnings: string[] = [];

  const validatedMatches = matches.map((match) => {
    if (!match.videoId) {
      return match;
    }

    const track = trackById.get(match.trackId);
    const video = videoById.get(match.videoId);

    if (!track || !video || !hasEpisodeMismatch(track, video)) {
      return match;
    }

    warnings.push(`AI match for ${track.filename ?? track.id} was rejected because the video season/episode did not match.`);

    return {
      ...match,
      videoId: null,
      confidence: 'low' as const,
      reason: 'Rejected AI match because the video season/episode did not match this track.',
    };
  });

  return {
    matches: validatedMatches,
    warnings,
  };
}
