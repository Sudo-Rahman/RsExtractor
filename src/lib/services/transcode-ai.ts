import { readFile } from '@tauri-apps/plugin-fs';

import { settingsStore } from '$lib/stores';
import type {
  TranscodeAiIntent,
  TranscodeAiErrorResponse,
  TranscodeAiRecommendation,
  TranscodeAiSuccessResponse,
  TranscodeCapabilities,
  TranscodeFile,
} from '$lib/types';
import type { LLMProvider } from '$lib/types';
import { callLlm, type LlmContentPart } from './llm-client';
import {
  applySourceAwareRecommendation,
  buildReadableProbeSummary,
  clampTranscodeProfile,
  cloneTranscodeProfile,
  isLosslessAudioCodec,
  isLossyAudioCodec,
} from './transcode';

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function mimeTypeFromPath(path: string): string {
  if (path.toLowerCase().endsWith('.png')) {
    return 'image/png';
  }
  return 'image/jpeg';
}

async function buildImageContentParts(paths: string[]): Promise<LlmContentPart[]> {
  const parts: LlmContentPart[] = [];

  for (const path of paths) {
    const bytes = await readFile(path);
    parts.push({
      type: 'image',
      mimeType: mimeTypeFromPath(path),
      data: uint8ArrayToBase64(new Uint8Array(bytes)),
    });
  }

  return parts;
}

function buildAiSystemPrompt(): string {
  return [
    'You are MediaFlow, an expert FFmpeg transcoding assistant.',
    'Your scope is strictly limited to the Transcode tool in MediaFlow.',
    'Only handle requests about transcoding settings, codec choices, quality, compatibility, containers, subtitles, audio handling, speed, archival tradeoffs, and FFmpeg options relevant to this tool.',
    'If the optional user instruction asks for anything unrelated to Transcode, transcoding, or output configuration, do not answer that request and do not continue with profile generation.',
    'For unrelated or out-of-scope user instructions, return a JSON error response with status "error", errorCode "out_of_scope", and a short errorMessage.',
    'Return valid JSON only.',
    'Recommend a practical transcoding profile based on visual content, source metadata, and machine capabilities.',
    'The attached frames are full-resolution, lossless PNG screenshots extracted from the source file.',
    'Inspect the frames carefully for grain, animation, dark scenes, compression artifacts, line art, motion complexity, and fine texture retention needs.',
    'Never invent unsupported encoders, profiles, pixel formats, or containers.',
    'Respect the machine capability list exactly.',
    'If the optional user instruction is relevant to Transcode, follow it when practical and when it does not conflict with machine capabilities, source limitations, or container compatibility.',
    'Never recommend a lossless or higher-fidelity audio target when the source audio is already lossy.',
    'Do not increase audio bitrate, channels, or sample rate beyond the source unless there is a clear compatibility reason.',
    'For lossy source audio in archive mode, prefer copy when practical.',
    'Subtitle strategy rules: use "copy", "convert_text", or "disable". Image subtitles must remain copy or disable.',
    'JSON schema:',
    '{"status":"ok","containerId":string,"video":{"mode":"copy|transcode|disable","encoderId"?:string,"profile"?:string,"level"?:string,"pixelFormat"?:string,"qualityMode":"crf|bitrate|qp","crf"?:number,"qp"?:number,"bitrateKbps"?:number,"preset"?:string},"audio":{"mode":"copy|transcode|disable","encoderId"?:string,"bitrateKbps"?:number,"channels"?:number,"sampleRate"?:number},"subtitles":{"mode":"copy|convert_text|disable","encoderId"?:string},"rationale":string}',
    '{"status":"error","errorCode":"out_of_scope","errorMessage":string}',
  ].join('\n');
}

function buildAiTextPrompt(
  file: TranscodeFile,
  capabilities: TranscodeCapabilities,
  intent: TranscodeAiIntent,
  userInstruction?: string,
): string {
  const primaryAudioTrack = file.tracks.find((track) => track.type === 'audio');
  const audioQualityHint = primaryAudioTrack
    ? isLossyAudioCodec(primaryAudioTrack.codec)
      ? 'lossy'
      : isLosslessAudioCodec(primaryAudioTrack.codec)
        ? 'lossless'
        : 'unknown'
    : 'none';

  return [
    `Intent: ${intent}`,
    '',
    'Analysis frames:',
    '- 6 full-resolution, lossless PNG screenshots are attached below this prompt.',
    '- Use them to judge grain/noise, animation vs live action, dark scenes, gradients, compression artifacts, and texture complexity.',
    '',
    'Optional user instruction:',
    userInstruction?.trim() ? userInstruction.trim() : 'None provided.',
    '',
    'Machine capabilities JSON:',
    JSON.stringify(capabilities, null, 2),
    '',
    'FFprobe summary:',
    buildReadableProbeSummary(file),
    '',
    'Raw ffprobe JSON:',
    JSON.stringify(file.rawData ?? {}, null, 2),
    '',
    'Source audio guidance:',
    `- Primary audio codec: ${primaryAudioTrack?.codec ?? 'none'}`,
    `- Primary audio bitrate: ${primaryAudioTrack?.bitrate ?? 'unknown'}`,
    `- Primary audio quality class: ${audioQualityHint}`,
    '',
    'Instructions:',
    '- Prefer hardware encoders when the intent is speed and the capability is clearly available.',
    '- Prefer quality-preserving but still practical settings when the intent is quality.',
    '- Prefer resilient archival settings when the intent is archive.',
    '- Keep audio and subtitle choices compatible with the selected container.',
    '- If the source is audio-only, disable video and use an audio container.',
    '- If the source audio is lossy, never recommend FLAC, PCM, ALAC, WAVPACK, or other lossless upgrades.',
    '- If the source audio is lossy, do not recommend a higher audio bitrate, higher sample rate, or more channels than the source.',
    '- Prefer copying already-lossy source audio when that best preserves the original quality envelope.',
    '- If the optional user instruction is unrelated to transcoding or output configuration, return the out_of_scope JSON error instead of a profile.',
  ].join('\n');
}

function isAiErrorResponse(value: unknown): value is TranscodeAiErrorResponse {
  return value !== null
    && typeof value === 'object'
    && 'status' in value
    && (value as { status?: unknown }).status === 'error'
    && (value as { errorCode?: unknown }).errorCode === 'out_of_scope'
    && typeof (value as { errorMessage?: unknown }).errorMessage === 'string';
}

function isAiSuccessResponse(value: unknown): value is TranscodeAiSuccessResponse {
  return value !== null
    && typeof value === 'object'
    && 'status' in value
    && (value as { status?: unknown }).status === 'ok'
    && typeof (value as { containerId?: unknown }).containerId === 'string';
}

export interface AnalyzeTranscodeProfileOptions {
  file: TranscodeFile;
  capabilities: TranscodeCapabilities;
  provider: LLMProvider;
  model: string;
  intent: TranscodeAiIntent;
  userInstruction?: string;
  signal?: AbortSignal;
}

export async function analyzeTranscodeProfile(
  options: AnalyzeTranscodeProfileOptions,
): Promise<TranscodeAiRecommendation> {
  const apiKey = settingsStore.getLLMApiKey(options.provider);
  if (!apiKey) {
    throw new Error(`No API key configured for ${options.provider}`);
  }

  const imageParts = await buildImageContentParts(options.file.analysisFrames.slice(0, 6));
  const textPrompt = buildAiTextPrompt(
    options.file,
    options.capabilities,
    options.intent,
    options.userInstruction,
  );
  const userContentParts: LlmContentPart[] = [{ type: 'text', text: textPrompt }, ...imageParts];

  const llmResponse = await callLlm({
    provider: options.provider,
    apiKey,
    model: options.model,
    systemPrompt: buildAiSystemPrompt(),
    userPrompt: textPrompt,
    userContentParts,
    responseMode: 'json',
    signal: options.signal,
    logSource: 'translation',
  });

  if (llmResponse.cancelled) {
    throw new Error('AI analysis cancelled');
  }

  if (llmResponse.error) {
    throw new Error(llmResponse.error);
  }

  const parsed = JSON.parse(llmResponse.content);
  if (isAiErrorResponse(parsed)) {
    throw new Error(parsed.errorMessage);
  }

  if (!isAiSuccessResponse(parsed)) {
    throw new Error('The AI response did not match the expected profile schema');
  }

  const recommendedProfile = applySourceAwareRecommendation(clampTranscodeProfile({
    ...cloneTranscodeProfile(options.file.profile),
    containerId: parsed.containerId,
    video: {
      ...cloneTranscodeProfile(options.file.profile).video,
      ...parsed.video,
      additionalArgs: cloneTranscodeProfile(options.file.profile).video.additionalArgs,
    },
    audio: {
      ...cloneTranscodeProfile(options.file.profile).audio,
      ...parsed.audio,
      additionalArgs: cloneTranscodeProfile(options.file.profile).audio.additionalArgs,
    },
    subtitles: {
      ...cloneTranscodeProfile(options.file.profile).subtitles,
      ...parsed.subtitles,
      additionalArgs: cloneTranscodeProfile(options.file.profile).subtitles.additionalArgs,
    },
  }, options.capabilities, options.file), options.capabilities, options.file);

  return {
    provider: options.provider,
    model: options.model,
    intent: options.intent,
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : 'AI-generated recommendation',
    profile: recommendedProfile,
    createdAt: Date.now(),
  };
}
