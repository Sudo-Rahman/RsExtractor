/**
 * Deepgram API Service
 * Handles transcription with Deepgram Nova models
 */

import { readFile } from '@tauri-apps/plugin-fs';
import { settingsStore } from '$lib/stores/settings.svelte';
import { logStore } from '$lib/stores/logs.svelte';
import type {
  DeepgramConfig,
  DeepgramAPIResponse,
  DeepgramResult,
  TranscriptionPhrase,
  TranscriptionOutputFormat,
  TranscriptionJSONOutput,
} from '$lib/types';

const DEEPGRAM_API_URL = 'https://api.deepgram.com/v1/listen';

// ============================================================================
// API CALL
// ============================================================================

export interface TranscribeOptions {
  audioPath: string;
  config: DeepgramConfig;
  onProgress?: (progress: number, phase: 'uploading' | 'processing') => void;
  signal?: AbortSignal;
}

export interface TranscribeResult {
  success: boolean;
  result?: DeepgramResult;
  error?: string;
}

/**
 * Transcribe audio using Deepgram API
 */
export async function transcribeWithDeepgram(options: TranscribeOptions): Promise<TranscribeResult> {
  const { audioPath, config, onProgress, signal } = options;
  
  // Get API key
  const apiKey = settingsStore.getDeepgramApiKey();
  if (!apiKey) {
    return { success: false, error: 'Deepgram API key not configured' };
  }
  
  try {
    // Check if already aborted
    if (signal?.aborted) {
      return { success: false, error: 'Transcription cancelled' };
    }
    
    // Read audio file
    onProgress?.(5, 'uploading');
    const audioData = await readFile(audioPath);

    // Check abort after file read
    if (signal?.aborted) {
      return { success: false, error: 'Transcription cancelled' };
    }
    
    const audioBlob = new Blob([new Uint8Array(audioData)], { type: 'audio/opus' });
    
    onProgress?.(10, 'uploading');
    
    // Determine model based on language
    // For non-English languages, use the general variant if not already specified
    const isNonEnglish = config.language !== 'en' && config.language !== 'multi';
    let model = config.model;
    if (isNonEnglish && !model.includes('general')) {
      model = `${model}-general` as typeof config.model;
    }
    
    // Build query parameters
    const params = new URLSearchParams({
      model,
      punctuate: String(config.punctuate),
      paragraphs: String(config.paragraphs),
      smart_format: String(config.smartFormat),
      utterances: String(config.utterances),
      utt_split: String(config.uttSplit),
      diarize: String(config.diarize),
      language: config.language === 'auto' ? 'multi' : config.language,
    });
    
    onProgress?.(15, 'uploading');
    
    // Log the API call
    logStore.addLog({
      level: 'info',
      source: 'deepgram',
      title: 'Transcription started',
      details: `Model: ${model}, Language: ${config.language}`,
      context: { filePath: audioPath },
    });
    
    // Make API request with abort signal
    const response = await fetch(`${DEEPGRAM_API_URL}?${params}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': audioBlob.type || 'audio/opus',
      },
      body: audioBlob,
      signal,
    });
    
    onProgress?.(50, 'processing');
    
    if (!response.ok) {
      const errorText = await response.text();
      logStore.addLog({
        level: 'error',
        source: 'deepgram',
        title: 'Deepgram API Error',
        details: `Status: ${response.status} - ${errorText}`,
        context: { filePath: audioPath, apiError: errorText },
      });
      return { success: false, error: `API Error: ${response.status} - ${errorText}` };
    }
    
    const data: DeepgramAPIResponse = await response.json();
    onProgress?.(90, 'processing');
    
    // Process response into our format
    const result = processDeepgramResponse(data);
    
    onProgress?.(100, 'processing');
    
    logStore.addLog({
      level: 'success',
      source: 'deepgram',
      title: 'Transcription complete',
      details: `Duration: ${formatDuration(result.duration)}, Confidence: ${Math.round(result.confidence * 100)}%`,
      context: { filePath: audioPath },
    });
    
    return { success: true, result };
    
  } catch (error) {
    // Handle abort error specifically
    if (error instanceof Error && error.name === 'AbortError') {
      logStore.addLog({
        level: 'info',
        source: 'deepgram',
        title: 'Transcription cancelled',
        details: 'Request was cancelled by user',
        context: { filePath: audioPath },
      });
      return { success: false, error: 'Transcription cancelled' };
    }
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStore.addLog({
      level: 'error',
      source: 'deepgram',
      title: 'Transcription error',
      details: errorMessage,
      context: { filePath: audioPath },
    });
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// RESPONSE PROCESSING
// ============================================================================

/**
 * Process Deepgram API response into our internal format
 */
function processDeepgramResponse(response: DeepgramAPIResponse): DeepgramResult {
  const { metadata, results } = response;
  
  // Get the main transcript
  const channel = results.channels[0];
  const alternative = channel?.alternatives[0];
  const transcript = alternative?.transcript || '';
  
  // Calculate average confidence
  const words = alternative?.words || [];
  const avgConfidence = words.length > 0
    ? words.reduce((sum, w) => sum + w.confidence, 0) / words.length
    : 0;
  
  // Build phrases from utterances if available, otherwise from words
  let phrases: TranscriptionPhrase[] = [];
  
  if (results.utterances && results.utterances.length > 0) {
    // Use utterances for better phrase segmentation
    phrases = results.utterances.map((utt, idx) => ({
      id: utt.id || `phrase-${idx}`,
      start: utt.start,
      end: utt.end,
      text: utt.transcript.trim(),
      confidence: utt.confidence,
    }));
  } else if (words.length > 0) {
    // Fall back to building phrases from words with sentence detection
    phrases = buildPhrasesFromWords(words);
  }
  
  return {
    transcript,
    phrases,
    duration: metadata.duration,
    confidence: avgConfidence,
  };
}

/**
 * Build phrases from words using punctuation and timing gaps
 */
function buildPhrasesFromWords(words: Array<{
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word?: string;
}>): TranscriptionPhrase[] {
  const phrases: TranscriptionPhrase[] = [];
  let currentPhrase: typeof words = [];
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    currentPhrase.push(word);
    
    // Check for sentence end or significant pause
    const punctWord = word.punctuated_word || word.word;
    const isSentenceEnd = /[.!?]$/.test(punctWord);
    const nextWord = words[i + 1];
    const hasLongPause = nextWord && (nextWord.start - word.end) > 0.8;
    
    if (isSentenceEnd || hasLongPause || !nextWord) {
      if (currentPhrase.length > 0) {
        const phraseText = currentPhrase
          .map(w => w.punctuated_word || w.word)
          .join(' ')
          .trim();
        
        phrases.push({
          id: `phrase-${phrases.length}`,
          start: currentPhrase[0].start,
          end: currentPhrase[currentPhrase.length - 1].end,
          text: phraseText,
          confidence: currentPhrase.reduce((s, w) => s + w.confidence, 0) / currentPhrase.length,
        });
        currentPhrase = [];
      }
    }
  }
  
  return phrases;
}

// ============================================================================
// OUTPUT FORMATTERS
// ============================================================================

/**
 * Format timestamp for SRT (HH:MM:SS,mmm)
 */
function formatSRTTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Format timestamp for VTT (HH:MM:SS.mmm)
 */
function formatVTTTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * Format duration for display
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Convert transcription result to SRT format
 */
export function formatToSRT(result: DeepgramResult): string {
  return result.phrases
    .map((phrase, idx) => {
      const startTime = formatSRTTimestamp(phrase.start);
      const endTime = formatSRTTimestamp(phrase.end);
      return `${idx + 1}\n${startTime} --> ${endTime}\n${phrase.text}\n`;
    })
    .join('\n');
}

/**
 * Convert transcription result to VTT format
 */
export function formatToVTT(result: DeepgramResult): string {
  const header = 'WEBVTT\n\n';
  const cues = result.phrases
    .map((phrase) => {
      const startTime = formatVTTTimestamp(phrase.start);
      const endTime = formatVTTTimestamp(phrase.end);
      return `${startTime} --> ${endTime}\n${phrase.text}\n`;
    })
    .join('\n');
  
  return header + cues;
}

/**
 * Convert transcription result to JSON format
 */
export function formatToJSON(result: DeepgramResult): TranscriptionJSONOutput {
  return {
    duration: result.duration,
    language: result.language,
    confidence: result.confidence,
    phrases: result.phrases.map(p => ({
      start: p.start,
      end: p.end,
      text: p.text,
      confidence: p.confidence,
    })),
  };
}

/**
 * Get formatted output based on format type
 */
export function getFormattedOutput(
  result: DeepgramResult, 
  format: TranscriptionOutputFormat
): string {
  switch (format) {
    case 'srt':
      return formatToSRT(result);
    case 'vtt':
      return formatToVTT(result);
    case 'json':
      return JSON.stringify(formatToJSON(result), null, 2);
    default:
      return formatToSRT(result);
  }
}

/**
 * Get file extension for format
 */
export function getFormatExtension(format: TranscriptionOutputFormat): string {
  return format;
}
