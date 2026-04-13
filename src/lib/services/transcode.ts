import { invoke } from '@tauri-apps/api/core';

import type {
  FFprobeOutput,
  Track,
  TranscodeAudioEncoderCapability,
  TranscodeAudioSettings,
  TranscodeAudioTrackOverride,
  TranscodeCapabilities,
  TranscodeContainerCapability,
  TranscodeFile,
  TranscodeMetadata,
  TranscodeOutputTrackPlan,
  TranscodeProfile,
  TranscodeRequest,
  TranscodeSubtitleEncoderCapability,
  TranscodeSubtitleSettings,
  TranscodeTrackMetadataEdit,
  TranscodeVideoEncoderCapability,
  TranscodeVideoSettings,
} from '$lib/types';

let transcodeIdCounter = 0;

export interface TranscodePresetOption {
  value: string;
  label: string;
}

const LOSSY_AUDIO_CODECS = new Set([
  'aac',
  'ac3',
  'eac3',
  'mp2',
  'mp3',
  'opus',
  'vorbis',
  'wmav1',
  'wmav2',
  'wma',
]);

const LOSSLESS_AUDIO_CODECS = new Set([
  'alac',
  'flac',
  'pcm_s16le',
  'pcm_s24le',
  'pcm_s32le',
  'pcm_u8',
  'wavpack',
]);

const X26X_PRESET_OPTIONS: TranscodePresetOption[] = [
  { value: 'ultrafast', label: 'Ultra Fast' },
  { value: 'superfast', label: 'Super Fast' },
  { value: 'veryfast', label: 'Very Fast' },
  { value: 'faster', label: 'Faster' },
  { value: 'fast', label: 'Fast' },
  { value: 'medium', label: 'Medium' },
  { value: 'slow', label: 'Slow' },
  { value: 'slower', label: 'Slower' },
  { value: 'veryslow', label: 'Very Slow' },
  { value: 'placebo', label: 'Placebo' },
];

const SVT_AV1_PRESET_OPTIONS: TranscodePresetOption[] = [
  { value: '-2', label: 'Auto / Expert (-2)' },
  { value: '0', label: '0 · Finest Quality' },
  { value: '1', label: '1 · Very Slow' },
  { value: '2', label: '2 · Slower' },
  { value: '3', label: '3 · Slow' },
  { value: '4', label: '4 · Quality' },
  { value: '5', label: '5 · Balanced Quality' },
  { value: '6', label: '6 · Balanced' },
  { value: '7', label: '7 · Faster Balanced' },
  { value: '8', label: '8 · Fast' },
  { value: '9', label: '9 · Faster' },
  { value: '10', label: '10 · Very Fast' },
  { value: '11', label: '11 · Super Fast' },
  { value: '12', label: '12 · Ultra Fast' },
  { value: '13', label: '13 · Fastest' },
];

const LIBAOM_AV1_PRESET_OPTIONS: TranscodePresetOption[] = [
  { value: '0', label: '0 · Finest Quality' },
  { value: '1', label: '1 · Very High Quality' },
  { value: '2', label: '2 · High Quality' },
  { value: '3', label: '3 · Quality' },
  { value: '4', label: '4 · Balanced' },
  { value: '5', label: '5 · Faster Balanced' },
  { value: '6', label: '6 · Fast' },
  { value: '7', label: '7 · Faster' },
  { value: '8', label: '8 · Fastest' },
];

const VIDEO_PRESET_OPTIONS_BY_ENCODER: Record<string, TranscodePresetOption[]> = {
  libx264: X26X_PRESET_OPTIONS,
  libx265: X26X_PRESET_OPTIONS,
  libsvtav1: SVT_AV1_PRESET_OPTIONS,
  'libaom-av1': LIBAOM_AV1_PRESET_OPTIONS,
};

const TEXT_SUBTITLE_CODECS = new Set([
  'ass',
  'jacosub',
  'microdvd',
  'mov_text',
  'srt',
  'ssa',
  'subrip',
  'text',
  'ttml',
  'webvtt',
]);

const CONTAINER_SUBTITLE_COPY_CODECS: Record<string, string[]> = {
  mov: ['mov_text', 'tx3g'],
  mp4: ['mov_text', 'tx3g'],
  mkv: ['ass', 'dvd_subtitle', 'hdmv_pgs_subtitle', 'ssa', 'srt', 'subrip', 'webvtt'],
  webm: ['webvtt'],
};

const CONTAINER_VIDEO_COPY_CODECS: Record<string, string[]> = {
  mov: ['av1', 'dvvideo', 'h264', 'hevc', 'mjpeg', 'mpeg4', 'prores'],
  mp4: ['av1', 'h264', 'hevc', 'mjpeg', 'mpeg4', 'prores'],
  mkv: ['av1', 'ffv1', 'h264', 'hevc', 'mjpeg', 'mpeg2video', 'mpeg4', 'prores', 'theora', 'vp8', 'vp9'],
  webm: ['av1', 'vp8', 'vp9'],
};

const CONTAINER_AUDIO_COPY_CODECS: Record<string, string[]> = {
  mov: ['aac', 'ac3', 'alac', 'eac3', 'mp3', 'pcm_f32le', 'pcm_f64le', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le'],
  mp4: ['aac', 'ac3', 'alac', 'eac3', 'mp3'],
  mkv: ['aac', 'ac3', 'alac', 'dts', 'eac3', 'flac', 'mp2', 'mp3', 'opus', 'pcm_f32le', 'pcm_f64le', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'truehd', 'vorbis'],
  webm: ['opus', 'vorbis'],
  aac: ['aac'],
  mp3: ['mp3'],
  flac: ['flac'],
  opus: ['opus'],
  ogg: ['flac', 'opus', 'vorbis'],
  wav: ['pcm_f32le', 'pcm_f64le', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_u8', 'pcm_alaw', 'pcm_mulaw'],
};

const SOURCE_CONTAINER_IDS_BY_EXTENSION: Record<string, string> = {
  '.aac': 'aac',
  '.flac': 'flac',
  '.mkv': 'mkv',
  '.mov': 'mov',
  '.mp3': 'mp3',
  '.mp4': 'mp4',
  '.ogg': 'ogg',
  '.opus': 'opus',
  '.wav': 'wav',
  '.webm': 'webm',
};

export function createTranscodeId(prefix: string = 'transcode'): string {
  return `${prefix}-${Date.now()}-${++transcodeIdCounter}`;
}

export function cloneAdditionalArgs<T extends { id: string; flag: string; value?: string; enabled: boolean }>(
  additionalArgs: T[],
): T[] {
  return additionalArgs.map((item) => ({ ...item }));
}

export function cloneVideoSettings(settings: TranscodeVideoSettings): TranscodeVideoSettings {
  return {
    ...settings,
    additionalArgs: cloneAdditionalArgs(settings.additionalArgs),
  };
}

export function cloneAudioTrackOverride(
  settings: TranscodeAudioTrackOverride,
): TranscodeAudioTrackOverride {
  return {
    ...settings,
    additionalArgs: cloneAdditionalArgs(settings.additionalArgs ?? []),
  };
}

export function cloneAudioTrackOverrides(
  trackOverrides: TranscodeAudioTrackOverride[],
): TranscodeAudioTrackOverride[] {
  return trackOverrides.map((trackOverride) => cloneAudioTrackOverride(trackOverride));
}

export function cloneAudioSettings(settings: TranscodeAudioSettings): TranscodeAudioSettings {
  return {
    ...settings,
    additionalArgs: cloneAdditionalArgs(settings.additionalArgs),
    trackOverrides: cloneAudioTrackOverrides(settings.trackOverrides ?? []),
  };
}

export function cloneSubtitleSettings(settings: TranscodeSubtitleSettings): TranscodeSubtitleSettings {
  return {
    ...settings,
    additionalArgs: cloneAdditionalArgs(settings.additionalArgs),
  };
}

export function cloneTranscodeProfile(profile: TranscodeProfile): TranscodeProfile {
  return {
    containerId: profile.containerId,
    video: cloneVideoSettings(profile.video),
    audio: cloneAudioSettings(profile.audio),
    subtitles: cloneSubtitleSettings(profile.subtitles),
  };
}

export function cloneTranscodeMetadata(metadata: TranscodeMetadata): TranscodeMetadata {
  return {
    containerTitle: metadata.containerTitle,
    trackEdits: metadata.trackEdits.map((trackEdit) => ({ ...trackEdit })),
  };
}

const FALLBACK_METADATA_SCHEMA = {
  supportsContainerTitle: true,
  supportsTrackTitle: true,
  supportsLanguage: true,
  supportsDefault: true,
  supportsForced: true,
  clearsMatroskaStatistics: false,
};

export function getMetadataSchemaForContainer(
  capabilities: TranscodeCapabilities | null,
  containerId: string,
): TranscodeContainerCapability['metadataSchema'] {
  const container = getContainerCapability(capabilities, containerId);
  if (container?.metadataSchema) {
    return container.metadataSchema;
  }

  if (containerId === 'mkv' || containerId === 'webm') {
    return {
      supportsContainerTitle: true,
      supportsTrackTitle: true,
      supportsLanguage: true,
      supportsDefault: true,
      supportsForced: containerId === 'mkv',
      clearsMatroskaStatistics: true,
    };
  }

  if (['aac', 'flac', 'mp3', 'ogg', 'opus', 'wav'].includes(containerId)) {
    return {
      supportsContainerTitle: true,
      supportsTrackTitle: true,
      supportsLanguage: true,
      supportsDefault: false,
      supportsForced: false,
      clearsMatroskaStatistics: false,
    };
  }

  if (containerId === 'mp4' || containerId === 'mov') {
    return {
      supportsContainerTitle: true,
      supportsTrackTitle: true,
      supportsLanguage: true,
      supportsDefault: true,
      supportsForced: false,
      clearsMatroskaStatistics: false,
    };
  }

  return FALLBACK_METADATA_SCHEMA;
}

export async function getTranscodeCapabilities(): Promise<TranscodeCapabilities> {
  return invoke<TranscodeCapabilities>('get_transcode_capabilities');
}

export async function transcodeMedia(request: TranscodeRequest): Promise<string> {
  return invoke<string>('transcode_media', { request });
}

export async function extractTranscodeAnalysisFrames(
  inputPath: string,
  frameCount?: number,
): Promise<string[]> {
  return invoke<string[]>('extract_transcode_analysis_frames', {
    inputPath,
    frameCount,
  });
}

export function getContainerCapability(
  capabilities: TranscodeCapabilities | null,
  containerId: string,
): TranscodeContainerCapability | undefined {
  return capabilities?.containers.find((container) => container.id === containerId);
}

export function getVideoEncoderCapability(
  capabilities: TranscodeCapabilities | null,
  encoderId?: string,
): TranscodeVideoEncoderCapability | undefined {
  if (!encoderId) return undefined;
  return capabilities?.videoEncoders.find((encoder) => encoder.id === encoderId);
}

export function getAudioEncoderCapability(
  capabilities: TranscodeCapabilities | null,
  encoderId?: string,
): TranscodeAudioEncoderCapability | undefined {
  if (!encoderId) return undefined;
  return capabilities?.audioEncoders.find((encoder) => encoder.id === encoderId);
}

export function getSubtitleEncoderCapability(
  capabilities: TranscodeCapabilities | null,
  encoderId?: string,
): TranscodeSubtitleEncoderCapability | undefined {
  if (!encoderId) return undefined;
  return capabilities?.subtitleEncoders.find((encoder) => encoder.id === encoderId);
}

export function getTracksByType(file: Pick<TranscodeFile, 'tracks'>, type: Track['type']): Track[] {
  return file.tracks.filter((track) => track.type === type);
}

export function getPrimaryVideoTrack(file: Pick<TranscodeFile, 'tracks'>): Track | undefined {
  return getTracksByType(file, 'video')[0];
}

export function getPrimaryAudioTrack(file: Pick<TranscodeFile, 'tracks'>): Track | undefined {
  return getTracksByType(file, 'audio')[0];
}

function createTrackMetadataEdit(
  track: Track,
  existing?: TranscodeTrackMetadataEdit,
): TranscodeTrackMetadataEdit {
  return {
    sourceTrackId: track.id,
    title: existing?.title ?? track.title ?? '',
    language: existing?.language ?? track.language ?? 'und',
    default: existing?.default ?? track.default ?? false,
    forced: existing?.forced ?? track.forced ?? false,
  };
}

function findTrackMetadataEdit(
  metadata: TranscodeMetadata | undefined,
  sourceTrackId: number,
): TranscodeTrackMetadataEdit | undefined {
  return metadata?.trackEdits.find((trackEdit) => trackEdit.sourceTrackId === sourceTrackId);
}

function resolveOutputTrackCodec(
  track: Track,
  mode: TranscodeOutputTrackPlan['mode'],
  encoderId: string | undefined,
  capabilities: TranscodeCapabilities | null,
): string {
  if (mode === 'copy') {
    return track.codec;
  }

  if (track.type === 'video') {
    return getVideoEncoderCapability(capabilities, encoderId)?.codec ?? encoderId ?? track.codec;
  }

  if (track.type === 'audio') {
    return getAudioEncoderCapability(capabilities, encoderId)?.codec ?? encoderId ?? track.codec;
  }

  return getSubtitleEncoderCapability(capabilities, encoderId)?.codec ?? encoderId ?? track.codec;
}

export function buildTranscodeOutputTrackPlan(
  file: Pick<TranscodeFile, 'tracks' | 'hasVideo' | 'hasAudio' | 'profile' | 'metadata'>,
  capabilities: TranscodeCapabilities | null,
): TranscodeOutputTrackPlan[] {
  const plan: TranscodeOutputTrackPlan[] = [];
  const addTrack = (
    track: Track,
    mode: TranscodeOutputTrackPlan['mode'],
    encoderId?: string,
  ) => {
    const outputIndex = plan.length;
    const metadata = createTrackMetadataEdit(
      track,
      findTrackMetadataEdit(file.metadata, track.id),
    );

    plan.push({
      key: `${outputIndex}-${track.id}-${track.type}`,
      outputIndex,
      sourceTrackId: track.id,
      type: track.type,
      sourceTrack: track,
      mode,
      codec: resolveOutputTrackCodec(track, mode, encoderId, capabilities),
      metadata,
    });
  };

  const videoTrack = getPrimaryVideoTrack(file);
  if (file.hasVideo && videoTrack && file.profile.video.mode !== 'disable') {
    addTrack(
      videoTrack,
      file.profile.video.mode === 'copy' ? 'copy' : 'transcode',
      file.profile.video.encoderId,
    );
  }

  if (file.hasAudio) {
    for (const audioTrack of getTracksByType(file, 'audio')) {
      const audioSettings = getEffectiveAudioSettingsForTrack(file.profile.audio, audioTrack.id);
      if (audioSettings.mode === 'disable') {
        continue;
      }

      addTrack(
        audioTrack,
        audioSettings.mode === 'copy' ? 'copy' : 'transcode',
        audioSettings.encoderId,
      );
    }
  }

  if (file.profile.subtitles.mode !== 'disable') {
    for (const subtitleTrack of getTracksByType(file, 'subtitle')) {
      const shouldConvert = file.profile.subtitles.mode === 'convert_text' && isTextSubtitleCodec(subtitleTrack.codec);
      addTrack(
        subtitleTrack,
        shouldConvert ? 'convert_text' : 'copy',
        shouldConvert ? file.profile.subtitles.encoderId : undefined,
      );
    }
  }

  return plan;
}

export function normalizeTranscodeMetadata(
  metadata: TranscodeMetadata | undefined,
  file: Pick<TranscodeFile, 'tracks' | 'hasVideo' | 'hasAudio' | 'profile'>,
  capabilities: TranscodeCapabilities | null,
): TranscodeMetadata {
  const metadataSource = metadata ?? { trackEdits: [] };
  const fileWithMetadata = {
    ...file,
    metadata: metadataSource,
  };

  return {
    containerTitle: metadataSource.containerTitle,
    trackEdits: buildTranscodeOutputTrackPlan(fileWithMetadata, capabilities)
      .map((track) => track.metadata),
  };
}

export function buildDefaultTranscodeMetadata(
  file: Pick<TranscodeFile, 'tracks' | 'hasVideo' | 'hasAudio' | 'profile'>,
  capabilities: TranscodeCapabilities | null,
): TranscodeMetadata {
  return normalizeTranscodeMetadata({ trackEdits: [] }, file, capabilities);
}

export function updateTranscodeMetadataTrack(
  metadata: TranscodeMetadata,
  sourceTrackId: number,
  updates: Partial<TranscodeTrackMetadataEdit>,
): TranscodeMetadata {
  return {
    ...metadata,
    trackEdits: metadata.trackEdits.map((trackEdit) =>
      trackEdit.sourceTrackId === sourceTrackId
        ? { ...trackEdit, ...updates, sourceTrackId }
        : trackEdit,
    ),
  };
}

export function applyTranscodeMetadataBatch(
  metadata: TranscodeMetadata,
  sourceTrackIds: number[],
  patch: Partial<Pick<TranscodeTrackMetadataEdit, 'language' | 'default' | 'forced'>>,
  titlePattern?: string,
): TranscodeMetadata {
  const selectedIds = new Set(sourceTrackIds);
  let selectedIndex = 0;

  return {
    ...metadata,
    trackEdits: metadata.trackEdits.map((trackEdit) => {
      if (!selectedIds.has(trackEdit.sourceTrackId)) {
        return trackEdit;
      }

      selectedIndex += 1;
      return {
        ...trackEdit,
        ...patch,
        title: titlePattern !== undefined
          ? titlePattern.replaceAll('{n}', selectedIndex.toString())
          : trackEdit.title,
      };
    }),
  };
}

export function getAudioTrackOverride(
  settings: Pick<TranscodeAudioSettings, 'trackOverrides'>,
  trackId: number,
): TranscodeAudioTrackOverride | undefined {
  return settings.trackOverrides.find((trackOverride) => trackOverride.trackId === trackId);
}

export function hasCustomAudioTrackOverride(
  settings: Pick<TranscodeAudioSettings, 'trackOverrides'>,
  trackId: number,
): boolean {
  return Boolean(getAudioTrackOverride(settings, trackId));
}

export function getEffectiveAudioSettingsForTrack(
  settings: Pick<TranscodeAudioSettings, 'mode' | 'encoderId' | 'bitrateKbps' | 'channels' | 'sampleRate' | 'trackOverrides'>,
  trackId: number,
): TranscodeAudioTrackOverride {
  const trackOverride = getAudioTrackOverride(settings, trackId);

  return {
    trackId,
    mode: trackOverride?.mode ?? settings.mode,
    encoderId: trackOverride?.encoderId ?? settings.encoderId,
    bitrateKbps: trackOverride?.bitrateKbps ?? settings.bitrateKbps,
    channels: trackOverride?.channels ?? settings.channels,
    sampleRate: trackOverride?.sampleRate ?? settings.sampleRate,
    additionalArgs: cloneAdditionalArgs(trackOverride?.additionalArgs ?? []),
  };
}

export function stripAudioTrackOverrides(settings: TranscodeAudioSettings): TranscodeAudioSettings {
  const next = cloneAudioSettings(settings);
  next.trackOverrides = [];
  return next;
}

export function getContainerExtension(
  capabilities: TranscodeCapabilities | null,
  containerId: string,
): string {
  return getContainerCapability(capabilities, containerId)?.extension ?? '.mp4';
}

export function isTextSubtitleCodec(codec?: string): boolean {
  const normalized = normalizeCodecName(codec);
  return normalized ? TEXT_SUBTITLE_CODECS.has(normalized) : false;
}

export function canContainerCopySubtitleCodec(containerId: string, codec?: string): boolean {
  const normalizedCodec = normalizeCodecName(codec);
  if (!normalizedCodec) {
    return false;
  }

  return (CONTAINER_SUBTITLE_COPY_CODECS[containerId] ?? []).includes(normalizedCodec);
}

export function canContainerCopyVideoCodec(containerId: string, codec?: string): boolean {
  const normalizedCodec = normalizeCodecName(codec);
  if (!normalizedCodec) {
    return false;
  }

  return (CONTAINER_VIDEO_COPY_CODECS[containerId] ?? []).includes(normalizedCodec);
}

export function canContainerCopyAudioCodec(containerId: string, codec?: string): boolean {
  const normalizedCodec = normalizeCodecName(codec);
  if (!normalizedCodec) {
    return false;
  }

  return (CONTAINER_AUDIO_COPY_CODECS[containerId] ?? []).includes(normalizedCodec);
}

export function canCopyPrimaryVideoTrackToContainer(
  file: Pick<TranscodeFile, 'tracks'>,
  containerId: string,
): boolean {
  const primaryVideoTrack = getPrimaryVideoTrack(file);
  if (!primaryVideoTrack) {
    return true;
  }

  return canContainerCopyVideoCodec(containerId, primaryVideoTrack.codec);
}

export function getUnsupportedAudioCopyTracks(
  file: Pick<TranscodeFile, 'tracks'>,
  containerId: string,
): Track[] {
  return getTracksByType(file, 'audio').filter((track) => !canContainerCopyAudioCodec(containerId, track.codec));
}

export function canCopyAudioTracksToContainer(
  file: Pick<TranscodeFile, 'tracks'>,
  containerId: string,
): boolean {
  return getUnsupportedAudioCopyTracks(file, containerId).length === 0;
}

export function getUnsupportedSubtitleCopyTracks(
  file: Pick<TranscodeFile, 'tracks'>,
  containerId: string,
): Track[] {
  return getTracksByType(file, 'subtitle').filter((track) => !canContainerCopySubtitleCodec(containerId, track.codec));
}

export function canCopySubtitleTracksToContainer(
  file: Pick<TranscodeFile, 'tracks'>,
  containerId: string,
): boolean {
  return getUnsupportedSubtitleCopyTracks(file, containerId).length === 0;
}

export function hasOnlyTextSubtitleTracks(file: Pick<TranscodeFile, 'tracks'>): boolean {
  const subtitleTracks = getTracksByType(file, 'subtitle');
  return subtitleTracks.length > 0 && subtitleTracks.every((track) => isTextSubtitleCodec(track.codec));
}

function normalizeCodecName(codec?: string): string | undefined {
  const normalized = codec?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function getPathExtension(path: string): string | undefined {
  const lastDot = path.lastIndexOf('.');
  return lastDot >= 0 ? path.slice(lastDot).toLowerCase() : undefined;
}

export function isLossyAudioCodec(codec?: string): boolean {
  const normalized = normalizeCodecName(codec);
  return normalized ? LOSSY_AUDIO_CODECS.has(normalized) : false;
}

export function isLosslessAudioCodec(codec?: string): boolean {
  const normalized = normalizeCodecName(codec);
  return normalized ? LOSSLESS_AUDIO_CODECS.has(normalized) : false;
}

export function getVideoPresetOptions(encoderId?: string): TranscodePresetOption[] {
  if (!encoderId) {
    return [];
  }

  return VIDEO_PRESET_OPTIONS_BY_ENCODER[encoderId] ?? [];
}

export function getDefaultVideoPresetValue(encoderId?: string): string | undefined {
  if (!encoderId) {
    return undefined;
  }

  if (encoderId === 'libaom-av1') {
    return '4';
  }

  if (encoderId === 'libsvtav1') {
    return '6';
  }

  if (encoderId === 'libx264' || encoderId === 'libx265') {
    return 'medium';
  }

  return getVideoPresetOptions(encoderId)[0]?.value;
}

function clampVideoPresetValue(encoderId?: string, preset?: string): string | undefined {
  const presetOptions = getVideoPresetOptions(encoderId);
  if (presetOptions.length === 0) {
    return undefined;
  }

  if (preset && presetOptions.some((option) => option.value === preset)) {
    return preset;
  }

  return getDefaultVideoPresetValue(encoderId);
}

export function hasManualVideoQualityControls(
  encoder?: Pick<TranscodeVideoEncoderCapability, 'supportsCrf' | 'supportsQp' | 'supportsBitrate'> | null,
): boolean {
  return Boolean(encoder?.supportsCrf || encoder?.supportsQp || encoder?.supportsBitrate);
}

function getDefaultVideoQualityMode(
  encoder?: Pick<TranscodeVideoEncoderCapability, 'supportsCrf' | 'supportsQp' | 'supportsBitrate'> | null,
  currentMode?: TranscodeVideoSettings['qualityMode'],
): TranscodeVideoSettings['qualityMode'] {
  if (currentMode === 'crf' && encoder?.supportsCrf) {
    return 'crf';
  }

  if (currentMode === 'qp' && encoder?.supportsQp) {
    return 'qp';
  }

  if (currentMode === 'bitrate' && encoder?.supportsBitrate) {
    return 'bitrate';
  }

  if (encoder?.supportsCrf) {
    return 'crf';
  }

  if (encoder?.supportsQp) {
    return 'qp';
  }

  if (encoder?.supportsBitrate) {
    return 'bitrate';
  }

  return currentMode ?? 'bitrate';
}

function applyVideoQualityDefaults(
  settings: TranscodeVideoSettings,
  encoder?: TranscodeVideoEncoderCapability,
): void {
  settings.qualityMode = getDefaultVideoQualityMode(encoder, settings.qualityMode);

  if (settings.qualityMode === 'crf' && encoder?.supportsCrf) {
    settings.crf ??= encoder.codec === 'hevc' ? 22 : 20;
  } else {
    settings.crf = undefined;
  }

  if (settings.qualityMode === 'qp' && encoder?.supportsQp) {
    settings.qp ??= 20;
  } else {
    settings.qp = undefined;
  }

  if (settings.qualityMode === 'bitrate' && encoder?.supportsBitrate) {
    settings.bitrateKbps ??= 5000;
  } else {
    settings.bitrateKbps = undefined;
  }
}

function getContainerCandidates(
  capabilities: TranscodeCapabilities | null,
  hasVideo: boolean,
): TranscodeContainerCapability[] {
  return capabilities?.containers.filter((container) =>
    hasVideo ? container.kind === 'video' : container.kind === 'audio',
  ) ?? [];
}

function containerSupportsTranscodeProfile(
  container: TranscodeContainerCapability,
  profile: TranscodeProfile,
  file: Pick<TranscodeFile, 'hasVideo' | 'hasAudio' | 'tracks'>,
): boolean {
  if (file.hasVideo && profile.video.mode === 'copy' && !canCopyPrimaryVideoTrackToContainer(file, container.id)) {
    return false;
  }

  if (file.hasVideo && profile.video.mode === 'transcode') {
    if (!profile.video.encoderId) {
      return container.supportedVideoEncoderIds.length > 0;
    }

    if (!container.supportedVideoEncoderIds.includes(profile.video.encoderId)) {
      return false;
    }
  }

  if (file.hasAudio && profile.audio.mode === 'transcode') {
    if (!containerSupportsAudioProfile(container, profile, file)) {
      return false;
    }
  }

  if (file.hasAudio && (profile.audio.mode === 'copy' || profile.audio.trackOverrides.length > 0)) {
    if (!containerSupportsAudioProfile(container, profile, file)) {
      return false;
    }
  }

  if (getTracksByType(file, 'subtitle').length > 0 && profile.subtitles.mode === 'convert_text') {
    if (!profile.subtitles.encoderId) {
      return container.supportedSubtitleEncoderIds.length > 0;
    }

    if (!container.supportedSubtitleEncoderIds.includes(profile.subtitles.encoderId)) {
      return false;
    }
  }

  if (getTracksByType(file, 'subtitle').length > 0 && profile.subtitles.mode === 'copy') {
    return canCopySubtitleTracksToContainer(file, container.id);
  }

  return true;
}

export function findCompatibleContainerId(
  capabilities: TranscodeCapabilities | null,
  profile: TranscodeProfile,
  file: Pick<TranscodeFile, 'hasVideo' | 'hasAudio' | 'tracks'>,
): string | undefined {
  const candidates = getContainerCandidates(capabilities, file.hasVideo);
  if (candidates.length === 0) {
    return undefined;
  }

  const requestedContainer = candidates.find((container) => container.id === profile.containerId);
  if (requestedContainer && containerSupportsTranscodeProfile(requestedContainer, profile, file)) {
    return requestedContainer.id;
  }

  return candidates.find((container) => containerSupportsTranscodeProfile(container, profile, file))?.id;
}

export function buildDefaultVideoSettings(
  capabilities: TranscodeCapabilities | null,
  containerId: string,
  hasVideo: boolean,
): TranscodeVideoSettings {
  const container = getContainerCapability(capabilities, containerId);
  const encoderId = container?.defaultVideoEncoderId ?? container?.supportedVideoEncoderIds[0];
  const encoder = getVideoEncoderCapability(capabilities, encoderId);

  const settings: TranscodeVideoSettings = {
    mode: hasVideo ? 'transcode' : 'disable',
    encoderId,
    profile: encoder?.supportedProfiles[0],
    level: encoder?.supportedLevels[0],
    pixelFormat: encoder?.supportedPixelFormats.find((pixelFormat) => pixelFormat.includes('p010'))
      ?? encoder?.supportedPixelFormats.find((pixelFormat) => pixelFormat.includes('420'))
      ?? encoder?.supportedPixelFormats[0],
    qualityMode: 'bitrate',
    crf: undefined,
    qp: undefined,
    bitrateKbps: undefined,
    preset: getVideoPresetOptions(encoderId).length > 0
      ? getDefaultVideoPresetValue(encoderId) ?? (encoder?.isHardware ? 'fast' : 'medium')
      : undefined,
    additionalArgs: [],
  };

  applyVideoQualityDefaults(settings, encoder);

  return settings;
}

export function buildDefaultAudioSettings(
  capabilities: TranscodeCapabilities | null,
  containerId: string,
  hasAudio: boolean,
): TranscodeAudioSettings {
  const container = getContainerCapability(capabilities, containerId);
  const encoderId = container?.defaultAudioEncoderId ?? container?.supportedAudioEncoderIds[0];

  return {
    mode: hasAudio ? 'transcode' : 'disable',
    encoderId,
    bitrateKbps: encoderId?.includes('pcm') || encoderId === 'flac' ? undefined : 160,
    channels: undefined,
    sampleRate: undefined,
    additionalArgs: [],
    trackOverrides: [],
  };
}

export function buildDefaultSubtitleSettings(
  capabilities: TranscodeCapabilities | null,
  containerId: string,
  hasSubtitleTracks: boolean,
): TranscodeSubtitleSettings {
  const container = getContainerCapability(capabilities, containerId);
  const encoderId = container?.defaultSubtitleEncoderId ?? container?.supportedSubtitleEncoderIds[0];

  return {
    mode: hasSubtitleTracks && encoderId ? 'convert_text' : hasSubtitleTracks ? 'copy' : 'disable',
    encoderId: hasSubtitleTracks ? encoderId : undefined,
    additionalArgs: [],
  };
}

function buildPreferredSubtitleSettingsForContainer(
  capabilities: TranscodeCapabilities | null,
  containerId: string,
  file: Pick<TranscodeFile, 'hasVideo' | 'tracks'>,
  current?: TranscodeSubtitleSettings,
): TranscodeSubtitleSettings {
  const container = getContainerCapability(capabilities, containerId);
  const hasSubtitleTracks = getTracksByType(file, 'subtitle').length > 0;
  const defaultEncoderId = container?.defaultSubtitleEncoderId ?? container?.supportedSubtitleEncoderIds[0];
  const additionalArgs = current ? cloneAdditionalArgs(current.additionalArgs) : [];

  if (!file.hasVideo || !hasSubtitleTracks || container?.kind !== 'video') {
    return {
      mode: 'disable',
      encoderId: undefined,
      additionalArgs,
    };
  }

  const canCopy = canCopySubtitleTracksToContainer(file, containerId);
  const canConvertText = hasOnlyTextSubtitleTracks(file) && Boolean(defaultEncoderId);

  if (containerId === 'mp4' || containerId === 'mov') {
    return {
      mode: canConvertText ? 'convert_text' : 'disable',
      encoderId: canConvertText ? defaultEncoderId : undefined,
      additionalArgs,
    };
  }

  if (canCopy) {
    return {
      mode: 'copy',
      encoderId: undefined,
      additionalArgs,
    };
  }

  if (canConvertText) {
    return {
      mode: 'convert_text',
      encoderId: defaultEncoderId,
      additionalArgs,
    };
  }

  return {
    mode: 'disable',
    encoderId: undefined,
    additionalArgs,
  };
}

function pickSourceContainerId(
  capabilities: TranscodeCapabilities | null,
  file: Pick<TranscodeFile, 'path' | 'hasVideo'>,
): string | undefined {
  const pathExtension = getPathExtension(file.path);
  const sourceContainerId = pathExtension ? SOURCE_CONTAINER_IDS_BY_EXTENSION[pathExtension] : undefined;
  if (!sourceContainerId) {
    return undefined;
  }

  const container = getContainerCapability(capabilities, sourceContainerId);
  if (!container) {
    return undefined;
  }

  if (file.hasVideo ? container.kind !== 'video' : container.kind !== 'audio') {
    return undefined;
  }

  return container.id;
}

export function buildDefaultTranscodeProfile(
  capabilities: TranscodeCapabilities | null,
  file: Pick<TranscodeFile, 'path' | 'hasVideo' | 'hasAudio' | 'tracks'>,
): TranscodeProfile {
  const availableContainers = capabilities?.containers.filter((container) =>
    file.hasVideo ? container.kind === 'video' : container.kind === 'audio',
  ) ?? [];
  const defaultContainerId = pickSourceContainerId(capabilities, file)
    ?? availableContainers[0]?.id
    ?? (file.hasVideo ? 'mp4' : 'mp3');

  const video = buildDefaultVideoSettings(capabilities, defaultContainerId, file.hasVideo);
  const audio = buildDefaultAudioSettings(capabilities, defaultContainerId, file.hasAudio);

  if (file.hasVideo && !video.encoderId && canCopyPrimaryVideoTrackToContainer(file, defaultContainerId)) {
    video.mode = 'copy';
  }

  if (file.hasAudio && !audio.encoderId && canCopyAudioTracksToContainer(file, defaultContainerId)) {
    audio.mode = 'copy';
  }

  return {
    containerId: defaultContainerId,
    video,
    audio,
    subtitles: buildPreferredSubtitleSettingsForContainer(capabilities, defaultContainerId, file),
  };
}

function pickContainerForFile(
  capabilities: TranscodeCapabilities | null,
  containerId: string,
  hasVideo: boolean,
): string {
  const container = getContainerCapability(capabilities, containerId);
  if (container && ((hasVideo && container.kind === 'video') || (!hasVideo && container.kind === 'audio'))) {
    return container.id;
  }

  return capabilities?.containers.find((item) =>
    hasVideo ? item.kind === 'video' : item.kind === 'audio',
  )?.id ?? (hasVideo ? 'mp4' : 'mp3');
}

function normalizeOptionalPositiveInt(value?: number): number | undefined {
  return value && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizeAudioSettingsForTrack(
  settings: Pick<TranscodeAudioTrackOverride, 'mode' | 'encoderId' | 'bitrateKbps' | 'channels' | 'sampleRate'>,
  capabilities: TranscodeCapabilities | null,
  container: TranscodeContainerCapability | undefined,
  track: Track,
): Pick<TranscodeAudioTrackOverride, 'mode' | 'encoderId' | 'bitrateKbps' | 'channels' | 'sampleRate'> {
  const next = {
    ...settings,
    bitrateKbps: normalizeOptionalPositiveInt(settings.bitrateKbps),
    channels: normalizeOptionalPositiveInt(settings.channels),
    sampleRate: normalizeOptionalPositiveInt(settings.sampleRate),
  };

  if (next.mode === 'copy') {
    if (container && !canContainerCopyAudioCodec(container.id, track.codec)) {
      const fallbackEncoderId = container.defaultAudioEncoderId ?? container.supportedAudioEncoderIds[0];
      if (!fallbackEncoderId) {
        return {
          mode: 'disable',
          encoderId: undefined,
          bitrateKbps: undefined,
          channels: undefined,
          sampleRate: undefined,
        };
      }

      next.mode = 'transcode';
      next.encoderId = fallbackEncoderId;
    } else {
      return {
        mode: 'copy',
        encoderId: undefined,
        bitrateKbps: undefined,
        channels: undefined,
        sampleRate: undefined,
      };
    }
  }

  if (next.mode === 'disable') {
    return {
      mode: 'disable',
      encoderId: undefined,
      bitrateKbps: undefined,
      channels: undefined,
      sampleRate: undefined,
    };
  }

  const supportedEncoderId = next.encoderId && container?.supportedAudioEncoderIds.includes(next.encoderId)
    ? next.encoderId
    : container?.defaultAudioEncoderId ?? container?.supportedAudioEncoderIds[0];

  if (!supportedEncoderId) {
    return {
      mode: 'disable',
      encoderId: undefined,
      bitrateKbps: undefined,
      channels: undefined,
      sampleRate: undefined,
    };
  }

  const encoder = getAudioEncoderCapability(capabilities, supportedEncoderId);

  return {
    mode: 'transcode',
    encoderId: supportedEncoderId,
    bitrateKbps: encoder?.supportsBitrate === false || encoder?.codec === 'flac' ? undefined : next.bitrateKbps,
    channels: encoder?.supportsChannels === false ? undefined : next.channels,
    sampleRate: encoder?.supportsSampleRate === false ? undefined : next.sampleRate,
  };
}

function normalizeAudioTrackOverrides(
  settings: Pick<TranscodeAudioSettings, 'mode' | 'encoderId' | 'bitrateKbps' | 'channels' | 'sampleRate' | 'trackOverrides'>,
  capabilities: TranscodeCapabilities | null,
  container: TranscodeContainerCapability | undefined,
  file: Pick<TranscodeFile, 'tracks'>,
): TranscodeAudioTrackOverride[] {
  const audioTracks = getTracksByType(file, 'audio');

  return settings.trackOverrides
    .filter((trackOverride) => audioTracks.some((track) => track.id === trackOverride.trackId))
    .map((trackOverride) => {
      const track = audioTracks.find((item) => item.id === trackOverride.trackId);
      if (!track) {
        return trackOverride;
      }

      const normalized = normalizeAudioSettingsForTrack(
        getEffectiveAudioSettingsForTrack(settings, trackOverride.trackId),
        capabilities,
        container,
        track,
      );
      return {
        trackId: trackOverride.trackId,
        ...normalized,
        additionalArgs: cloneAdditionalArgs(trackOverride.additionalArgs ?? []),
      };
    });
}

function containerSupportsAudioProfile(
  container: TranscodeContainerCapability,
  profile: Pick<TranscodeProfile, 'audio'>,
  file: Pick<TranscodeFile, 'tracks'>,
): boolean {
  const audioTracks = getTracksByType(file, 'audio');

  return audioTracks.every((track) => {
    const effectiveSettings = getEffectiveAudioSettingsForTrack(profile.audio, track.id);

    if (effectiveSettings.mode === 'disable') {
      return true;
    }

    if (effectiveSettings.mode === 'copy') {
      return canContainerCopyAudioCodec(container.id, track.codec);
    }

    if (!effectiveSettings.encoderId) {
      return container.supportedAudioEncoderIds.length > 0;
    }

    return container.supportedAudioEncoderIds.includes(effectiveSettings.encoderId);
  });
}

function hasEnabledAudioOutput(
  profile: Pick<TranscodeProfile, 'audio'>,
  file: Pick<TranscodeFile, 'tracks'>,
): boolean {
  return getTracksByType(file, 'audio').some((track) => getEffectiveAudioSettingsForTrack(profile.audio, track.id).mode !== 'disable');
}

export function clampTranscodeProfile(
  profile: TranscodeProfile,
  capabilities: TranscodeCapabilities | null,
  file: Pick<TranscodeFile, 'hasVideo' | 'hasAudio' | 'tracks'>,
): TranscodeProfile {
  const containerId = pickContainerForFile(capabilities, profile.containerId, file.hasVideo);
  const container = getContainerCapability(capabilities, containerId);
  const hasSubtitleTracks = getTracksByType(file, 'subtitle').length > 0;

  const next = cloneTranscodeProfile(profile);
  next.containerId = containerId;

  if (!file.hasVideo) {
    next.video = buildDefaultVideoSettings(capabilities, containerId, false);
  } else {
    next.video.mode = next.video.mode === 'copy' || next.video.mode === 'disable' ? next.video.mode : 'transcode';

    if (next.video.mode === 'transcode') {
      const supportedEncoderId = next.video.encoderId && container?.supportedVideoEncoderIds.includes(next.video.encoderId)
        ? next.video.encoderId
        : container?.defaultVideoEncoderId ?? container?.supportedVideoEncoderIds[0];
      const encoder = getVideoEncoderCapability(capabilities, supportedEncoderId);

      next.video.encoderId = supportedEncoderId;
      if (next.video.profile && !encoder?.supportedProfiles.includes(next.video.profile)) {
        next.video.profile = encoder?.supportedProfiles[0];
      }
      if (next.video.level && !encoder?.supportedLevels.includes(next.video.level)) {
        next.video.level = encoder?.supportedLevels[0];
      }
      if (next.video.pixelFormat && !encoder?.supportedPixelFormats.includes(next.video.pixelFormat)) {
        next.video.pixelFormat = encoder?.supportedPixelFormats[0];
      }
      applyVideoQualityDefaults(next.video, encoder);
      if (getVideoPresetOptions(next.video.encoderId).length === 0) {
        next.video.preset = undefined;
      } else {
        next.video.preset = clampVideoPresetValue(next.video.encoderId, next.video.preset);
      }
    }
  }

  if (!file.hasAudio) {
    next.audio = buildDefaultAudioSettings(capabilities, containerId, false);
  } else {
    next.audio.mode = next.audio.mode === 'copy' || next.audio.mode === 'disable' ? next.audio.mode : 'transcode';

    if (next.audio.mode === 'transcode') {
      const supportedEncoderId = next.audio.encoderId && container?.supportedAudioEncoderIds.includes(next.audio.encoderId)
        ? next.audio.encoderId
        : container?.defaultAudioEncoderId ?? container?.supportedAudioEncoderIds[0];
      const encoder = getAudioEncoderCapability(capabilities, supportedEncoderId);
      next.audio.encoderId = supportedEncoderId;
      next.audio.bitrateKbps = normalizeOptionalPositiveInt(next.audio.bitrateKbps);
      next.audio.channels = normalizeOptionalPositiveInt(next.audio.channels);
      next.audio.sampleRate = normalizeOptionalPositiveInt(next.audio.sampleRate);

      if (encoder?.supportsBitrate === false || encoder?.codec === 'flac') {
        next.audio.bitrateKbps = undefined;
      }

      if (encoder?.supportsChannels === false) {
        next.audio.channels = undefined;
      }

      if (encoder?.supportsSampleRate === false) {
        next.audio.sampleRate = undefined;
      }
    }

    next.audio.trackOverrides = normalizeAudioTrackOverrides(next.audio, capabilities, container, file);
  }

  if (!hasSubtitleTracks || container?.kind !== 'video') {
    next.subtitles = buildDefaultSubtitleSettings(capabilities, containerId, false);
  } else {
    if (next.subtitles.mode === 'copy' && !canCopySubtitleTracksToContainer(file, containerId)) {
      if (hasOnlyTextSubtitleTracks(file) && (container?.supportedSubtitleEncoderIds.length ?? 0) > 0) {
        next.subtitles.mode = 'convert_text';
        next.subtitles.encoderId = container?.defaultSubtitleEncoderId ?? container?.supportedSubtitleEncoderIds[0];
      } else {
        next.subtitles.mode = 'disable';
        next.subtitles.encoderId = undefined;
      }
    }

    if (next.subtitles.mode === 'convert_text') {
      const supportedEncoderId = next.subtitles.encoderId
        && container?.supportedSubtitleEncoderIds.includes(next.subtitles.encoderId)
        ? next.subtitles.encoderId
        : container?.defaultSubtitleEncoderId ?? container?.supportedSubtitleEncoderIds[0];

      const hasUnsupportedImageSubtitles = getTracksByType(file, 'subtitle').some((track) =>
        !isTextSubtitleCodec(track.codec) && !canContainerCopySubtitleCodec(containerId, track.codec),
      );

      if (hasUnsupportedImageSubtitles) {
        next.subtitles.mode = 'disable';
        next.subtitles.encoderId = undefined;
      } else if (!supportedEncoderId) {
        if (canCopySubtitleTracksToContainer(file, containerId)) {
          next.subtitles.mode = 'copy';
          next.subtitles.encoderId = undefined;
        } else {
          next.subtitles.mode = 'disable';
          next.subtitles.encoderId = undefined;
        }
      } else {
        next.subtitles.encoderId = supportedEncoderId;
      }
    }
  }

  return next;
}

export function normalizeProfileForProfileChange(
  profile: TranscodeProfile,
  capabilities: TranscodeCapabilities | null,
  file: Pick<TranscodeFile, 'hasVideo' | 'hasAudio' | 'tracks'>,
): TranscodeProfile {
  const next = cloneTranscodeProfile(profile);
  const compatibleContainerId = findCompatibleContainerId(capabilities, next, file);
  if (compatibleContainerId) {
    next.containerId = compatibleContainerId;
  }

  return clampTranscodeProfile(next, capabilities, file);
}

export function normalizeProfileForContainerChange(
  profile: TranscodeProfile,
  containerId: string,
  capabilities: TranscodeCapabilities | null,
  file: Pick<TranscodeFile, 'hasVideo' | 'hasAudio' | 'tracks'>,
): TranscodeProfile {
  const next = cloneTranscodeProfile(profile);
  next.containerId = containerId;
  next.subtitles = buildPreferredSubtitleSettingsForContainer(capabilities, containerId, file, next.subtitles);

  return clampTranscodeProfile(next, capabilities, file);
}

export function applySourceAwareRecommendation(
  profile: TranscodeProfile,
  capabilities: TranscodeCapabilities | null,
  file: Pick<TranscodeFile, 'hasVideo' | 'hasAudio' | 'tracks'>,
): TranscodeProfile {
  const next = cloneTranscodeProfile(profile);
  const sourceAudioTrack = getPrimaryAudioTrack(file);
  const sourceAudioCodec = normalizeCodecName(sourceAudioTrack?.codec);
  const sourceAudioBitrateKbps = sourceAudioTrack?.bitrate
    ? Math.max(1, Math.round(sourceAudioTrack.bitrate / 1000))
    : undefined;
  const targetAudioEncoder = getAudioEncoderCapability(capabilities, next.audio.encoderId);

  if (file.hasAudio && next.audio.mode === 'transcode' && sourceAudioCodec) {
    if (isLossyAudioCodec(sourceAudioCodec) && isLosslessAudioCodec(targetAudioEncoder?.codec)) {
      next.audio.mode = 'copy';
      next.audio.encoderId = undefined;
      next.audio.bitrateKbps = undefined;
      next.audio.channels = undefined;
      next.audio.sampleRate = undefined;
    }

    if (isLossyAudioCodec(sourceAudioCodec)) {
      if (sourceAudioBitrateKbps && next.audio.bitrateKbps && next.audio.bitrateKbps > sourceAudioBitrateKbps) {
        next.audio.bitrateKbps = sourceAudioBitrateKbps;
      }

      if (sourceAudioTrack?.channels && next.audio.channels && next.audio.channels > sourceAudioTrack.channels) {
        next.audio.channels = sourceAudioTrack.channels;
      }

      if (sourceAudioTrack?.sampleRate && next.audio.sampleRate && next.audio.sampleRate > sourceAudioTrack.sampleRate) {
        next.audio.sampleRate = sourceAudioTrack.sampleRate;
      }
    }
  }

  return clampTranscodeProfile(next, capabilities, file);
}

export function getTranscodeCompatibilityIssues(
  file: Pick<TranscodeFile, 'name' | 'tracks' | 'hasVideo' | 'hasAudio' | 'profile'>,
  capabilities: TranscodeCapabilities | null,
): string[] {
  const issues: string[] = [];
  const container = getContainerCapability(capabilities, file.profile.containerId);

  if (!container) {
    issues.push(`The selected container "${file.profile.containerId}" is not available on this machine.`);
    return issues;
  }

  if (file.hasVideo && file.profile.video.mode === 'transcode' && file.profile.video.encoderId
    && !container.supportedVideoEncoderIds.includes(file.profile.video.encoderId)) {
    issues.push(`Container ${container.label} does not support the selected video encoder.`);
  }

  if (file.hasVideo && file.profile.video.mode === 'transcode' && !file.profile.video.encoderId) {
    issues.push(`No compatible video encoder is available for container ${container.label} on this machine.`);
  }

  if (file.hasVideo && file.profile.video.mode === 'copy' && !canCopyPrimaryVideoTrackToContainer(file, container.id)) {
    issues.push(`Container ${container.label} cannot copy the primary video track from this file.`);
  }

  if (file.hasAudio && file.profile.audio.mode === 'transcode' && file.profile.audio.encoderId
    && !container.supportedAudioEncoderIds.includes(file.profile.audio.encoderId)) {
    issues.push(`Container ${container.label} does not support the selected audio encoder.`);
  }

  if (file.hasAudio && file.profile.audio.mode === 'transcode' && !file.profile.audio.encoderId) {
    issues.push(`No compatible audio encoder is available for container ${container.label} on this machine.`);
  }

  if (file.hasAudio) {
    for (const track of getTracksByType(file, 'audio')) {
      const effectiveSettings = getEffectiveAudioSettingsForTrack(file.profile.audio, track.id);
      const trackLabel = track.title?.trim()
        ? track.title
        : `audio track ${getTracksByType(file, 'audio').findIndex((item) => item.id === track.id) + 1}`;

      if (effectiveSettings.mode === 'copy' && !canContainerCopyAudioCodec(container.id, track.codec)) {
        issues.push(`Container ${container.label} cannot copy ${trackLabel} (${track.codec.toUpperCase()}).`);
        break;
      }

      if (effectiveSettings.mode === 'transcode' && effectiveSettings.encoderId
        && !container.supportedAudioEncoderIds.includes(effectiveSettings.encoderId)) {
        issues.push(`Container ${container.label} does not support the selected encoder for ${trackLabel}.`);
        break;
      }

      if (effectiveSettings.mode === 'transcode' && !effectiveSettings.encoderId) {
        issues.push(`No compatible audio encoder is available for ${trackLabel} in container ${container.label}.`);
        break;
      }
    }
  }

  if (getTracksByType(file, 'subtitle').length > 0) {
    if (file.profile.subtitles.mode === 'copy' && !canCopySubtitleTracksToContainer(file, container.id)) {
      issues.push(`Container ${container.label} cannot copy one or more subtitle tracks from this file.`);
    }

    if (file.profile.subtitles.mode === 'convert_text') {
      if (!file.profile.subtitles.encoderId || !container.supportedSubtitleEncoderIds.includes(file.profile.subtitles.encoderId)) {
        issues.push(`Container ${container.label} does not support the selected subtitle encoder.`);
      }

      const hasUnsupportedImageSubtitles = getTracksByType(file, 'subtitle').some((track) =>
        !isTextSubtitleCodec(track.codec) && !canContainerCopySubtitleCodec(container.id, track.codec),
      );
      if (hasUnsupportedImageSubtitles) {
        issues.push(`Container ${container.label} cannot keep one or more non-text subtitle tracks for this file.`);
      }
    }
  }

  const hasEnabledVideo = file.hasVideo && file.profile.video.mode !== 'disable';
  const hasEnabledAudio = file.hasAudio && hasEnabledAudioOutput(file.profile, file);
  const hasEnabledSubtitles = getTracksByType(file, 'subtitle').length > 0 && file.profile.subtitles.mode !== 'disable';

  if (!hasEnabledVideo && !hasEnabledAudio && !hasEnabledSubtitles) {
    issues.push('At least one stream must remain enabled for output.');
  }

  return issues;
}

export function createTranscodeRequest(file: TranscodeFile, outputPath: string): TranscodeRequest {
  return {
    inputPath: file.path,
    outputPath,
    containerId: file.profile.containerId,
    video: cloneVideoSettings(file.profile.video),
    audio: cloneAudioSettings(file.profile.audio),
    subtitles: cloneSubtitleSettings(file.profile.subtitles),
    metadata: cloneTranscodeMetadata(file.metadata),
  };
}

export function describeTrackSummary(file: Pick<TranscodeFile, 'tracks' | 'hasVideo' | 'hasAudio'>): string {
  const parts: string[] = [];
  const videoTrack = getPrimaryVideoTrack(file);
  const audioTrack = getPrimaryAudioTrack(file);
  const subtitleCount = getTracksByType(file, 'subtitle').length;

  if (videoTrack) {
    parts.push(videoTrack.codec.toUpperCase());
    if (videoTrack.width && videoTrack.height) {
      parts.push(`${videoTrack.width}x${videoTrack.height}`);
    }
    if (videoTrack.derivedBitDepth) {
      parts.push(`${videoTrack.derivedBitDepth}-bit`);
    }
  }

  if (audioTrack) {
    parts.push(audioTrack.codec.toUpperCase());
  }

  if (subtitleCount > 0) {
    parts.push(`${subtitleCount} subs`);
  }

  return parts.join(' · ');
}

export function buildReadableProbeSummary(file: Pick<TranscodeFile, 'name' | 'format' | 'duration' | 'bitrate' | 'tracks'>): string {
  const lines: string[] = [];
  lines.push(`File: ${file.name}`);
  lines.push(`Container: ${file.format ?? 'Unknown'}`);
  if (file.duration) {
    lines.push(`Duration (s): ${file.duration.toFixed(3)}`);
  }
  if (file.bitrate) {
    lines.push(`Overall bitrate: ${file.bitrate}`);
  }
  lines.push('Streams:');

  for (const track of file.tracks) {
    const details: string[] = [track.type, `codec=${track.codec}`];
    if (track.profile) details.push(`profile=${track.profile}`);
    if (track.width && track.height) details.push(`resolution=${track.width}x${track.height}`);
    if (track.frameRate) details.push(`fps=${track.frameRate}`);
    if (track.pixelFormat) details.push(`pix_fmt=${track.pixelFormat}`);
    if (track.derivedBitDepth) details.push(`bit_depth=${track.derivedBitDepth}`);
    if (track.colorSpace) details.push(`color_space=${track.colorSpace}`);
    if (track.colorTransfer) details.push(`color_transfer=${track.colorTransfer}`);
    if (track.colorPrimaries) details.push(`color_primaries=${track.colorPrimaries}`);
    if (track.channels) details.push(`channels=${track.channels}`);
    if (track.channelLayout) details.push(`channel_layout=${track.channelLayout}`);
    if (track.sampleRate) details.push(`sample_rate=${track.sampleRate}`);
    if (track.language) details.push(`language=${track.language}`);
    lines.push(`- ${details.join(', ')}`);
  }

  return lines.join('\n');
}

export function fileHasVideo(rawData?: FFprobeOutput): boolean {
  return Boolean(rawData?.streams.some((stream) => stream.codec_type === 'video'));
}

export function fileHasAudio(rawData?: FFprobeOutput): boolean {
  return Boolean(rawData?.streams.some((stream) => stream.codec_type === 'audio'));
}
