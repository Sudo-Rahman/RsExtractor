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
    const result = parseAndValidateMergeAiResponse(
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

    expect(result.matches).toEqual([
      {
        trackId: 'track-1',
        videoId: null,
        confidence: 'low',
        reason: 'No exact episode marker was found.',
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseAndValidateMergeAiResponse('{not-json}', ['track-1'], ['video-1']))
      .toThrow(/not valid JSON/i);
  });

  it('warns about unknown ids and duplicate track entries without failing the full response', () => {
    const duplicateResult = parseAndValidateMergeAiResponse(
      JSON.stringify({
        matches: [
          { trackId: 'track-1', videoId: 'video-1', confidence: 'high', reason: 'Exact match' },
          { trackId: 'track-1', videoId: 'video-1', confidence: 'high', reason: 'Duplicate' },
        ],
      }),
      ['track-1'],
      ['video-1'],
    );

    expect(duplicateResult.matches).toEqual([
      { trackId: 'track-1', videoId: 'video-1', confidence: 'high', reason: 'Exact match' },
    ]);
    expect(duplicateResult.warnings).toEqual(['Duplicate AI match for track-1 was ignored.']);

    const unknownTrackResult = parseAndValidateMergeAiResponse(
      JSON.stringify({
        matches: [
          { trackId: 'track-2', videoId: 'video-1', confidence: 'high', reason: 'Unknown track' },
        ],
      }),
      ['track-1'],
      ['video-1'],
    );

    expect(unknownTrackResult.matches).toEqual([]);
    expect(unknownTrackResult.warnings).toEqual([
      'Match 1 was ignored because it referenced an unknown trackId.',
    ]);

    const unknownVideoResult = parseAndValidateMergeAiResponse(
      JSON.stringify({
        matches: [
          { trackId: 'track-1', videoId: 'video-2', confidence: 'high', reason: 'Unknown video' },
        ],
      }),
      ['track-1'],
      ['video-1'],
    );

    expect(unknownVideoResult.matches).toEqual([
      {
        trackId: 'track-1',
        videoId: null,
        confidence: 'low',
        reason: 'The AI referenced an unknown video, so this track was left unmatched.',
      },
    ]);
    expect(unknownVideoResult.warnings).toEqual([
      'Match 1 referenced an unknown videoId and was left unmatched.',
    ]);
  });

  it('ignores invalid confidence values', () => {
    const result = parseAndValidateMergeAiResponse(
      JSON.stringify({
        matches: [
          { trackId: 'track-1', videoId: 'video-1', confidence: 'certain', reason: 'Too confident' },
        ],
      }),
      ['track-1'],
      ['video-1'],
    );

    expect(result.matches).toEqual([]);
    expect(result.warnings).toEqual([
      'Match 1 was ignored because it contained an invalid confidence value.',
    ]);
  });

  it('keeps a later valid duplicate when the first entry references an unknown video', () => {
    const result = parseAndValidateMergeAiResponse(
      JSON.stringify({
        matches: [
          { trackId: 'track-1', videoId: 'video-2', confidence: 'high', reason: 'Stale video id' },
          { trackId: 'track-1', videoId: 'video-1', confidence: 'high', reason: 'Valid fallback' },
        ],
      }),
      ['track-1'],
      ['video-1'],
    );

    expect(result.matches).toEqual([
      {
        trackId: 'track-1',
        videoId: 'video-1',
        confidence: 'high',
        reason: 'Valid fallback',
      },
    ]);
    expect(result.warnings).toEqual([
      'Match 1 referenced an unknown videoId and was left unmatched.',
    ]);
  });

  it('keeps a later valid duplicate when the first entry is invalid', () => {
    const result = parseAndValidateMergeAiResponse(
      JSON.stringify({
        matches: [
          { trackId: 'track-1', videoId: 'video-1', confidence: 'certain', reason: 'Invalid confidence' },
          { trackId: 'track-1', videoId: 'video-1', confidence: 'high', reason: 'Valid fallback' },
        ],
      }),
      ['track-1'],
      ['video-1'],
    );

    expect(result.matches).toEqual([
      {
        trackId: 'track-1',
        videoId: 'video-1',
        confidence: 'high',
        reason: 'Valid fallback',
      },
    ]);
    expect(result.warnings).toEqual([
      'Match 1 was ignored because it contained an invalid confidence value.',
    ]);
  });
});
