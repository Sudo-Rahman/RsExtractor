<script lang="ts">
  import type { AudioFile, DeepgramConfig, TranscriptionConfig } from '$lib/types';

  import AudioDetails from './AudioDetails.svelte';
  import TranscriptionPanel from './TranscriptionPanel.svelte';

  interface AudioToSubsWorkspaceProps {
    file: AudioFile | undefined;
    config: TranscriptionConfig;
    apiKeyConfigured: boolean;
    isTranscribing: boolean;
    isTranscoding: boolean;
    readyFilesCount: number;
    completedFilesCount: number;
    totalFilesCount: number;
    transcodingCount: number;
    invalidAutoLanguageFiles: string[];
    onChangeTrack: (file: AudioFile) => void | Promise<void>;
    onDeepgramConfigChange: (updates: Partial<DeepgramConfig>) => void;
    onMaxConcurrentChange: (value: number) => void;
    onTranscribeAll: () => void | Promise<void>;
    onNavigateToSettings?: () => void;
  }

  let {
    file,
    config,
    apiKeyConfigured,
    isTranscribing,
    isTranscoding,
    readyFilesCount,
    completedFilesCount,
    totalFilesCount,
    transcodingCount,
    invalidAutoLanguageFiles,
    onChangeTrack,
    onDeepgramConfigChange,
    onMaxConcurrentChange,
    onTranscribeAll,
    onNavigateToSettings,
  }: AudioToSubsWorkspaceProps = $props();
</script>

<div class="flex-1 flex overflow-hidden">
  <div class="flex-1 flex flex-col overflow-hidden">
    <AudioDetails
      {file}
      showWaveform={true}
      onChangeTrack={onChangeTrack}
    />
  </div>

  <div class="w-80 border-l overflow-hidden flex flex-col">
    <div class="flex-1 overflow-auto">
      <TranscriptionPanel
        {config}
        {apiKeyConfigured}
        {isTranscribing}
        {isTranscoding}
        {readyFilesCount}
        {completedFilesCount}
        {totalFilesCount}
        {transcodingCount}
        {invalidAutoLanguageFiles}
        onDeepgramConfigChange={onDeepgramConfigChange}
        onMaxConcurrentChange={onMaxConcurrentChange}
        onTranscribeAll={onTranscribeAll}
        {onNavigateToSettings}
      />
    </div>
  </div>
</div>
