<script lang="ts">
  import * as AlertDialog from '$lib/components/ui/alert-dialog';

  interface RenameOverwriteDialogProps {
    open: boolean;
    existingTargetCount: number;
    targetSamples: string[];
    onCancel: () => void;
    onConfirm: () => void | Promise<void>;
  }

  let {
    open = $bindable(false),
    existingTargetCount,
    targetSamples,
    onCancel,
    onConfirm,
  }: RenameOverwriteDialogProps = $props();
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Overwrite existing files?</AlertDialog.Title>
      <AlertDialog.Description>
        {existingTargetCount} destination file(s) already exist. Continuing will replace them.
      </AlertDialog.Description>
    </AlertDialog.Header>

    {#if targetSamples.length > 0}
      <div class="max-h-36 space-y-1 overflow-auto rounded-md border bg-muted/40 p-3">
        {#each targetSamples as targetPath (targetPath)}
          <p class="truncate font-mono text-xs">{targetPath}</p>
        {/each}
        {#if existingTargetCount > targetSamples.length}
          <p class="text-xs text-muted-foreground">
            + {existingTargetCount - targetSamples.length} more
          </p>
        {/if}
      </div>
    {/if}

    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={onCancel}>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={onConfirm} class="bg-destructive text-white hover:bg-destructive/90">
        Overwrite and Continue
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
