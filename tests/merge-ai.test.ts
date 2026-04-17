import { describe, expect, it } from 'vitest';

import {
  buildMergeAiPromptPayload,
  parseAndValidateMergeAiResponse,
} from '../src/lib/services/merge-ai-core';

describe('merge AI payload and response validation', () => {
  it('preserves exact season and episode metadata', () => {
    const payload = buildMergeAiPromptPayload(
      [
        {
          id: 'video-1',
          filename: 'Show.S02E05.mkv',
          normalizedBasename: 'show s02e05',
          seasonNumber: 2,
          episodeNumber: 5,
          duration: 1440,
          size: 1_000_000,
          sourceTrackSummary: [{ type: 'audio', codec: 'aac', language: 'eng' }],
        },
      ],
      [
        {
          id: 'track-1',
          filename: 'Show.S02E05.eng.ass',
          normalizedBasename: 'show s02e05 eng',
          type: 'subtitle',
          codec: 'ass',
          language: 'eng',
          title: 'English',
          default: false,
          forced: false,
          seasonNumber: 2,
          episodeNumber: 5,
          probe: {
            status: 'ready',
            tracks: [{ type: 'subtitle', codec: 'ass', language: 'eng' }],
          },
        },
      ],
    );

    expect(payload.videos[0]?.seasonNumber).toBe(2);
    expect(payload.videos[0]?.episodeNumber).toBe(5);
    expect(payload.tracks[0]?.seasonNumber).toBe(2);
    expect(payload.tracks[0]?.episodeNumber).toBe(5);
  });

  it('allows ambiguous tracks to remain unmatched', () => {
    const matches = parseAndValidateMergeAiResponse(
      JSON.stringify({
        matches: [
          {
            trackId: 'track-1',
            videoId: null,
            confidence: 'low',
            reason: 'No exact episode marker was found.',
          },
        ],
      }),
      ['track-1'],
      ['video-1'],
    );

    expect(matches).toEqual([
      {
        trackId: 'track-1',
        videoId: null,
        confidence: 'low',
        reason: 'No exact episode marker was found.',
      },
    ]);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseAndValidateMergeAiResponse('{not-json}', ['track-1'], ['video-1']))
      .toThrow(/not valid JSON/i);
  });

  it('rejects unknown ids and duplicate track entries', () => {
    expect(() => parseAndValidateMergeAiResponse(
      JSON.stringify({
        matches: [
          { trackId: 'track-1', videoId: 'video-1', confidence: 'high', reason: 'Exact match' },
          { trackId: 'track-1', videoId: 'video-1', confidence: 'high', reason: 'Duplicate' },
        ],
      }),
      ['track-1'],
      ['video-1'],
    )).toThrow(/duplicate/i);

    expect(() => parseAndValidateMergeAiResponse(
      JSON.stringify({
        matches: [
          { trackId: 'track-2', videoId: 'video-1', confidence: 'high', reason: 'Unknown track' },
        ],
      }),
      ['track-1'],
      ['video-1'],
    )).toThrow(/unknown trackId/i);

    expect(() => parseAndValidateMergeAiResponse(
      JSON.stringify({
        matches: [
          { trackId: 'track-1', videoId: 'video-2', confidence: 'high', reason: 'Unknown video' },
        ],
      }),
      ['track-1'],
      ['video-1'],
    )).toThrow(/unknown videoId/i);
  });

  it('rejects invalid confidence values', () => {
    expect(() => parseAndValidateMergeAiResponse(
      JSON.stringify({
        matches: [
          { trackId: 'track-1', videoId: 'video-1', confidence: 'certain', reason: 'Too confident' },
        ],
      }),
      ['track-1'],
      ['video-1'],
    )).toThrow(/invalid confidence/i);
  });
});
