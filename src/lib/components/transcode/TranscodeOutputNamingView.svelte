<script lang="ts">
  import type { RenameWorkspaceStore } from '$lib/stores/rename.svelte';
  import { RenameWorkspace } from '$lib/components/rename';
  import { Badge } from '$lib/components/ui/badge';
  import { OutputFolderField } from '$lib/components/shared';
  import { resolveOutputFolderDisplay } from '$lib/utils';

  interface Props {
    workspace: RenameWorkspaceStore;
    outputConflictCount: number;
    onClearAll?: () => void;
    onRemoveFile?: (id: string) => void;
    onSelectOutputDir?: () => void | Promise<void>;
    onClearOutputDir?: () => void;
  }

  let {
    workspace,
    outputConflictCount,
    onClearAll,
    onRemoveFile,
    onSelectOutputDir,
    onClearOutputDir,
  }: Props = $props();

  const outputFolderDisplay = $derived.by(() =>
    resolveOutputFolderDisplay({
      explicitPath: workspace.outputDir,
      sourcePaths: workspace.selectedFiles.map((file) => file.originalPath),
      allowSourceFallback: true,
      fallbackLabel: 'Use each source folder',
    }),
  );
</script>

<div class="h-full overflow-hidden">
  <RenameWorkspace
    workspace={workspace}
    showImportButton={false}
    onClearAll={onClearAll}
    onRemoveFile={onRemoveFile}
    emptyStateTitle="No files in the transcode queue"
    emptyStateSubtitle="Add files in Transcode to prepare output names."
  >
    {#snippet actionPanel()}
      <div class="space-y-3">
        <OutputFolderField
          label="Output folder"
          displayText={outputFolderDisplay.displayText}
          state={outputFolderDisplay.state}
          description="Optional. Leave empty to save transcoded files next to each source file."
          showReset={outputFolderDisplay.showReset}
          resetLabel="Use source folders"
          onBrowse={onSelectOutputDir}
          onReset={onClearOutputDir}
        />

        <div class="rounded-md border bg-muted/30 p-3 space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">Selected outputs</span>
            <Badge variant={workspace.selectedCount > 0 ? 'default' : 'secondary'}>
              {workspace.selectedCount}
            </Badge>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">Conflicts</span>
            <Badge variant={outputConflictCount > 0 ? 'destructive' : 'secondary'}>
              {outputConflictCount}
            </Badge>
          </div>
        </div>
      </div>
    {/snippet}
  </RenameWorkspace>
</div>
