<script lang="ts" module>
  export interface RenameViewApi {
    handleFileDrop: (paths: string[]) => Promise<void>;
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { FolderOpen, Play, Square } from '@lucide/svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import { exists } from '@tauri-apps/plugin-fs';
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { toast } from 'svelte-sonner';

  import { renameStore } from '$lib/stores/rename.svelte';
  import { toolImportStore } from '$lib/stores/tool-import.svelte';
  import { fetchFileMetadata } from '$lib/services/file-metadata';
  import { buildNewPath, createRenameFile } from '$lib/services/rename';
  import { logAndToast, log } from '$lib/utils/log-toast';
  import { formatFileSize, formatTransferRate } from '$lib/utils/format';
  import type { RenameCopyProgressEvent } from '$lib/types/progress';
  import type { ImportSourceId } from '$lib/types/tool-import';
  import type { RenameMode, RenameFile } from '$lib/types/rename';

  import { Button } from '$lib/components/ui/button';
  import { Progress } from '$lib/components/ui/progress';
  import * as RadioGroup from '$lib/components/ui/radio-group';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { Label } from '$lib/components/ui/label';
  import { RenameWorkspace } from '$lib/components/rename';

  interface RenameExecutionPlanItem {
    file: RenameFile;
    newPath: string;
  }

  const COPY_CANCELLED_ERROR = 'Copy cancelled';

  let overwriteDialogOpen = $state(false);
  let pendingCopyPlan = $state.raw<RenameExecutionPlanItem[] | null>(null);
  let existingCopyTargets = $state<string[]>([]);
  let isCancelling = $state(false);

  function isCopyCancelledError(errorMsg: string): boolean {
    return errorMsg === COPY_CANCELLED_ERROR || errorMsg.includes(COPY_CANCELLED_ERROR);
  }

  onMount(() => {
    let destroyed = false;
    let removeListener: (() => void) | null = null;

    const registerCopyProgressListener = async () => {
      const unlisten = await listen<RenameCopyProgressEvent>('rename-copy-progress', (event) => {
        if (!renameStore.isProcessing || renameStore.mode !== 'copy') {
          return;
        }

        const payload = event.payload;
        renameStore.updateCurrentCopyProgress(
          payload.sourcePath,
          payload.bytesCopied,
          payload.totalBytes,
          payload.progress,
          payload.speedBytesPerSec,
        );
      });

      if (destroyed) {
        unlisten();
        return;
      }

      removeListener = unlisten;
    };

    void registerCopyProgressListener();

    return () => {
      destroyed = true;
      removeListener?.();
    };
  });
  export async function handleFileDrop(paths: string[]) {
    if (paths.length === 0) {
      toast.warning('No files detected');
      return;
    }

    if (renameStore.progress.status === 'completed') {
      renameStore.resetProgress();
    }

    const newFiles = await Promise.all(
      paths.map(async (path) => {
        const metadata = await fetchFileMetadata(path);
        return createRenameFile(path, metadata.size, metadata.modifiedAt, metadata.createdAt);
      }),
    );

    renameStore.addFiles(newFiles);
    toast.success(`${paths.length} file(s) added`);
  }

  async function handleImportClick() {
    try {
      const selected = await open({
        multiple: true,
        title: 'Select files to rename',
      });

      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        await handleFileDrop(paths);
      }
    } catch (error) {
      logAndToast.error({
        source: 'rename',
        title: 'Error opening file dialog',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleImportFromSource(sourceId: ImportSourceId) {
    const { paths } = toolImportStore.resolveImport({
      targetTool: 'rename',
      sourceId,
    });

    if (paths.length === 0) {
      toast.info('No files available from this source');
      return;
    }

    const newFiles = await Promise.all(
      paths.map(async (path) => {
        const metadata = await fetchFileMetadata(path);
        return createRenameFile(path, metadata.size, metadata.modifiedAt, metadata.createdAt);
      }),
    );

    renameStore.addFiles(newFiles);
    toast.success(`${paths.length} file(s) imported`);
  }

  async function handleSelectOutputDir() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select output folder',
      });

      if (selected && typeof selected === 'string') {
        renameStore.setOutputDir(selected);
      }
    } catch (error) {
      console.error('Error selecting output directory:', error);
    }
  }

  function buildExecutionPlan(selectedFiles: RenameFile[], mode: RenameMode): RenameExecutionPlanItem[] {
    return selectedFiles.map((file) => ({
      file,
      newPath: buildNewPath(file, mode === 'copy' ? { outputDir: renameStore.outputDir } : undefined),
    }));
  }

  async function findExistingCopyTargets(plan: RenameExecutionPlanItem[]): Promise<string[]> {
    const targets: string[] = [];
    for (const item of plan) {
      try {
        if (await exists(item.newPath)) {
          targets.push(item.newPath);
        }
      } catch (error) {
        console.error('Failed to check destination path', item.newPath, error);
      }
    }
    return targets;
  }

  async function executePlan(
    plan: RenameExecutionPlanItem[],
    mode: RenameMode,
    overwriteCopy: boolean,
  ): Promise<void> {
    const totalPlannedBytes =
      mode === 'copy'
        ? plan.reduce((sum, item) => sum + Math.max(0, item.file.size ?? 0), 0)
        : 0;

    renameStore.startProcessingRun(plan.length, totalPlannedBytes);

    let successCount = 0;
    let errorCount = 0;
    let cancelledCount = 0;

    for (let i = 0; i < plan.length; i++) {
      if (renameStore.isCancelled) {
        break;
      }

      const item = plan[i];
      const file = item.file;

      renameStore.setCurrentFile(file);
      renameStore.setFileStatus(file.id, 'processing');
      let outcome: 'success' | 'error' | 'cancelled' = 'success';

      try {
        if (mode === 'rename') {
          await invoke('rename_file', {
            oldPath: file.originalPath,
            newPath: item.newPath,
          });
        } else {
          await invoke('copy_file', {
            sourcePath: file.originalPath,
            destPath: item.newPath,
            overwrite: overwriteCopy,
          });
        }

        renameStore.markFileComplete(file.id, true);
        successCount++;

        log(
          'success',
          'rename',
          `${mode === 'rename' ? 'Renamed' : 'Copied'}: ${file.originalName}`,
          `${file.originalName} → ${file.newName}`,
          { filePath: file.originalPath, outputPath: item.newPath },
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const cancelled = renameStore.isCancelled || (mode === 'copy' && isCopyCancelledError(errorMsg));

        if (cancelled) {
          outcome = 'cancelled';
          cancelledCount++;
          renameStore.setFileStatus(file.id, 'cancelled', COPY_CANCELLED_ERROR);
          log(
            'warning',
            'rename',
            `Cancelled ${mode}: ${file.originalName}`,
            COPY_CANCELLED_ERROR,
            { filePath: file.originalPath, outputPath: item.newPath },
          );
        } else {
          outcome = 'error';
          renameStore.markFileComplete(file.id, false, errorMsg);
          errorCount++;

          log(
            'error',
            'rename',
            `Failed to ${mode}: ${file.originalName}`,
            errorMsg,
            { filePath: file.originalPath },
          );
        }
      } finally {
        renameStore.markCurrentFileProcessed(outcome);
      }

      if (outcome === 'cancelled') {
        break;
      }
    }

    const wasCancelled = renameStore.isCancelled || cancelledCount > 0;
    renameStore.updateProgress({ status: wasCancelled ? 'cancelled' : 'completed' });
    const skippedCount = Math.max(0, plan.length - (successCount + errorCount + cancelledCount));

    if (wasCancelled) {
      toast.warning(`Cancelled: ${successCount} completed, ${cancelledCount + skippedCount} skipped`);
    } else if (errorCount === 0) {
      toast.success(`${successCount} file(s) ${mode === 'rename' ? 'renamed' : 'copied'} successfully`);
    } else {
      toast.warning(`${successCount} success, ${errorCount} error(s)`);
    }
  }

  async function handleCancelProcessing() {
    if (!renameStore.isProcessing || isCancelling) {
      return;
    }

    renameStore.cancelProcessing();
    const currentMode = renameStore.mode;

    if (currentMode !== 'copy') {
      toast.info('Cancelling operation...');
      return;
    }

    const sourcePath = renameStore.progress.currentFilePath;
    if (!sourcePath) {
      toast.info('Cancelling operation...');
      return;
    }

    isCancelling = true;
    try {
      await invoke('cancel_copy_file', { sourcePath });
      toast.info('Cancelling current copy...');
    } catch (error) {
      logAndToast.error({
        source: 'rename',
        title: 'Cancel failed',
        details: error instanceof Error ? error.message : String(error),
      });
    } finally {
      isCancelling = false;
    }
  }

  async function handleExecute() {
    const selectedFiles = renameStore.selectedFiles;

    if (selectedFiles.length === 0) {
      toast.warning('No files selected for renaming');
      return;
    }

    if (renameStore.hasConflicts) {
      toast.error('Please resolve naming conflicts before proceeding');
      return;
    }

    const mode = renameStore.mode;
    if (mode === 'copy' && !renameStore.outputDir) {
      toast.error('Please select an output folder for copy mode');
      return;
    }

    const plan = buildExecutionPlan(selectedFiles, mode);
    if (mode === 'copy') {
      const collisions = await findExistingCopyTargets(plan);
      if (collisions.length > 0) {
        pendingCopyPlan = plan;
        existingCopyTargets = collisions;
        overwriteDialogOpen = true;
        return;
      }
    }

    await executePlan(plan, mode, false);
  }

  function cancelCopyOverwritePrompt(): void {
    overwriteDialogOpen = false;
    pendingCopyPlan = null;
    existingCopyTargets = [];
  }

  async function confirmCopyOverwrite(): Promise<void> {
    const plan = pendingCopyPlan;
    if (!plan) {
      cancelCopyOverwritePrompt();
      return;
    }

    overwriteDialogOpen = false;
    pendingCopyPlan = null;
    existingCopyTargets = [];
    await executePlan(plan, 'copy', true);
  }

  async function handleOpenFolder() {
    try {
      const dir = renameStore.outputDir || (
        renameStore.files[0]
          && renameStore.files[0].originalPath.substring(0, renameStore.files[0].originalPath.lastIndexOf('/'))
      );

      if (dir) {
        await invoke('open_folder', { path: dir });
      }
    } catch (error) {
      console.error('Error opening folder:', error);
    }
  }

  function handleClearAll() {
    renameStore.clear();
    toast.info('All files cleared');
  }

  function handleModeChange(value: string) {
    renameStore.setMode(value as RenameMode);
  }

  const progress = $derived(renameStore.progress);
  const selectedCount = $derived(renameStore.selectedCount);
  const hasChanges = $derived(renameStore.hasChanges);
  const isProcessing = $derived(renameStore.isProcessing);
  const mode = $derived(renameStore.mode);
  const outputDir = $derived(renameStore.outputDir);
  const canExecute = $derived(
    selectedCount > 0
    && !renameStore.hasConflicts
    && !isProcessing
    && hasChanges
    && (mode === 'rename' || outputDir),
  );
  const overwriteTargetSamples = $derived(existingCopyTargets.slice(0, 5));
  const copiedBytes = $derived(Math.max(0, progress.completedBytes + progress.currentFileBytesCopied));
  const totalBytes = $derived(Math.max(0, progress.totalBytes));
  const copiedBytesLabel = $derived(
    formatFileSize(totalBytes > 0 ? Math.min(copiedBytes, totalBytes) : copiedBytes),
  );
  const totalBytesLabel = $derived(formatFileSize(totalBytes));
</script>

<RenameWorkspace
  workspace={renameStore}
  importTargetTool="rename"
  onBrowseImport={handleImportClick}
  onSelectImportSource={handleImportFromSource}
  onClearAll={handleClearAll}
>
  {#snippet actionPanel()}
    <div class="space-y-2">
      <Label class="text-xs uppercase tracking-wide text-muted-foreground">Mode</Label>
      <RadioGroup.Root value={mode} onValueChange={handleModeChange} class="flex gap-4">
        <label class="flex items-center gap-2 cursor-pointer">
          <RadioGroup.Item value="rename" />
          <span class="text-sm">Rename</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <RadioGroup.Item value="copy" />
          <span class="text-sm">Copy</span>
        </label>
      </RadioGroup.Root>
    </div>

    {#if mode === 'copy'}
      <div class="space-y-2">
        <Label class="text-xs uppercase tracking-wide text-muted-foreground">Output Folder</Label>
        <Button
          variant="outline"
          class="w-full justify-start gap-2 h-auto py-2 text-left"
          onclick={handleSelectOutputDir}
        >
          <FolderOpen class="size-4 shrink-0" />
          <span class="truncate flex-1 text-sm">
            {#if outputDir}
              {outputDir}
            {:else}
              <span class="text-muted-foreground">Select folder...</span>
            {/if}
          </span>
        </Button>
      </div>
    {/if}

    {#if isProcessing && mode === 'copy'}
      <div class="space-y-2 rounded-md border bg-muted/30 px-3 py-2">
        <p class="text-sm font-medium">Copying...</p>
        {#if progress.currentFile}
          <p class="text-xs text-muted-foreground truncate" title={progress.currentFile}>
            Current file: {progress.currentFile}
          </p>
        {/if}
        <div class="space-y-1.5">
          <Progress value={progress.currentFileProgress} class="h-1.5" />
          <p class="text-[11px] text-muted-foreground">
            File progress: {Math.round(progress.currentFileProgress)}%
            {#if progress.currentSpeedBytesPerSec && progress.currentSpeedBytesPerSec > 0}
              · {formatTransferRate(progress.currentSpeedBytesPerSec)}
            {/if}
          </p>
          <p class="text-[11px] text-muted-foreground">
            {progress.current}/{progress.total} files completed
          </p>
          <p class="text-[11px] text-muted-foreground">
            Copied: {copiedBytesLabel} / {totalBytesLabel}
          </p>
        </div>
      </div>
    {/if}

    {#if isProcessing}
      <Button
        class="w-full"
        size="lg"
        variant="destructive"
        disabled={isCancelling}
        onclick={handleCancelProcessing}
      >
        <Square class="size-4 mr-2" />
        Cancel
      </Button>
    {:else}
      <Button
        class="w-full"
        size="lg"
        disabled={!canExecute}
        onclick={handleExecute}
      >
        <Play class="size-4 mr-2" />
        {mode === 'rename' ? 'Rename' : 'Copy'} {selectedCount} file{selectedCount !== 1 ? 's' : ''}
      </Button>
    {/if}

    {#if progress.status === 'completed' || progress.status === 'cancelled'}
      <Button
        variant="outline"
        class="w-full"
        onclick={handleOpenFolder}
      >
        <FolderOpen class="size-4 mr-2" />
        Open Folder
      </Button>
    {/if}
  {/snippet}
</RenameWorkspace>

<AlertDialog.Root bind:open={overwriteDialogOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Overwrite existing files?</AlertDialog.Title>
      <AlertDialog.Description>
        {existingCopyTargets.length} destination file(s) already exist. Continuing will replace them.
      </AlertDialog.Description>
    </AlertDialog.Header>

    {#if overwriteTargetSamples.length > 0}
      <div class="rounded-md border bg-muted/40 p-3 space-y-1 max-h-36 overflow-auto">
        {#each overwriteTargetSamples as targetPath (targetPath)}
          <p class="text-xs font-mono truncate">{targetPath}</p>
        {/each}
        {#if existingCopyTargets.length > overwriteTargetSamples.length}
          <p class="text-xs text-muted-foreground">
            + {existingCopyTargets.length - overwriteTargetSamples.length} more
          </p>
        {/if}
      </div>
    {/if}

    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={cancelCopyOverwritePrompt}>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action
        onclick={confirmCopyOverwrite}
        class="bg-destructive text-white hover:bg-destructive/90"
      >
        Overwrite and Continue
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
