<script lang="ts">
  import { createRenameWorkspaceStore } from '$lib/stores';
  import { RenameWorkspace } from '$lib/components/rename';
  import { OutputFolderField } from '$lib/components/shared';
  import { Badge } from '$lib/components/ui/badge';
  import { resolveOutputFolderDisplay } from '$lib/utils';

  interface Props {
    workspace: ReturnType<typeof createRenameWorkspaceStore>;
    outputFolderDisplay: ReturnType<typeof resolveOutputFolderDisplay>;
    selectedVideosCount: number;
    selectedTracksCount: number;
    onClearAll: () => void;
    onRemoveFile: (fileId: string) => void;
    onBrowseOutputDir: () => void | Promise<void>;
    onResetOutputDir: () => void;
  }

  let {
    workspace,
    outputFolderDisplay,
    selectedVideosCount,
    selectedTracksCount,
    onClearAll,
    onRemoveFile,
    onBrowseOutputDir,
    onResetOutputDir,
  }: Props = $props();
</script>

<div class="h-full">
  <RenameWorkspace
    {workspace}
    showImportButton={false}
    onClearAll={onClearAll}
    onRemoveFile={onRemoveFile}
    emptyStateTitle="No videos in the merge batch"
    emptyStateSubtitle="Add videos in Merge to configure output names."
  >
    {#snippet actionPanel()}
      <div class="space-y-2">
        <OutputFolderField
          label="Output folder"
          displayText={outputFolderDisplay.displayText}
          state={outputFolderDisplay.state}
          description="Optional. Leave empty to save merged files next to each source video."
          showReset={outputFolderDisplay.showReset}
          resetLabel="Use source folders"
          onBrowse={onBrowseOutputDir}
          onReset={onResetOutputDir}
        />
      </div>

      <div class="rounded-md bg-muted/50 p-3 space-y-2">
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">Selected videos</span>
          <Badge variant={selectedVideosCount > 0 ? 'default' : 'secondary'}>
            {selectedVideosCount}
          </Badge>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">Attached tracks</span>
          <Badge variant={selectedTracksCount > 0 ? 'default' : 'secondary'}>
            {selectedTracksCount}
          </Badge>
        </div>
      </div>
    {/snippet}
  </RenameWorkspace>
</div>
