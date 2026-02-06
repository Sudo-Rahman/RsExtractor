import type {
  OcrConfig,
  OcrRegion,
  OcrRetryMode,
  OcrSubtitle,
  OcrRawFrame,
  OcrVersion,
  VideoOcrPersistenceData,
} from '$lib/types';
import { loadRsextData, saveRsextData } from './rsext-storage';

function generateVersionId(): string {
  return `ocr-v-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function createOcrVersion(
  name: string,
  mode: OcrRetryMode,
  configSnapshot: OcrConfig,
  rawOcr: OcrRawFrame[],
  finalSubtitles: OcrSubtitle[],
): OcrVersion {
  return {
    id: generateVersionId(),
    name,
    createdAt: new Date().toISOString(),
    mode,
    configSnapshot: { ...configSnapshot },
    rawOcr: [...rawOcr],
    finalSubtitles: [...finalSubtitles],
  };
}

export function generateOcrVersionName(existingVersions: OcrVersion[]): string {
  return `Version ${existingVersions.length + 1}`;
}

function createEmptyOcrData(
  videoPath: string,
  previewPath?: string,
  ocrRegion?: OcrRegion,
): VideoOcrPersistenceData {
  const now = new Date().toISOString();
  return {
    version: 1,
    videoPath,
    previewPath,
    ocrRegion,
    ocrVersions: [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function loadOcrData(videoPath: string): Promise<VideoOcrPersistenceData | null> {
  const rsextData = await loadRsextData(videoPath);
  if (!rsextData?.videoOcr) {
    return null;
  }

  return {
    ...rsextData.videoOcr,
    ocrVersions: [...rsextData.videoOcr.ocrVersions],
  };
}

export async function saveOcrData(
  videoPath: string,
  data: VideoOcrPersistenceData,
): Promise<boolean> {
  const existing = await loadRsextData(videoPath);
  const now = new Date().toISOString();

  return saveRsextData(videoPath, {
    version: 1,
    audioToSubs: existing?.audioToSubs,
    videoOcr: {
      ...data,
      version: 1,
      videoPath,
      createdAt: data.createdAt || now,
      updatedAt: now,
    },
  });
}

export async function addOcrVersion(
  videoPath: string,
  version: OcrVersion,
  options?: {
    previewPath?: string;
    ocrRegion?: OcrRegion;
  },
): Promise<VideoOcrPersistenceData | null> {
  const data = (await loadOcrData(videoPath))
    ?? createEmptyOcrData(videoPath, options?.previewPath, options?.ocrRegion);

  data.ocrVersions = [...data.ocrVersions, version];

  if (options?.previewPath !== undefined) {
    data.previewPath = options.previewPath;
  }
  if (options?.ocrRegion !== undefined) {
    data.ocrRegion = options.ocrRegion;
  }

  const success = await saveOcrData(videoPath, data);
  return success ? data : null;
}
