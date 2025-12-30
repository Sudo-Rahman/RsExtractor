<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { open } from '@tauri-apps/plugin-dialog';
  import { mode, setMode } from 'mode-watcher';
  import { toast } from 'svelte-sonner';

  import { settingsStore } from '$lib/stores';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Card from '$lib/components/ui/card';
  import * as RadioGroup from '$lib/components/ui/radio-group';
  import { Separator } from '$lib/components/ui/separator';
  import { Badge } from '$lib/components/ui/badge';

  import Sun from 'lucide-svelte/icons/sun';
  import Moon from 'lucide-svelte/icons/moon';
  import Monitor from 'lucide-svelte/icons/monitor';
  import Palette from 'lucide-svelte/icons/palette';
  import Terminal from 'lucide-svelte/icons/terminal';
  import FolderOpen from 'lucide-svelte/icons/folder-open';
  import Download from 'lucide-svelte/icons/download';
  import CheckCircle from 'lucide-svelte/icons/check-circle';
  import XCircle from 'lucide-svelte/icons/x-circle';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import Info from 'lucide-svelte/icons/info';

  let ffmpegStatus = $state<'checking' | 'found' | 'not-found'>('checking');
  let ffmpegVersion = $state<string | null>(null);

  const themeOptions = [
    { value: 'system', label: 'System', icon: Monitor, description: 'Follow system preferences' },
    { value: 'light', label: 'Light', icon: Sun, description: 'Light theme' },
    { value: 'dark', label: 'Dark', icon: Moon, description: 'Dark theme' },
  ] as const;

  onMount(async () => {
    await settingsStore.load();
    await checkFFmpeg();
  });

  async function checkFFmpeg() {
    ffmpegStatus = 'checking';
    try {
      const available = await invoke<boolean>('check_ffmpeg');
      if (available) {
        ffmpegStatus = 'found';
        // Try to get version
        try {
          const version = await invoke<string>('get_ffmpeg_version');
          ffmpegVersion = version;
        } catch {
          ffmpegVersion = 'Unknown version';
        }
      } else {
        ffmpegStatus = 'not-found';
        ffmpegVersion = null;
      }
    } catch {
      ffmpegStatus = 'not-found';
      ffmpegVersion = null;
    }
  }

  async function handleThemeChange(value: string) {
    const theme = value as 'system' | 'light' | 'dark';
    setMode(theme);
    await settingsStore.setTheme(theme);
  }

  async function handleBrowseFFmpeg() {
    const selected = await open({
      multiple: false,
      title: 'Select FFmpeg executable'
    });
    if (selected && typeof selected === 'string') {
      await settingsStore.setFFmpegPath(selected);
      toast.success('FFmpeg path updated');
      await checkFFmpeg();
    }
  }

  async function handleBrowseFFprobe() {
    const selected = await open({
      multiple: false,
      title: 'Select FFprobe executable'
    });
    if (selected && typeof selected === 'string') {
      await settingsStore.setFFprobePath(selected);
      toast.success('FFprobe path updated');
    }
  }

  function handleDownloadFFmpeg() {
    // Open FFmpeg download page
    window.open('https://ffmpeg.org/download.html', '_blank');
  }

  const currentMode = $derived(mode.current || 'system');
</script>

<div class="h-full overflow-auto p-6">
  <div class="max-w-2xl mx-auto space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold">Settings</h1>
      <p class="text-muted-foreground mt-1">Customize the app appearance and configuration</p>
    </div>

    <Separator />

    <!-- FFmpeg Configuration -->
    <Card.Root>
      <Card.Header>
        <div class="flex items-center gap-2">
          <Terminal class="size-5 text-primary" />
          <Card.Title>FFmpeg Configuration</Card.Title>
        </div>
        <Card.Description>
          Configure FFmpeg and FFprobe paths for media processing
        </Card.Description>
      </Card.Header>
      <Card.Content class="space-y-4">
        <!-- Status -->
        <div class="flex items-center justify-between p-3 rounded-md bg-muted/50">
          <div class="flex items-center gap-2">
            {#if ffmpegStatus === 'checking'}
              <RefreshCw class="size-4 animate-spin text-muted-foreground" />
              <span class="text-sm">Checking FFmpeg...</span>
            {:else if ffmpegStatus === 'found'}
              <CheckCircle class="size-4 text-green-500" />
              <span class="text-sm">FFmpeg found</span>
              {#if ffmpegVersion}
                <Badge variant="secondary" class="text-xs">{ffmpegVersion}</Badge>
              {/if}
            {:else}
              <XCircle class="size-4 text-destructive" />
              <span class="text-sm text-destructive">FFmpeg not found</span>
            {/if}
          </div>
          <Button variant="ghost" size="sm" onclick={checkFFmpeg}>
            <RefreshCw class="size-4" />
          </Button>
        </div>

        <!-- FFmpeg path -->
        <div class="space-y-2">
          <Label for="ffmpeg-path">FFmpeg path (optional)</Label>
          <div class="flex gap-2">
            <Input
              id="ffmpeg-path"
              placeholder="Leave empty to use system PATH"
              value={settingsStore.settings.ffmpegPath}
              oninput={(e) => settingsStore.setFFmpegPath(e.currentTarget.value)}
              class="flex-1"
            />
            <Button variant="outline" size="icon" onclick={handleBrowseFFmpeg}>
              <FolderOpen class="size-4" />
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            If empty, the app will use FFmpeg from your system PATH
          </p>
        </div>

        <!-- FFprobe path -->
        <div class="space-y-2">
          <Label for="ffprobe-path">FFprobe path (optional)</Label>
          <div class="flex gap-2">
            <Input
              id="ffprobe-path"
              placeholder="Leave empty to use system PATH"
              value={settingsStore.settings.ffprobePath}
              oninput={(e) => settingsStore.setFFprobePath(e.currentTarget.value)}
              class="flex-1"
            />
            <Button variant="outline" size="icon" onclick={handleBrowseFFprobe}>
              <FolderOpen class="size-4" />
            </Button>
          </div>
        </div>

        <!-- Download button -->
        {#if ffmpegStatus === 'not-found'}
          <Button variant="outline" class="w-full" onclick={handleDownloadFFmpeg}>
            <Download class="size-4 mr-2" />
            Download FFmpeg
          </Button>
        {/if}
      </Card.Content>
    </Card.Root>

    <!-- Appearance -->
    <Card.Root>
      <Card.Header>
        <div class="flex items-center gap-2">
          <Palette class="size-5 text-primary" />
          <Card.Title>Appearance</Card.Title>
        </div>
        <Card.Description>
          Choose the interface theme
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <RadioGroup.Root value={currentMode} onValueChange={handleThemeChange} class="grid gap-3">
          {#each themeOptions as option}
            {@const Icon = option.icon}
            <Label
              for={option.value}
              class="flex items-center gap-4 rounded-lg border p-4 cursor-pointer transition-colors hover:bg-accent/50 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5"
            >
              <RadioGroup.Item value={option.value} id={option.value} />
              <div class="flex items-center gap-3 flex-1">
                <div class="p-2 rounded-md bg-muted">
                  <Icon class="size-5 text-muted-foreground" />
                </div>
                <div class="flex-1">
                  <div class="font-medium">{option.label}</div>
                  <div class="text-sm text-muted-foreground">{option.description}</div>
                </div>
              </div>
            </Label>
          {/each}
        </RadioGroup.Root>
      </Card.Content>
    </Card.Root>

    <!-- About -->
    <Card.Root>
      <Card.Header>
        <div class="flex items-center gap-2">
          <Info class="size-5 text-primary" />
          <Card.Title>About</Card.Title>
        </div>
      </Card.Header>
      <Card.Content class="space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-muted-foreground">Version</span>
          <span class="font-mono text-sm">1.0.0</span>
        </div>
        <Separator />
        <div class="text-sm text-muted-foreground">
          <p>RsExtractor is a tool for extracting and merging media tracks (audio, video, subtitles) from MKV and other container files.</p>
          <p class="mt-2">Built with Tauri, Svelte, and FFmpeg.</p>
        </div>
      </Card.Content>
    </Card.Root>
  </div>
</div>

