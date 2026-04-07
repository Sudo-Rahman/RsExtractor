import { invoke } from '@tauri-apps/api/core';

import type {
  FFprobeOutput,
  Track,
  TranscodeAudioEncoderCapability,
  TranscodeAudioSettings,
  TranscodeCapabilities,
  TranscodeContainerCapability,
  TranscodeFile,
  TranscodeProfile,
  TranscodeRequest,
  TranscodeSubtitleEncoderCapability,
  TranscodeSubtitleSettings,
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

export function cloneAudioSettings(settings: TranscodeAudioSettings): TranscodeAudioSettings {
  return {
    ...settings,
    additionalArgs: cloneAdditionalArgs(settings.additionalArgs),
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
  if (file.hasVideo && profile.video.mode === 'transcode') {
    if (!profile.video.encoderId) {
      return container.supportedVideoEncoderIds.length > 0;
    }

    if (!container.supportedVideoEncoderIds.includes(profile.video.encoderId)) {
      return false;
    }
  }

  if (file.hasAudio && profile.audio.mode === 'transcode') {
    if (!profile.audio.encoderId) {
      return container.supportedAudioEncoderIds.length > 0;
    }

    if (!container.supportedAudioEncoderIds.includes(profile.audio.encoderId)) {
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

  return {
    mode: hasVideo ? 'transcode' : 'disable',
    encoderId,
    profile: encoder?.supportedProfiles[0],
    level: encoder?.supportedLevels[0],
    pixelFormat: encoder?.supportedPixelFormats.find((pixelFormat) => pixelFormat.includes('p010'))
      ?? encoder?.supportedPixelFormats.find((pixelFormat) => pixelFormat.includes('420'))
      ?? encoder?.supportedPixelFormats[0],
    qualityMode: encoder?.supportsCrf ? 'crf' : encoder?.supportsQp ? 'qp' : 'bitrate',
    crf: encoder?.supportsCrf ? (encoder.codec === 'hevc' ? 22 : 20) : undefined,
    qp: encoder?.supportsQp && !encoder?.supportsCrf ? 20 : undefined,
    bitrateKbps: !encoder?.supportsCrf && !encoder?.supportsQp ? 5000 : undefined,
    preset: getVideoPresetOptions(encoderId).length > 0
      ? getDefaultVideoPresetValue(encoderId) ?? (encoder?.isHardware ? 'fast' : 'medium')
      : undefined,
    additionalArgs: [],
  };
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

export function buildDefaultTranscodeProfile(
  capabilities: TranscodeCapabilities | null,
  file: Pick<TranscodeFile, 'hasVideo' | 'hasAudio' | 'tracks'>,
): TranscodeProfile {
  const availableContainers = capabilities?.containers.filter((container) =>
    file.hasVideo ? container.kind === 'video' : container.kind === 'audio',
  ) ?? [];
  const defaultContainerId = availableContainers[0]?.id ?? (file.hasVideo ? 'mp4' : 'mp3');

  return {
    containerId: defaultContainerId,
    video: buildDefaultVideoSettings(capabilities, defaultContainerId, file.hasVideo),
    audio: buildDefaultAudioSettings(capabilities, defaultContainerId, file.hasAudio),
    subtitles: buildDefaultSubtitleSettings(
      capabilities,
      defaultContainerId,
      getTracksByType(file, 'subtitle').length > 0,
    ),
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
      if (next.video.qualityMode === 'crf' && !encoder?.supportsCrf) {
        next.video.qualityMode = encoder?.supportsQp ? 'qp' : 'bitrate';
      }
      if (next.video.qualityMode === 'qp' && !encoder?.supportsQp) {
        next.video.qualityMode = encoder?.supportsCrf ? 'crf' : 'bitrate';
      }
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
      next.audio.encoderId = supportedEncoderId;
    }
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

  if (file.hasAudio && file.profile.audio.mode === 'transcode' && file.profile.audio.encoderId
    && !container.supportedAudioEncoderIds.includes(file.profile.audio.encoderId)) {
    issues.push(`Container ${container.label} does not support the selected audio encoder.`);
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
