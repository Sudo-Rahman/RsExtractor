import type { FileRunState } from './progress';
import type { FFprobeOutput, Track } from './media';
import type { LLMProvider } from './translation';

export type TranscodeMode = 'ai' | 'advanced';
export type TranscodeTab = 'video' | 'audio' | 'subtitles' | 'metadata' | 'output';
export type TranscodeAiIntent = 'speed' | 'quality' | 'archive';
export type TranscodeAiStatus = 'idle' | 'analyzing' | 'completed' | 'error';
export type TranscodeVideoMode = 'copy' | 'transcode' | 'disable';
export type TranscodeAudioMode = 'copy' | 'transcode' | 'disable';
export type TranscodeSubtitleMode = 'copy' | 'convert_text' | 'disable';
export type TranscodeQualityMode = 'crf' | 'bitrate' | 'qp';
export type TranscodeContainerKind = 'video' | 'audio';
export type TranscodePresetTab = 'video' | 'audio' | 'subtitles';
export type TranscodeOutputTrackMode = 'copy' | 'transcode' | 'convert_text';

export interface TranscodeContainerMetadataSchema {
  supportsContainerTitle: boolean;
  supportsTrackTitle: boolean;
  supportsLanguage: boolean;
  supportsDefault: boolean;
  supportsForced: boolean;
  clearsMatroskaStatistics: boolean;
}

export interface TranscodeAdditionalArg {
  id: string;
  flag: string;
  value?: string;
  enabled: boolean;
}

export interface TranscodeVideoSettings {
  mode: TranscodeVideoMode;
  encoderId?: string;
  profile?: string;
  level?: string;
  pixelFormat?: string;
  qualityMode: TranscodeQualityMode;
  crf?: number;
  qp?: number;
  bitrateKbps?: number;
  preset?: string;
  additionalArgs: TranscodeAdditionalArg[];
}

export interface TranscodeAudioSettings {
  mode: TranscodeAudioMode;
  encoderId?: string;
  bitrateKbps?: number;
  channels?: number;
  sampleRate?: number;
  additionalArgs: TranscodeAdditionalArg[];
  trackOverrides: TranscodeAudioTrackOverride[];
}

export interface TranscodeAudioTrackOverride {
  trackId: number;
  mode: TranscodeAudioMode;
  encoderId?: string;
  bitrateKbps?: number;
  channels?: number;
  sampleRate?: number;
  additionalArgs: TranscodeAdditionalArg[];
}

export interface TranscodeSubtitleSettings {
  mode: TranscodeSubtitleMode;
  encoderId?: string;
  additionalArgs: TranscodeAdditionalArg[];
}

export interface TranscodeProfile {
  containerId: string;
  video: TranscodeVideoSettings;
  audio: TranscodeAudioSettings;
  subtitles: TranscodeSubtitleSettings;
}

export interface TranscodeTrackMetadataEdit {
  sourceTrackId: number;
  title?: string;
  language?: string;
  default?: boolean;
  forced?: boolean;
}

export interface TranscodeMetadata {
  containerTitle?: string;
  trackEdits: TranscodeTrackMetadataEdit[];
}

export interface TranscodeOutputTrackPlan {
  key: string;
  outputIndex: number;
  sourceTrackId: number;
  type: Track['type'];
  sourceTrack: Track;
  mode: TranscodeOutputTrackMode;
  codec: string;
  metadata: TranscodeTrackMetadataEdit;
}

export interface TranscodeVideoEncoderCapability {
  id: string;
  codec: string;
  label: string;
  isHardware: boolean;
  supportedPixelFormats: string[];
  supportedProfiles: string[];
  supportedLevels: string[];
  supportedBitDepths: number[];
  supportsPreset: boolean;
  supportsCrf: boolean;
  supportsQp: boolean;
  supportsBitrate: boolean;
}

export interface TranscodeAudioEncoderCapability {
  id: string;
  codec: string;
  label: string;
  supportsBitrate: boolean;
  supportsChannels: boolean;
  supportsSampleRate: boolean;
}

export interface TranscodeSubtitleEncoderCapability {
  id: string;
  codec: string;
  label: string;
  kind: string;
}

export interface TranscodeContainerCapability {
  id: string;
  label: string;
  extension: string;
  kind: TranscodeContainerKind;
  muxerName: string;
  supportedVideoEncoderIds: string[];
  supportedAudioEncoderIds: string[];
  supportedSubtitleEncoderIds: string[];
  supportedSubtitleModes: TranscodeSubtitleMode[];
  defaultVideoEncoderId?: string;
  defaultAudioEncoderId?: string;
  defaultSubtitleEncoderId?: string;
  metadataSchema: TranscodeContainerMetadataSchema;
}

export interface TranscodeCapabilities {
  ffmpegVersion: string;
  hwaccels: string[];
  containers: TranscodeContainerCapability[];
  videoEncoders: TranscodeVideoEncoderCapability[];
  audioEncoders: TranscodeAudioEncoderCapability[];
  subtitleEncoders: TranscodeSubtitleEncoderCapability[];
  defaultAnalysisFrameCount: number;
}

export interface TranscodeAiRecommendation {
  provider: LLMProvider;
  model: string;
  intent: TranscodeAiIntent;
  rationale: string;
  profile: TranscodeProfile;
  createdAt: number;
}

export interface TranscodeAiErrorResponse {
  status: 'error';
  errorCode: 'out_of_scope';
  errorMessage: string;
}

export interface TranscodeAiSuccessResponse {
  status: 'ok';
  containerId: string;
  video: Partial<TranscodeProfile['video']>;
  audio: Partial<TranscodeProfile['audio']>;
  subtitles: Partial<TranscodeProfile['subtitles']>;
  rationale?: string;
}

export interface TranscodeFile {
  id: string;
  path: string;
  name: string;
  size: number;
  duration?: number;
  bitrate?: number;
  format?: string;
  tracks: Track[];
  status: 'pending' | 'scanning' | 'ready' | 'error';
  error?: string;
  rawData?: FFprobeOutput;
  createdAt?: Date;
  modifiedAt?: Date;
  hasVideo: boolean;
  hasAudio: boolean;
  profile: TranscodeProfile;
  metadata: TranscodeMetadata;
  analysisFrames: string[];
  aiStatus: TranscodeAiStatus;
  aiError?: string;
  aiRecommendation?: TranscodeAiRecommendation;
  lastOutputPath?: string;
}

export interface TranscodeRuntimeProgress {
  totalFiles: number;
  completedFiles: number;
  currentFileId: string | null;
  currentFilePath: string | null;
  currentFileName: string;
  currentFileProgress: number;
  currentSpeedBytesPerSec?: number;
}

export interface TranscodeProgressEvent {
  inputPath: string;
  outputPath: string;
  progress: number;
  speedBytesPerSec?: number;
}

export interface TranscodeRequest {
  inputPath: string;
  outputPath: string;
  containerId: string;
  video: TranscodeVideoSettings;
  audio: TranscodeAudioSettings;
  subtitles: TranscodeSubtitleSettings;
  metadata: TranscodeMetadata;
}

export interface TranscodePreset<TData = TranscodeVideoSettings | TranscodeAudioSettings | TranscodeSubtitleSettings> {
  id: string;
  name: string;
  tab: TranscodePresetTab;
  data: TData;
  createdAt: number;
  updatedAt: number;
}

export interface TranscodeRunState {
  fileRunStates: Map<string, FileRunState>;
  runtimeProgress: TranscodeRuntimeProgress;
}
