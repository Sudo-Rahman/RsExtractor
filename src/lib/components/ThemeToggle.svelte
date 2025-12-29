<script lang="ts">
  import { toggleMode, mode } from 'mode-watcher';
  import { Button } from '$lib/components/ui/button';
  import Sun from 'lucide-svelte/icons/sun';
  import Moon from 'lucide-svelte/icons/moon';
</script>

<Button variant="ghost" size="icon" onclick={toggleMode}>
  {#if mode.current === 'dark'}
    <Sun class="size-5" />
    <span class="sr-only">Passer en mode clair</span>
  {:else}
    <Moon class="size-5" />
    <span class="sr-only">Passer en mode sombre</span>
  {/if}
</Button>

