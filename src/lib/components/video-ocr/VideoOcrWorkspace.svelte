<script lang="ts">
  import type { OcrLogEntry, OcrRegion, OcrVideoFile } from '$lib/types';

  import OcrLogPanel from './OcrLogPanel.svelte';
  import VideoPreview from './VideoPreview.svelte';

  interface VideoOcrWorkspaceProps {
    file: OcrVideoFile | null;
    globalRegion: OcrRegion;
    logs: OcrLogEntry[];
    dialogsOpen: boolean;
    onGlobalRegionChange: (region: OcrRegion | undefined) => void | Promise<void>;
    onFileRegionChange: (region: OcrRegion | undefined) => void | Promise<void>;
    onUseGlobalRegion: () => void;
    onPlaybackError: (fileId: string, reason: string) => void | Promise<void>;
    onClearLogs: () => void;
  }

  let {
    file,
    globalRegion,
    logs,
    dialogsOpen,
    onGlobalRegionChange,
    onFileRegionChange,
    onUseGlobalRegion,
    onPlaybackError,
    onClearLogs,
  }: VideoOcrWorkspaceProps = $props();
</script>

<div class="flex-1 min-h-0 overflow-hidden p-4 grid grid-rows-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
  <VideoPreview
    file={file ?? undefined}
    {globalRegion}
    showSubtitles={!dialogsOpen}
    suspendPlayback={dialogsOpen}
    onGlobalRegionChange={onGlobalRegionChange}
    onFileRegionChange={onFileRegionChange}
    onUseGlobalRegion={onUseGlobalRegion}
    onPlaybackError={onPlaybackError}
    class="min-h-0"
  />

  <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
    <OcrLogPanel
      {logs}
      onClear={onClearLogs}
      class="flex-1 flex flex-col"
    />
  </div>
</div>
