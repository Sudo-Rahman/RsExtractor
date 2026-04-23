<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Check, Copy } from '@lucide/svelte';

  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';

  interface Props {
    rawData: unknown;
  }

  let { rawData }: Props = $props();

  let copied = $state(false);
  let resetCopiedTimeout: ReturnType<typeof setTimeout> | null = null;

  const rawJson = $derived.by(() => JSON.stringify(rawData, null, 2));

  function clearCopiedTimeout(): void {
    if (resetCopiedTimeout) {
      clearTimeout(resetCopiedTimeout);
      resetCopiedTimeout = null;
    }
  }

  async function copyRawData(): Promise<void> {
    await navigator.clipboard.writeText(rawJson);

    copied = true;
    clearCopiedTimeout();
    resetCopiedTimeout = setTimeout(() => {
      copied = false;
      resetCopiedTimeout = null;
    }, 2000);
  }

  $effect(() => {
    rawData;
    copied = false;
    clearCopiedTimeout();
  });

  onDestroy(() => {
    clearCopiedTimeout();
  });
</script>

<div class="p-4">
  <Card.Root>
    <Card.Header class="pb-2 flex flex-row items-center justify-between">
      <Card.Title class="text-sm">Raw FFprobe Output</Card.Title>
      <Button
        variant="outline"
        size="sm"
        onclick={copyRawData}
      >
        {#if copied}
          <Check class="size-4 mr-1" />
          Copied!
        {:else}
          <Copy class="size-4 mr-1" />
          Copy JSON
        {/if}
      </Button>
    </Card.Header>
    <Card.Content>
      <pre class="text-xs bg-muted p-3 w-full rounded-md text-wrap font-mono">{rawJson}</pre>
    </Card.Content>
  </Card.Root>
</div>
