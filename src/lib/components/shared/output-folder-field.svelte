<script lang="ts">
  import { FolderOpen } from '@lucide/svelte';

  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import type { OutputFolderFieldState } from '$lib/utils/output-folder';

  interface OutputFolderFieldProps {
    label: string;
    displayText?: string;
    state: OutputFolderFieldState;
    placeholder?: string;
    description?: string;
    disabled?: boolean;
    showReset?: boolean;
    resetLabel?: string;
    browseAriaLabel?: string;
    onBrowse?: () => void | Promise<void>;
    onReset?: () => void;
  }

  let {
    label,
    displayText = '',
    state,
    placeholder = 'Select output folder...',
    description,
    disabled = false,
    showReset = false,
    resetLabel = 'Reset',
    browseAriaLabel = 'Select output folder',
    onBrowse,
    onReset,
  }: OutputFolderFieldProps = $props();

  const normalizedDisplayText = $derived(displayText.trim());
  const inputValue = $derived(state === 'empty' ? '' : normalizedDisplayText);
  const displayTitle = $derived(state === 'empty' ? undefined : normalizedDisplayText);
</script>

<div class="space-y-2">
  <Label>{label}</Label>

  <div class="flex gap-2">
    <Input
      value={inputValue}
      readonly
      placeholder={placeholder}
      class="text-xs"
      title={displayTitle}
    />
    <Button variant="outline" size="icon" onclick={onBrowse} disabled={disabled || !onBrowse} aria-label={browseAriaLabel}>
      <FolderOpen class="size-4" />
    </Button>
  </div>

  {#if description}
    <p class="text-xs text-muted-foreground">
      {description}
    </p>
  {/if}

  {#if showReset && onReset}
    <Button
      variant="ghost"
      class="h-6 text-xs text-muted-foreground hover:text-foreground"
      onclick={onReset}
      disabled={disabled}
    >
      {resetLabel}
    </Button>
  {/if}
</div>
