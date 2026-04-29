import { readFile } from '@tauri-apps/plugin-fs';
import { logStore } from '$lib/stores/logs.svelte';
import type { DeepgramAPIResponse, DeepgramConfig, DeepgramResult } from '$lib/types';
import { fetchMediaFlowBillableApi } from './mediaflow-billing';
import { processDeepgramResponse, type TranscribeResult } from './deepgram';
import { withSleepInhibit } from './sleep-inhibit';

export interface MediaFlowTranscribeOptions {
  audioPath: string;
  config: DeepgramConfig;
  onProgress?: (progress: number, phase: 'uploading' | 'processing') => void;
  signal?: AbortSignal;
}

interface MediaFlowTranscriptionResponse {
  transcript?: string;
  words?: unknown;
  utterances?: unknown;
  metadata?: {
    request_id?: string;
    duration?: number;
  };
}

export function buildMediaFlowTranscriptionForm(audioBlob: Blob, config: DeepgramConfig): FormData {
  const form = new FormData();
  form.set('file', audioBlob, 'audio.opus');
  form.set('punctuate', String(config.punctuate));
  form.set('paragraphs', String(config.paragraphs));
  form.set('smart_format', String(config.smartFormat));
  form.set('utterances', String(config.utterances));
  form.set('diarize', String(config.diarize));

  if (config.language === 'multi' || config.language === 'auto') {
    form.set('detect_language', 'true');
  } else {
    form.set('language', config.language);
  }

  return form;
}

function normalizedToDeepgramResponse(body: MediaFlowTranscriptionResponse): DeepgramAPIResponse {
  const words = Array.isArray(body.words)
    ? body.words as DeepgramAPIResponse['results']['channels'][number]['alternatives'][number]['words']
    : [];

  return {
    metadata: {
      transaction_key: '',
      request_id: body.metadata?.request_id ?? '',
      sha256: '',
      created: new Date().toISOString(),
      duration: Number(body.metadata?.duration ?? 0),
      channels: 1,
      models: ['Transcribe'],
      model_info: {},
    },
    results: {
      channels: [
        {
          alternatives: [
            {
              transcript: body.transcript ?? '',
              confidence: 0,
              words,
            },
          ],
        },
      ],
      utterances: Array.isArray(body.utterances)
        ? body.utterances as DeepgramAPIResponse['results']['utterances']
        : undefined,
    },
  };
}

export async function transcribeWithMediaFlow(options: MediaFlowTranscribeOptions): Promise<TranscribeResult> {
  const { audioPath, config, onProgress, signal } = options;

  if (signal?.aborted) {
    return { success: false, error: 'Transcription cancelled' };
  }

  return withSleepInhibit('MediaFlow: Transcription', async () => {
    try {
      onProgress?.(5, 'uploading');
      const audioData = await readFile(audioPath);

      if (signal?.aborted) {
        return { success: false, error: 'Transcription cancelled' };
      }

      const audioBlob = new Blob([new Uint8Array(audioData)], { type: 'audio/opus' });
      onProgress?.(15, 'uploading');

      logStore.addLog({
        level: 'info',
        source: 'mediaflow',
        title: 'MediaFlow transcription started',
        details: `Language: ${config.language}`,
        context: { filePath: audioPath },
      });

      const response = await fetchMediaFlowBillableApi('/api/v1/audio/transcriptions', () => ({
        method: 'POST',
        body: buildMediaFlowTranscriptionForm(audioBlob, config),
        signal,
      }));

      onProgress?.(50, 'processing');

      if (!response.ok) {
        const errorText = await response.text();
        logStore.addLog({
          level: 'error',
          source: 'mediaflow',
          title: 'MediaFlow transcription error',
          details: `Status: ${response.status} - ${errorText}`,
          context: { filePath: audioPath, apiError: errorText },
        });
        return { success: false, error: `API Error: ${response.status} - ${errorText}` };
      }

      const data = await response.json() as MediaFlowTranscriptionResponse;
      const result: DeepgramResult = processDeepgramResponse(normalizedToDeepgramResponse(data));

      onProgress?.(100, 'processing');
      logStore.addLog({
        level: 'success',
        source: 'mediaflow',
        title: 'MediaFlow transcription complete',
        details: `Duration: ${Math.round(result.duration)}s`,
        context: { filePath: audioPath },
      });

      return { success: true, result };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Transcription cancelled' };
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      logStore.addLog({
        level: 'error',
        source: 'mediaflow',
        title: 'MediaFlow transcription failed',
        details: errorMessage,
        context: { filePath: audioPath },
      });
      return { success: false, error: errorMessage };
    }
  });
}
