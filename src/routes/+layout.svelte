<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import { ModeWatcher } from 'mode-watcher';
  import { Toaster } from '$lib/components/ui/sonner';
  import { settingsStore } from '$lib/stores';

  let { children } = $props();

  // Load settings on app startup
  onMount(() => {
    settingsStore.load();
  });
</script>

<ModeWatcher />
<Toaster richColors closeButton />

{@render children()}

