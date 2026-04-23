<script lang="ts">
  import * as AlertDialog from '$lib/components/ui/alert-dialog';

  interface TranslationRemoveDialogProps {
    open: boolean;
    targetMode: 'single' | 'all' | null;
    onOpenChange: (open: boolean) => void;
    onCancel: () => void;
    onConfirm: () => void;
  }

  let {
    open = $bindable(false),
    targetMode,
    onOpenChange,
    onCancel,
    onConfirm,
  }: TranslationRemoveDialogProps = $props();
</script>

<AlertDialog.Root bind:open onOpenChange={onOpenChange}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>
        {targetMode === 'all' ? 'Remove all files while translating?' : 'Remove file while translating?'}
      </AlertDialog.Title>
      <AlertDialog.Description>
        {#if targetMode === 'all'}
          One or more files are currently being translated. Removing all files will cancel active translations.
        {:else}
          This file is currently being translated. Removing it will cancel the active translation.
        {/if}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={onCancel}>
        Cancel
      </AlertDialog.Cancel>
      <AlertDialog.Action
        onclick={onConfirm}
        class="bg-destructive text-white hover:bg-destructive/90"
      >
        Remove
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
