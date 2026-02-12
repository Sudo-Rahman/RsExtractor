import type { TranscriptionVersion } from '$lib/types/deepgram';
import type { OcrSubtitle, OcrVersion } from '$lib/types/video-ocr';
import type { SubtitleFile } from '$lib/types/translation';

import { formatToSRT } from './deepgram';

function getBaseName(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index > 0 ? fileName.slice(0, index) : fileName;
}

function formatSrtTimestamp(milliseconds: number): string {
  const safeMilliseconds = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(safeMilliseconds / 3_600_000);
  const minutes = Math.floor((safeMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((safeMilliseconds % 60_000) / 1000);
  const ms = safeMilliseconds % 1000;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function formatOcrSubtitlesToSrt(subtitles: OcrSubtitle[]): string {
  return subtitles
    .map((subtitle, index) => {
      const start = formatSrtTimestamp(subtitle.startTime);
      const end = formatSrtTimestamp(subtitle.endTime);
      return `${index + 1}\n${start} --> ${end}\n${subtitle.text}\n`;
    })
    .join('\n');
}

export function ocrVersionToSubtitleFile(
  videoPath: string,
  videoName: string,
  version: OcrVersion,
): SubtitleFile {
  const content = formatOcrSubtitlesToSrt(version.finalSubtitles);
  const baseName = getBaseName(videoName);

  return {
    path: `mediaflow://ocr/${encodeURIComponent(videoPath)}?version=${encodeURIComponent(version.id)}`,
    name: `${baseName}_${version.name}.srt`,
    format: 'srt',
    content,
    size: new Blob([content]).size,
  };
}

export function transcriptionVersionToSubtitleFile(
  audioPath: string,
  audioName: string,
  version: TranscriptionVersion,
): SubtitleFile {
  const content = formatToSRT(version.result);
  const baseName = getBaseName(audioName);

  return {
    path: `mediaflow://audio-to-subs/${encodeURIComponent(audioPath)}?version=${encodeURIComponent(version.id)}`,
    name: `${baseName}_${version.name}.srt`,
    format: 'srt',
    content,
    size: new Blob([content]).size,
  };
}
