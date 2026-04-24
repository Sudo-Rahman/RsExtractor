import { describe, expect, it } from 'vitest';

import type { FFprobeStream } from '$lib/types';
import { parseDerivedBitDepth } from './ffprobe';

function stream(partial: Partial<FFprobeStream>): FFprobeStream {
  return {
    index: 0,
    codec_name: 'hevc',
    codec_type: 'video',
    ...partial,
  };
}

describe('parseDerivedBitDepth', () => {
  it('treats plain yuv420p video as 8-bit instead of reading 42 from chroma subsampling', () => {
    expect(parseDerivedBitDepth(stream({ pix_fmt: 'yuv420p', level: 120 }))).toBe(8);
  });

  it('reads explicit FFprobe raw sample depth before deriving from pixel format', () => {
    expect(parseDerivedBitDepth(stream({ bits_per_raw_sample: '10', pix_fmt: 'yuv420p' }))).toBe(10);
  });

  it('derives high bit depth from common planar and semi-planar video formats', () => {
    expect(parseDerivedBitDepth(stream({ pix_fmt: 'yuv420p10le' }))).toBe(10);
    expect(parseDerivedBitDepth(stream({ pix_fmt: 'p010le' }))).toBe(10);
    expect(parseDerivedBitDepth(stream({ pix_fmt: 'gray16be' }))).toBe(16);
  });

  it('derives audio sample depth from sample format when present', () => {
    expect(parseDerivedBitDepth(stream({ codec_type: 'audio', sample_fmt: 's16p' }))).toBe(16);
  });
});
