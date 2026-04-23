import { describe, expect, it } from 'vitest';

import {
  buildMergeAiPromptPayload,
  createMergeAiPromptIdMaps,
  mapMergeAiPromptMatchesToRealIds,
  parseAndValidateMergeAiResponse,
  validateMergeAiSemanticMatches,
  type MergeAiCandidateTrack,
  type MergeAiCandidateVideo,
} from './merge-ai-core';

function createCandidateVideo(
  id: string,
  seasonNumber: number,
  episodeNumber: number,
): MergeAiCandidateVideo {
  return {
    id,
    filename: `Spare.Me.Great.Lord.S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}.mkv`,
    normalizedBasename: `spare me great lord s${seasonNumber}e${episodeNumber}`,
    seasonNumber,
    episodeNumber,
    duration: 1200,
    size: 1000,
    sourceTrackSummary: [],
  };
}

function createCandidateTrack(
  id: string,
  seasonNumber: number,
  episodeNumber: number,
  suffix = 'version_2',
): MergeAiCandidateTrack {
  return {
    id,
    filename: `Spare.Me.Great.Lord.S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}.${suffix}.ass`,
    normalizedBasename: `spare me great lord s${seasonNumber}e${episodeNumber} ${suffix}`,
    type: 'subtitle',
    codec: 'ass',
    title: `S${seasonNumber}E${episodeNumber} ${suffix}`,
    seasonNumber,
    episodeNumber,
    probe: {
      status: 'ready',
      format: 'SSA (SubStation Alpha) subtitle',
      size: 100,
      tracks: [{ type: 'subtitle', codec: 'ass' }],
    },
  };
}

const traceVideoIdsByEpisode = new Map<string, string>([
  ['2:1', 'video-1776941059900-7'],
  ['2:2', 'video-1776941059899-1'],
  ['2:3', 'video-1776941059899-6'],
  ['2:4', 'video-1776941059899-4'],
  ['2:5', 'video-1776941059900-8'],
  ['2:6', 'video-1776941059900-10'],
  ['2:7', 'video-1776941059900-12'],
  ['2:8', 'video-1776941059899-2'],
  ['2:9', 'video-1776941059899-5'],
  ['2:10', 'video-1776941059900-11'],
  ['2:11', 'video-1776941059899-3'],
  ['2:12', 'video-1776941059900-9'],
  ['1:1', 'video-1776941066787-24'],
  ['1:2', 'video-1776941066786-13'],
  ['1:3', 'video-1776941066786-17'],
  ['1:4', 'video-1776941066786-18'],
  ['1:5', 'video-1776941066787-19'],
  ['1:6', 'video-1776941066787-21'],
  ['1:7', 'video-1776941066786-16'],
  ['1:8', 'video-1776941066786-14'],
  ['1:9', 'video-1776941066787-22'],
  ['1:10', 'video-1776941066786-15'],
  ['1:11', 'video-1776941066787-20'],
  ['1:12', 'video-1776941066787-23'],
]);

function buildTraceVideos(): MergeAiCandidateVideo[] {
  return Array.from(traceVideoIdsByEpisode.entries()).map(([episodeKey, id]) => {
    const [seasonNumber, episodeNumber] = episodeKey.split(':').map(Number);
    return createCandidateVideo(id, seasonNumber, episodeNumber);
  });
}

function buildTraceTracks(): MergeAiCandidateTrack[] {
  const episodePairs = [
    ...Array.from({ length: 12 }, (_, index) => ({ seasonNumber: 2, episodeNumber: 12 - index })),
    ...Array.from({ length: 12 }, (_, index) => ({ seasonNumber: 1, episodeNumber: 12 - index })),
  ];

  return [
    ...episodePairs.map(({ seasonNumber, episodeNumber }, index) =>
      createCandidateTrack(`track-1776941072099-${25 + index}`, seasonNumber, episodeNumber, 'version_2')
    ),
    ...episodePairs.map(({ seasonNumber, episodeNumber }, index) =>
      createCandidateTrack(`track-1776941072100-${49 + index}`, seasonNumber, episodeNumber, 'gpt-54-french')
    ),
  ];
}

function getRequiredMapValue(map: Map<string, string>, key: string): string {
  const value = map.get(key);
  if (!value) {
    throw new Error(`Missing test fixture value for ${key}`);
  }

  return value;
}

describe('merge-ai-core', () => {
  it('maps the traced multi-season response through short ids without internal id drift', () => {
    const videos = buildTraceVideos();
    const tracks = buildTraceTracks();
    const idMaps = createMergeAiPromptIdMaps(videos, tracks);
    const promptMatchResponse = {
      matches: tracks.map((track) => {
        const promptTrackId = getRequiredMapValue(idMaps.trackPromptIdByRealId, track.id);
        const realVideoId = getRequiredMapValue(
          traceVideoIdsByEpisode,
          `${track.seasonNumber}:${track.episodeNumber}`,
        );
        const promptVideoId = getRequiredMapValue(idMaps.videoPromptIdByRealId, realVideoId);

        return {
          trackId: promptTrackId,
          videoId: promptVideoId,
          confidence: 'high',
          reason: 'Exact season/episode match.',
        };
      }),
    };

    const parsedResult = parseAndValidateMergeAiResponse(
      JSON.stringify(promptMatchResponse),
      idMaps.realTrackIdByPromptId.keys(),
      idMaps.realVideoIdByPromptId.keys(),
    );
    const mappedMatches = mapMergeAiPromptMatchesToRealIds(parsedResult.matches, idMaps);
    const semanticResult = validateMergeAiSemanticMatches(mappedMatches, tracks, videos);
    const matchByTrackId = new Map(semanticResult.matches.map(match => [match.trackId, match]));

    expect(parsedResult.warnings).toHaveLength(0);
    expect(semanticResult.warnings).toHaveLength(0);
    expect(semanticResult.matches).toHaveLength(48);

    for (const track of tracks) {
      const expectedVideoId = traceVideoIdsByEpisode.get(`${track.seasonNumber}:${track.episodeNumber}`);
      expect(matchByTrackId.get(track.id)?.videoId).toBe(expectedVideoId);
    }
  });

  it('leaves an unknown AI video id unmatched without failing the full response', () => {
    const result = parseAndValidateMergeAiResponse(
      JSON.stringify({
        matches: [
          {
            trackId: 't001',
            videoId: 'v999',
            confidence: 'high',
            reason: 'Exact filename match.',
          },
        ],
      }),
      ['t001'],
      ['v001'],
    );

    expect(result.matches).toEqual([
      {
        trackId: 't001',
        videoId: null,
        confidence: 'high',
        reason: 'The AI referenced an unknown video, so this track was left unmatched.',
      },
    ]);
    expect(result.warnings).toEqual([
      'Match 1 referenced an unknown videoId and was left unmatched.',
    ]);
  });

  it('rejects an existing video id when the season or episode does not match', () => {
    const tracks = [createCandidateTrack('track-s02e10', 2, 10)];
    const videos = [createCandidateVideo('video-s01e10', 1, 10)];

    const result = validateMergeAiSemanticMatches(
      [
        {
          trackId: 'track-s02e10',
          videoId: 'video-s01e10',
          confidence: 'high',
          reason: 'The AI said this was exact.',
        },
      ],
      tracks,
      videos,
    );

    expect(result.matches).toEqual([
      {
        trackId: 'track-s02e10',
        videoId: null,
        confidence: 'low',
        reason: 'Rejected AI match because the video season/episode did not match this track.',
      },
    ]);
    expect(result.warnings).toHaveLength(1);
  });

  it('uses short prompt ids in payloads and maps them back to real ids', () => {
    const videos = [createCandidateVideo('video-1776941059899-1', 2, 2)];
    const tracks = [createCandidateTrack('track-1776941072099-35', 2, 2)];
    const idMaps = createMergeAiPromptIdMaps(videos, tracks);
    const payload = buildMergeAiPromptPayload(videos, tracks, idMaps);

    expect(payload.videos[0].id).toBe('v001');
    expect(payload.tracks[0].id).toBe('t001');

    const serializedPayload = JSON.stringify(payload);
    expect(serializedPayload).not.toContain('video-1776941059899-1');
    expect(serializedPayload).not.toContain('track-1776941072099-35');

    expect(mapMergeAiPromptMatchesToRealIds([
      {
        trackId: 't001',
        videoId: 'v001',
        confidence: 'high',
        reason: 'Exact match.',
      },
    ], idMaps)).toEqual([
      {
        trackId: 'track-1776941072099-35',
        videoId: 'video-1776941059899-1',
        confidence: 'high',
        reason: 'Exact match.',
      },
    ]);
  });
});
