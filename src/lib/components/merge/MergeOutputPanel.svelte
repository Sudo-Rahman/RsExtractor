<script lang="ts">
  import { Folder, FolderOpen, PenLine, Play, Loader2, CheckCircle, RotateCcw, X } from '@lucide/svelte';
  import type { MergeOutputConfig } from '$lib/types';
  import { Button } from '$lib/components/ui/button';
  import { Progress } from '$lib/components/ui/progress';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import * as Card from '$lib/components/ui/card';
  import * as Alert from '$lib/components/ui/alert';
  import { formatTransferRate } from '$lib/utils';

  interface MergeOutputPanelProps {
    outputConfig: MergeOutputConfig;
    enabledTracksCount: number;
    videosCount?: number;
    completedFiles?: number;
    status: 'idle' | 'processing' | 'completed' | 'error';
    onSelectOutputDir?: () => void;
    onClearOutputDir?: () => void;
    onEditOutputNames?: () => void;
    onMerge?: () => void;
    onOpenFolder?: () => void;
    onCancel?: () => void;
    isCancelling?: boolean;
    currentFileName?: string;
    currentFileProgress?: number;
    currentSpeedBytesPerSec?: number;
    class?: string;
  }

  let {
    outputConfig,
    enabledTracksCount,
    videosCount = 0,
    completedFiles = 0,
    status,
    onSelectOutputDir,
    onClearOutputDir,
    onEditOutputNames,
    onMerge,
    onOpenFolder,
    onCancel,
    isCancelling = false,
    currentFileName,
    currentFileProgress = 0,
    currentSpeedBytesPerSec,
    class: className = ''
  }: MergeOutputPanelProps = $props();

  const isProcessing = $derived(status === 'processing');
  const isCompleted = $derived(status === 'completed');
  // Attached tracks are optional - user may just want to modify metadata or remove tracks.
  const canMerge = $derived(
    videosCount > 0 &&
    !isProcessing
  );
</script>

<Card.Root class={className}>
  <Card.Header class="pb-3">
    <Card.Title class="text-base">Output</Card.Title>
    <Card.Description>Configure batch merge output</Card.Description>
  </Card.Header>
  <Card.Content class="space-y-4">
    <!-- Output directory -->
    <div class="space-y-2">
      <Label>Output folder</Label>
      <div class="flex gap-2">
        <div class="flex-1 flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm min-w-0">
          <Folder class="size-4 text-muted-foreground shrink-0" />
          <span class="truncate text-muted-foreground">
            {outputConfig.outputDir || 'Use each source folder'}
          </span>
        </div>
        <Button variant="outline" size="icon" onclick={onSelectOutputDir}>
          <FolderOpen class="size-4" />
          <span class="sr-only">Browse</span>
        </Button>
      </div>
      <p class="text-xs text-muted-foreground">
        Optional. Leave empty to save merged files next to each source video.
      </p>
      {#if outputConfig.outputDir}
        <Button
          variant="ghost"
          size="sm"
          class="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
          onclick={onClearOutputDir}
          disabled={!onClearOutputDir}
        >
          <RotateCcw class="size-3.5 mr-1.5" />
          Use source folders
        </Button>
      {/if}
    </div>

    <div class="space-y-2">
      <Label>Output names</Label>
      <Button
        variant="outline"
        class="w-full justify-start gap-2"
        onclick={onEditOutputNames}
        disabled={!onEditOutputNames || isProcessing}
      >
        <PenLine class="size-4" />
        Edit Output Names
      </Button>
      <p class="text-xs text-muted-foreground">
        Open the shared rename workspace to preview rules, selection, and final FFmpeg output paths.
      </p>
    </div>

    <!-- Summary -->
    <div class="rounded-md bg-muted/50 p-3 space-y-2">
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Videos to merge</span>
        <Badge variant={videosCount > 0 ? 'default' : 'secondary'}>
          {videosCount}
        </Badge>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Total tracks attached</span>
        <Badge variant={enabledTracksCount > 0 ? 'default' : 'secondary'}>
          {enabledTracksCount}
        </Badge>
      </div>
    </div>

    <!-- Progress -->
    {#if isProcessing || isCompleted}
      <div class="space-y-3">
        {#if isCompleted}
          <Alert.Root class="border-green-500/50 bg-green-500/10">
            <CheckCircle class="size-4 text-green-500" />
            <Alert.Title>Merge complete!</Alert.Title>
            <Alert.Description>
              All files have been merged successfully.
            </Alert.Description>
          </Alert.Root>
        {:else}
          <div class="space-y-2 rounded-md border bg-muted/30 px-3 py-2">
            <p class="text-sm font-medium">Merging...</p>
            {#if currentFileName}
              <p class="text-xs text-muted-foreground truncate" title={currentFileName}>
                Current file: {currentFileName}
              </p>
            {/if}
            <div class="space-y-1.5">
              <Progress value={currentFileProgress} class="h-1.5" />
              <p class="text-[11px] text-muted-foreground">
                File progress: {Math.round(currentFileProgress)}%
                {#if currentSpeedBytesPerSec && currentSpeedBytesPerSec > 0}
                  {' '}· {formatTransferRate(currentSpeedBytesPerSec)}
                {/if}
              </p>
              <p class="text-[11px] text-muted-foreground">
                {completedFiles}/{videosCount} files completed
              </p>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </Card.Content>
  <Card.Footer class="flex flex-col gap-2">
    {#if isCompleted}
      <Button class="w-full" variant="outline" onclick={onOpenFolder} disabled={!onOpenFolder}>
        <FolderOpen class="size-4 mr-2" />
        Open folder
      </Button>
      <Button
        class="w-full"
        onclick={onMerge}
        disabled={!canMerge}
      >
        <Play class="size-4 mr-2" />
        Merge again
      </Button>
    {:else if isProcessing}
      <Button
        class="w-full"
        variant="destructive"
        onclick={onCancel}
        disabled={!onCancel || isCancelling}
      >
        {#if isCancelling}
          <Loader2 class="size-4 mr-2 animate-spin" />
          Cancelling...
        {:else}
          <X class="size-4 mr-2" />
          Cancel merge
        {/if}
      </Button>
    {:else}
      <Button
        class="w-full"
        onclick={onMerge}
        disabled={!canMerge}
      >
        <Play class="size-4 mr-2" />
        Merge {videosCount} file{videosCount !== 1 ? 's' : ''}
      </Button>
    {/if}
  </Card.Footer>
</Card.Root>
