<script lang="ts">
  import type { ComponentType, SvelteComponent } from 'svelte';
  import type { IconProps } from '@lucide/svelte';

  import { cn } from '$lib/utils';

  type IconComponent = ComponentType<SvelteComponent<IconProps>>;

  interface ImportDropZoneProps {
    icon: IconComponent;
    title: string;
    formats: string | string[];
    subtitle?: string;
    onBrowse?: () => void;
    disabled?: boolean;
    class?: string;
    isDragging?: boolean;
  }

  let {
    icon: Icon,
    title,
    formats,
    subtitle = 'or click to browse',
    onBrowse,
    disabled = false,
    class: className = '',
    isDragging
  }: ImportDropZoneProps = $props();

  let isDraggingLocal = $state(false);

  const formatText = $derived(Array.isArray(formats) ? formats.join(', ') : formats);
  const dragActive = $derived((isDragging ?? isDraggingLocal) && !disabled);

  function handleBrowse() {
    if (disabled) return;
    onBrowse?.();
  }
</script>

<div
  class={cn(
    'flex-1 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors',
    dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-muted-foreground/50',
    className
  )}
  role="button"
  tabindex={disabled ? -1 : 0}
  aria-disabled={disabled}
  onclick={handleBrowse}
  onkeydown={(event) => {
    if (disabled) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleBrowse();
    }
  }}
  ondragover={(event) => {
    event.preventDefault();
    if (!disabled) isDraggingLocal = true;
  }}
  ondragleave={() => {
    isDraggingLocal = false;
  }}
  ondrop={(event) => {
    event.preventDefault();
    isDraggingLocal = false;
  }}
>
  <div class="flex flex-col items-center text-center">
    <div class="relative mb-4">
      <div class="flex items-center justify-center size-20 rounded-full bg-muted/50">
        <Icon class="size-12 text-muted-foreground" />
      </div>
    </div>

    <p class="text-lg font-medium text-muted-foreground">
      {title}
    </p>
    <p class="text-sm text-muted-foreground/70 mt-1">
      {subtitle}
    </p>

    <div class="mt-4 px-4 py-2 bg-muted/50 rounded-md">
      <p class="text-xs text-muted-foreground/70">
        Supported formats: {formatText}
      </p>
    </div>
  </div>
</div>
