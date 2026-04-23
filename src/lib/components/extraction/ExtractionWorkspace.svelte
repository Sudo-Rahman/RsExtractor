<script lang="ts">
  import type { Track, VideoFile } from '$lib/types';

  import BatchTrackSelector from './BatchTrackSelector.svelte';
  import TrackDetails from './TrackDetails.svelte';

  interface ExtractionWorkspaceProps {
    readyFiles: VideoFile[];
    selectedFile: VideoFile | null;
    selectedTrackIds: number[];
    selectedTracks: Map<string, number[]>;
    onBatchSelect: (selection: Map<string, number[]>) => void;
    onToggleTrack: (trackId: number) => void;
    onSelectAllOfType: (type: Track['type']) => void;
    onDeselectAllOfType: (type: Track['type']) => void;
  }

  let {
    readyFiles,
    selectedFile,
    selectedTrackIds,
    selectedTracks,
    onBatchSelect,
    onToggleTrack,
    onSelectAllOfType,
    onDeselectAllOfType,
  }: ExtractionWorkspaceProps = $props();
</script>

<div class="flex-1 flex flex-col overflow-hidden">
  {#if readyFiles.length > 0}
    <div class="p-4 border-b shrink-0">
      <BatchTrackSelector files={readyFiles} {selectedTracks} onBatchSelect={onBatchSelect} />
    </div>
  {/if}

  <div class="flex-1 min-h-0 overflow-auto p-4">
    {#if selectedFile}
      <TrackDetails
        file={selectedFile}
        {selectedTrackIds}
        onToggleTrack={onToggleTrack}
        onSelectAll={onSelectAllOfType}
        onDeselectAll={onDeselectAllOfType}
      />
    {:else}
      <div class="h-full flex items-center justify-center text-muted-foreground py-20">
        <p>Select a file to view its tracks</p>
      </div>
    {/if}
  </div>
</div>
