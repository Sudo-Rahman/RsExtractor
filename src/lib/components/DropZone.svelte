<script lang="ts">
  import { cn } from '$lib/utils';
  import Upload from 'lucide-svelte/icons/upload';
  import File from 'lucide-svelte/icons/file';

  interface DropZoneProps {
    isDragging?: boolean;
    onFilesDropped?: (paths: string[]) => void;
    class?: string;
  }

  let { isDragging = false, onFilesDropped, class: className = '' }: DropZoneProps = $props();
</script>

<div
  class={cn(
    'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors',
    isDragging
      ? 'border-primary bg-primary/5'
      : 'border-muted-foreground/25 hover:border-muted-foreground/50',
    className
  )}
>
  <div class={cn(
    'rounded-full p-4 mb-4',
    isDragging ? 'bg-primary/10' : 'bg-muted'
  )}>
    {#if isDragging}
      <Upload class="size-8 text-primary" />
    {:else}
      <File class="size-8 text-muted-foreground" />
    {/if}
  </div>

  <p class="text-lg font-medium mb-2">
    {#if isDragging}
      Déposez les fichiers ici
    {:else}
      Glissez-déposez vos fichiers MKV
    {/if}
  </p>

  <p class="text-sm text-muted-foreground">
    ou cliquez sur "Importer" pour sélectionner des fichiers
  </p>
</div>


