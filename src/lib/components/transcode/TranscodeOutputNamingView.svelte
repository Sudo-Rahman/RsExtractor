<script lang="ts">
  import { FolderOpen } from '@lucide/svelte';

  import type { RenameWorkspaceStore } from '$lib/stores/rename.svelte';
  import { RenameWorkspace } from '$lib/components/rename';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';

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
        <div class="space-y-2">
          <Label class="text-xs uppercase tracking-wide text-muted-foreground">Output Folder</Label>
          <Button
            variant="outline"
            class="w-full justify-start gap-2 h-auto py-2 text-left"
            onclick={onSelectOutputDir}
          >
            <FolderOpen class="size-4 shrink-0" />
            <span class="truncate flex-1 text-sm">
              {#if workspace.outputDir}
                {workspace.outputDir}
              {:else}
                <span class="text-muted-foreground">Use each source folder</span>
              {/if}
            </span>
          </Button>
          {#if workspace.outputDir}
            <Button
              variant="ghost"
              size="sm"
              class="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
              onclick={onClearOutputDir}
            >
              Use source folders
            </Button>
          {/if}
        </div>

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
