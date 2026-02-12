<script lang="ts">
  import { ChevronDown, Upload } from '@lucide/svelte';

  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { toolImportStore } from '$lib/stores/tool-import.svelte';
  import type { ImportSourceId, ToolId } from '$lib/types/tool-import';

  interface ToolImportButtonProps {
    targetTool: ToolId;
    label?: string;
    browseLabel?: string;
    disabled?: boolean;
    variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive';
    size?: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm';
    class?: string;
    sourceFilter?: ImportSourceId[];
    onBrowse?: () => void | Promise<void>;
    onSelectSource?: (sourceId: ImportSourceId) => void | Promise<void>;
  }

  let {
    targetTool,
    label = 'Add',
    browseLabel = 'Browse files...',
    disabled = false,
    variant = 'default',
    size = 'sm',
    class: className = '',
    sourceFilter,
    onBrowse,
    onSelectSource,
  }: ToolImportButtonProps = $props();

  const sources = $derived(toolImportStore.getAvailableSources(targetTool, sourceFilter));
  const hasSources = $derived(sources.length > 0);

  async function handleBrowse() {
    if (disabled) {
      return;
    }

    await onBrowse?.();
  }

  async function handleSourceSelect(sourceId: ImportSourceId) {
    if (disabled) {
      return;
    }

    await onSelectSource?.(sourceId);
  }
</script>

{#if hasSources}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <Button {variant} {size} {...props} disabled={disabled} class={className}>
          <Upload class="size-4 mr-1.5" />
          {label}
          <ChevronDown class="size-3 ml-1" />
        </Button>
      {/snippet}
    </DropdownMenu.Trigger>

    <DropdownMenu.Content align="start" class="w-64">
      <DropdownMenu.Item onclick={handleBrowse}>
        <Upload class="size-4 mr-2" />
        {browseLabel}
      </DropdownMenu.Item>

      <DropdownMenu.Separator />
      <DropdownMenu.Label>Import from</DropdownMenu.Label>

      {#each sources as source}
        <DropdownMenu.Item onclick={() => handleSourceSelect(source.sourceId)}>
          <span class="mr-2 inline-flex size-4 items-center justify-center text-xs text-muted-foreground">+</span>
          {source.label} ({source.count})
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{:else}
  <Button {variant} {size} onclick={handleBrowse} disabled={disabled} class={className}>
    <Upload class="size-4 mr-1.5" />
    {label}
  </Button>
{/if}
