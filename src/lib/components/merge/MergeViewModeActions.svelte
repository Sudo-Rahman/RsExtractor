<script lang="ts">
  import { ArrowLeft, Home, LayoutGrid, Table } from '@lucide/svelte';

  import { Button } from '$lib/components/ui/button';

  interface Props {
    internalView: 'main' | 'output-naming' | 'ai-match';
    viewMode: 'home' | 'groups' | 'table';
    onBack: () => void;
    onViewModeChange: (viewMode: 'home' | 'groups' | 'table') => void;
  }

  let { internalView, viewMode, onBack, onViewModeChange }: Props = $props();
</script>

{#if internalView !== 'main'}
  <Button
    variant="outline"
    size="sm"
    class="mr-2"
    onclick={onBack}
  >
    <ArrowLeft class="size-4 mr-2" />
    Back to Merge
  </Button>
{:else}
  <div class="flex items-center gap-1 mr-2">
    <Button
      variant={viewMode === 'home' ? 'secondary' : 'ghost'}
      size="sm"
      onclick={() => onViewModeChange('home')}
      title="Home view"
    >
      <Home class="size-4 mr-1" />
      Home
    </Button>
    <Button
      variant={viewMode === 'groups' ? 'secondary' : 'ghost'}
      size="sm"
      onclick={() => onViewModeChange('groups')}
      title="Groups view"
    >
      <LayoutGrid class="size-4 mr-1" />
      Groups
    </Button>
    <Button
      variant={viewMode === 'table' ? 'secondary' : 'ghost'}
      size="sm"
      onclick={() => onViewModeChange('table')}
      title="Table view"
    >
      <Table class="size-4 mr-1" />
      Table
    </Button>
  </div>
{/if}
