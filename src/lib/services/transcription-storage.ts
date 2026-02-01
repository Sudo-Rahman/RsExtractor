/**
 * Transcription Storage Service
 * Handles persistence of transcription versions to .rsext.json files
 */

import { invoke } from '@tauri-apps/api/core';
import type { TranscriptionData, TranscriptionVersion, DeepgramConfig, DeepgramResult } from '$lib/types';

// ============================================================================
// DATA OPERATIONS
// ============================================================================

/**
 * Load transcription data for an audio file
 */
export async function loadTranscriptionData(audioPath: string): Promise<TranscriptionData | null> {
  try {
    const jsonStr = await invoke<string | null>('load_transcription_data', { audioPath });
    if (!jsonStr) return null;
    
    const data = JSON.parse(jsonStr) as TranscriptionData;
    return data;
  } catch (error) {
    console.error('Failed to load transcription data:', error);
    return null;
  }
}

/**
 * Save transcription data for an audio file
 */
export async function saveTranscriptionData(audioPath: string, data: TranscriptionData): Promise<boolean> {
  try {
    const jsonStr = JSON.stringify(data, null, 2);
    await invoke('save_transcription_data', { audioPath, data: jsonStr });
    return true;
  } catch (error) {
    console.error('Failed to save transcription data:', error);
    return false;
  }
}

/**
 * Delete transcription data for an audio file
 */
export async function deleteTranscriptionData(audioPath: string): Promise<boolean> {
  try {
    await invoke('delete_transcription_data', { audioPath });
    return true;
  } catch (error) {
    console.error('Failed to delete transcription data:', error);
    return false;
  }
}

// ============================================================================
// VERSION MANAGEMENT
// ============================================================================

/**
 * Generate a unique version ID
 */
function generateVersionId(): string {
  return `v-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a new transcription version
 */
export function createVersion(
  name: string,
  config: DeepgramConfig,
  result: DeepgramResult
): TranscriptionVersion {
  return {
    id: generateVersionId(),
    name,
    createdAt: new Date().toISOString(),
    config,
    result,
  };
}

/**
 * Add a version to transcription data
 */
export async function addVersion(
  audioPath: string,
  version: TranscriptionVersion,
  opusPath?: string
): Promise<TranscriptionData | null> {
  let data = await loadTranscriptionData(audioPath);
  
  if (!data) {
    data = {
      version: 1,
      audioPath,
      opusPath,
      transcriptionVersions: [],
    };
  }
  
  data.transcriptionVersions.push(version);
  if (opusPath) {
    data.opusPath = opusPath;
  }
  
  const success = await saveTranscriptionData(audioPath, data);
  return success ? data : null;
}

/**
 * Remove a version from transcription data
 */
export async function removeVersion(
  audioPath: string,
  versionId: string
): Promise<TranscriptionData | null> {
  const data = await loadTranscriptionData(audioPath);
  if (!data) return null;
  
  data.transcriptionVersions = data.transcriptionVersions.filter(v => v.id !== versionId);
  
  const success = await saveTranscriptionData(audioPath, data);
  return success ? data : null;
}

/**
 * Get a specific version by ID
 */
export async function getVersion(
  audioPath: string,
  versionId: string
): Promise<TranscriptionVersion | null> {
  const data = await loadTranscriptionData(audioPath);
  if (!data) return null;
  
  return data.transcriptionVersions.find(v => v.id === versionId) ?? null;
}

/**
 * Get all versions for an audio file
 */
export async function getAllVersions(audioPath: string): Promise<TranscriptionVersion[]> {
  const data = await loadTranscriptionData(audioPath);
  return data?.transcriptionVersions ?? [];
}

/**
 * Get version count for an audio file
 */
export async function getVersionCount(audioPath: string): Promise<number> {
  const data = await loadTranscriptionData(audioPath);
  return data?.transcriptionVersions.length ?? 0;
}

/**
 * Generate default version name (Version 1, Version 2, etc.)
 */
export function generateVersionName(existingVersions: TranscriptionVersion[]): string {
  return `Version ${existingVersions.length + 1}`;
}
