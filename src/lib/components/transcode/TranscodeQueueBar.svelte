<script lang="ts">
  import { FolderOpen, Play, X } from '@lucide/svelte';

  import { Button } from '$lib/components/ui/button';
  import { formatTransferRate } from '$lib/utils/format';

  interface Props {
    readyCount: number;
    conflictCount: number;
    isProcessing: boolean;
    isCancelling: boolean;
    progress: number;
    totalFiles: number;
    currentSpeedBytesPerSec?: number;
    onOpenOutput?: () => void;
    onCancelAll?: () => void | Promise<void>;
    onStartTranscode?: () => void | Promise<void>;
  }

  let {
    readyCount,
    conflictCount,
    isProcessing,
    isCancelling,
    progress,
    totalFiles,
    currentSpeedBytesPerSec,
    onOpenOutput,
    onCancelAll,
    onStartTranscode,
  }: Props = $props();
</script>

<div class="border-t px-4 py-3 flex flex-wrap items-center justify-between gap-3">
  <div class="min-w-0">
    <p class="text-sm font-medium">Queue</p>
    <p class="text-xs text-muted-foreground">
      {readyCount} ready file(s)
      {#if conflictCount > 0}
        · {conflictCount} conflict(s)
      {/if}
      {#if isProcessing && totalFiles > 0}
        · {Math.round(progress)}% overall
        {#if currentSpeedBytesPerSec}
          · {formatTransferRate(currentSpeedBytesPerSec)}
        {/if}
      {/if}
    </p>
  </div>

  <div class="flex flex-wrap items-center gap-2">
    <Button variant="outline" onclick={onOpenOutput}>
      <FolderOpen class="size-4 mr-2" />
      Output
    </Button>

    {#if isProcessing}
      <Button variant="destructive" onclick={onCancelAll} disabled={isCancelling}>
        <X class="size-4 mr-2" />
        Cancel All
      </Button>
    {:else}
      <Button onclick={onStartTranscode} disabled={readyCount === 0 || conflictCount > 0}>
        <Play class="size-4 mr-2" />
        Start Transcode
      </Button>
    {/if}
  </div>
</div>
