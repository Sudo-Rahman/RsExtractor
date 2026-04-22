<script lang="ts">
  import { FileVideo } from '@lucide/svelte';

  import type { RenameWorkspaceStore } from '$lib/stores/rename.svelte';
  import type { TranscodeContainerCapability, TranscodeFile } from '$lib/types';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import * as Card from '$lib/components/ui/card';
  import * as Select from '$lib/components/ui/select';
  import { OutputFolderField } from '$lib/components/shared';
  import { resolveOutputFolderDisplay } from '$lib/utils';

  import type { TranscodeContainerUpdater, TranscodeOutputPathBuilder } from './types';

  interface Props {
    file: TranscodeFile;
    selectedContainer: TranscodeContainerCapability | null;
    availableContainers: TranscodeContainerCapability[];
    outputPreviewPath: string;
    workspace: RenameWorkspaceStore;
    readyQueueFiles: TranscodeFile[];
    outputConflictCount: number;
    buildOutputPath: TranscodeOutputPathBuilder;
    updateContainer: TranscodeContainerUpdater;
    onSelectOutputDir?: () => void | Promise<void>;
    onClearOutputDir?: () => void;
    onOpenRenameWorkspace?: () => void;
  }

  let {
    file,
    selectedContainer,
    availableContainers,
    outputPreviewPath,
    workspace,
    readyQueueFiles,
    outputConflictCount,
    buildOutputPath,
    updateContainer,
    onSelectOutputDir,
    onClearOutputDir,
    onOpenRenameWorkspace,
  }: Props = $props();

  const outputFolderDisplay = $derived.by(() =>
    resolveOutputFolderDisplay({
      explicitPath: workspace.outputDir,
      sourcePaths: file ? [file.path] : [],
      allowSourceFallback: true,
      fallbackLabel: 'Use each source folder',
    }),
  );
</script>

<div class="grid gap-4 lg:grid-cols-2">
  <Card.Root>
    <Card.Header class="pb-3">
      <Card.Title>Container & Destination</Card.Title>
      <Card.Description>Choose the output container and where the transcoded files will be saved.</Card.Description>
    </Card.Header>
    <Card.Content class="space-y-4">
      <div class="space-y-2">
        <Label>Container</Label>
        <Select.Root
          type="single"
          value={file.profile.containerId}
          onValueChange={(value) => {
            updateContainer(value);
          }}
          >
          <Select.Trigger class="w-full">{selectedContainer?.label ?? file.profile.containerId.toUpperCase()}</Select.Trigger>
          <Select.Content>
            <Select.Group>
              {#each availableContainers as container (container.id)}
                <Select.Item value={container.id}>{container.label}</Select.Item>
              {/each}
            </Select.Group>
          </Select.Content>
        </Select.Root>
      </div>

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

      <div class="space-y-2">
        <Label>Output preview</Label>
        <div class="rounded-md border bg-muted/20 p-3">
          <p class="text-sm break-all">{outputPreviewPath}</p>
        </div>
      </div>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header class="pb-3">
      <Card.Title>Rename Workspace</Card.Title>
      <Card.Description>Open the integrated renaming workspace to edit output file names before transcoding.</Card.Description>
    </Card.Header>
    <Card.Content class="space-y-4">
      <div class="rounded-md border bg-muted/20 p-3 space-y-2 text-sm">
        <div class="flex items-center justify-between">
          <span class="text-muted-foreground">Selected outputs</span>
          <Badge>{workspace.selectedCount}</Badge>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-muted-foreground">Conflicts</span>
          <Badge variant={outputConflictCount > 0 ? 'destructive' : 'secondary'}>
            {outputConflictCount}
          </Badge>
        </div>
      </div>

      <Button class="w-full" variant="outline" onclick={onOpenRenameWorkspace}>
        <FileVideo class="size-4 mr-2" />
        Open Rename Workspace
      </Button>

      <div class="space-y-2">
        <Label>Batch preview</Label>
        <div class="rounded-md border bg-muted/20 p-3 space-y-2 max-h-56 overflow-auto">
          {#each readyQueueFiles.slice(0, 6) as queuedFile (queuedFile.id)}
            <div class="text-sm">
              <p class="font-medium truncate">{queuedFile.name}</p>
              <p class="text-xs text-muted-foreground break-all">{buildOutputPath(queuedFile)}</p>
            </div>
          {:else}
            <p class="text-sm text-muted-foreground">No ready files selected for output.</p>
          {/each}
        </div>
      </div>
    </Card.Content>
  </Card.Root>
</div>
