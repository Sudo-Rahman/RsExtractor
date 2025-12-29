import { invoke } from '@tauri-apps/api/core';
import type { Track, ExtractionResult } from '$lib/types';
import { getExtensionForCodec } from '$lib/types/media';
import { getFileName } from '$lib/utils/format';

export interface ExtractTrackParams {
  inputPath: string;
  outputPath: string;
  trackIndex: number;
  trackType: string;
  codec: string;
}

/**
 * Build output filename for a track
 */
export function buildOutputPath(
  inputPath: string,
  track: Track,
  outputDir: string
): string {
  const baseName = getFileName(inputPath).replace(/\.[^/.]+$/, '');
  const langSuffix = track.language ? `.${track.language}` : '';
  const extension = getExtensionForCodec(track.codec);

  // Format: filename.language.trackX.extension
  return `${outputDir}/${baseName}${langSuffix}.track${track.index}${extension}`;
}

/**
 * Extract a single track from a video file
 */
export async function extractTrack(params: ExtractTrackParams): Promise<ExtractionResult> {
  try {
    await invoke('extract_track', {
      inputPath: params.inputPath,
      outputPath: params.outputPath,
      trackIndex: params.trackIndex,
      trackType: params.trackType,
      codec: params.codec
    });

    return {
      filePath: params.inputPath,
      trackId: params.trackIndex,
      outputPath: params.outputPath,
      success: true
    };
  } catch (error) {
    console.error('FFmpeg extraction error:', error);
    return {
      filePath: params.inputPath,
      trackId: params.trackIndex,
      outputPath: params.outputPath,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Extract multiple tracks from multiple files
 */
export async function extractTracks(
  extractions: ExtractTrackParams[],
  onProgress?: (current: number, total: number, file: string) => void
): Promise<ExtractionResult[]> {
  const results: ExtractionResult[] = [];
  const total = extractions.length;

  for (let i = 0; i < total; i++) {
    const extraction = extractions[i];
    onProgress?.(i + 1, total, extraction.inputPath);

    const result = await extractTrack(extraction);
    results.push(result);
  }

  return results;
}

