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
  import Key from 'lucide-svelte/icons/key';
  import Eye from 'lucide-svelte/icons/eye';
  import EyeOff from 'lucide-svelte/icons/eye-off';
  import Languages from 'lucide-svelte/icons/languages';
  import AudioLines from 'lucide-svelte/icons/audio-lines';
  import ExternalLink from 'lucide-svelte/icons/external-link';

  import { LLM_PROVIDERS, type LLMProvider } from '$lib/types';

  let ffmpegStatus = $state<'checking' | 'found' | 'not-found'>('checking');
  let ffmpegVersion = $state<string | null>(null);

  // Deepgram API key visibility
  let showDeepgramApiKey = $state(false);

  const themeOptions = [
    { value: 'system', label: 'Systeme', icon: Monitor, description: 'Suivre les preferences systeme' },
    { value: 'light', label: 'Clair', icon: Sun, description: 'Theme clair' },
    { value: 'dark', label: 'Sombre', icon: Moon, description: 'Theme sombre' },
  ] as const;

  // API Key visibility states
  let showApiKeys = $state<Record<LLMProvider, boolean>>({
    openai: false,
    anthropic: false,
    google: false,
    openrouter: false
  });

  function toggleApiKeyVisibility(provider: LLMProvider) {
    showApiKeys = { ...showApiKeys, [provider]: !showApiKeys[provider] };
  }

  async function handleApiKeyChange(provider: LLMProvider, value: string) {
    await settingsStore.setLLMApiKey(provider, value);
  }

  async function handleDeepgramApiKeyChange(value: string) {
    await settingsStore.setDeepgramApiKey(value);
  }

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
          ffmpegVersion = 'Version inconnue';
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
      title: 'Selectionner l\'executable FFmpeg'
    });
    if (selected && typeof selected === 'string') {
      await settingsStore.setFFmpegPath(selected);
      toast.success('Chemin FFmpeg mis a jour');
      await checkFFmpeg();
    }
  }

  async function handleBrowseFFprobe() {
    const selected = await open({
      multiple: false,
      title: 'Selectionner l\'executable FFprobe'
    });
    if (selected && typeof selected === 'string') {
      await settingsStore.setFFprobePath(selected);
      toast.success('Chemin FFprobe mis a jour');
    }
  }

  function handleDownloadFFmpeg() {
    window.open('https://ffmpeg.org/download.html', '_blank');
  }

  function handleOpenDeepgramConsole() {
    window.open('https://console.deepgram.com/', '_blank');
  }

  const currentMode = $derived(mode.current || 'system');
  const deepgramApiKeyConfigured = $derived(
    settingsStore.settings.deepgramApiKey && settingsStore.settings.deepgramApiKey.length > 0
  );
</script>

<div class="h-full overflow-auto p-6">
  <div class="max-w-2xl mx-auto space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold">Parametres</h1>
      <p class="text-muted-foreground mt-1">Personnaliser l'apparence et la configuration</p>
    </div>

    <Separator />

    <!-- Deepgram Configuration -->
    <Card.Root>
      <Card.Header>
        <div class="flex items-center gap-2">
          <AudioLines class="size-5 text-primary" />
          <Card.Title>Deepgram</Card.Title>
        </div>
        <Card.Description>
          Configuration de l'API Deepgram Nova pour la transcription audio
        </Card.Description>
      </Card.Header>
      <Card.Content class="space-y-4">
        <!-- Status -->
        <div class="flex items-center justify-between p-3 rounded-md bg-muted/50">
          <div class="flex items-center gap-2">
            {#if deepgramApiKeyConfigured}
              <CheckCircle class="size-4 text-green-500" />
              <span class="text-sm">Cle API configuree</span>
            {:else}
              <XCircle class="size-4 text-amber-500" />
              <span class="text-sm text-amber-600 dark:text-amber-400">Cle API non configuree</span>
            {/if}
          </div>
        </div>

        <!-- API Key input -->
        <div class="space-y-2">
          <Label for="deepgram-api-key">Cle API Deepgram</Label>
          <div class="flex gap-2">
            <div class="relative flex-1">
              <Input
                id="deepgram-api-key"
                type={showDeepgramApiKey ? 'text' : 'password'}
                placeholder="Entrez votre cle API Deepgram"
                value={settingsStore.settings.deepgramApiKey}
                oninput={(e) => handleDeepgramApiKeyChange(e.currentTarget.value)}
                class="pr-10"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onclick={() => showDeepgramApiKey = !showDeepgramApiKey}
            >
              {#if showDeepgramApiKey}
                <EyeOff class="size-4" />
              {:else}
                <Eye class="size-4" />
              {/if}
            </Button>
          </div>
        </div>

        <!-- Info and link -->
        <div class="p-3 rounded-md border border-muted bg-muted/30">
          <p class="text-sm text-muted-foreground mb-2">
            Deepgram Nova offre une transcription audio de haute qualite avec support multilingue.
          </p>
          <Button 
            variant="outline" 
            size="sm" 
            class="w-full"
            onclick={handleOpenDeepgramConsole}
          >
            <ExternalLink class="size-4 mr-2" />
            Obtenir une cle API sur Deepgram
          </Button>
        </div>

        <div class="pt-2 text-xs text-muted-foreground">
          <p>La cle API est stockee localement et n'est jamais partagee.</p>
          <p class="mt-1">Deepgram offre 200$ de credits gratuits pour commencer.</p>
        </div>
      </Card.Content>
    </Card.Root>

    <!-- FFmpeg Configuration -->
    <Card.Root>
      <Card.Header>
        <div class="flex items-center gap-2">
          <Terminal class="size-5 text-primary" />
          <Card.Title>FFmpeg</Card.Title>
        </div>
        <Card.Description>
          Configurer les chemins FFmpeg et FFprobe pour le traitement multimedia
        </Card.Description>
      </Card.Header>
      <Card.Content class="space-y-4">
        <!-- Status -->
        <div class="flex items-center justify-between p-3 rounded-md bg-muted/50">
          <div class="flex items-center gap-2">
            {#if ffmpegStatus === 'checking'}
              <RefreshCw class="size-4 animate-spin text-muted-foreground" />
              <span class="text-sm">Verification de FFmpeg...</span>
            {:else if ffmpegStatus === 'found'}
              <CheckCircle class="size-4 text-green-500" />
              <span class="text-sm">FFmpeg trouve</span>
              {#if ffmpegVersion}
                <Badge variant="secondary" class="text-xs">{ffmpegVersion}</Badge>
              {/if}
            {:else}
              <XCircle class="size-4 text-destructive" />
              <span class="text-sm text-destructive">FFmpeg non trouve</span>
            {/if}
          </div>
          <Button variant="ghost" size="sm" onclick={checkFFmpeg}>
            <RefreshCw class="size-4" />
          </Button>
        </div>

        <!-- FFmpeg path -->
        <div class="space-y-2">
          <Label for="ffmpeg-path">Chemin FFmpeg (optionnel)</Label>
          <div class="flex gap-2">
            <Input
              id="ffmpeg-path"
              placeholder="Laisser vide pour utiliser le PATH systeme"
              value={settingsStore.settings.ffmpegPath}
              oninput={(e) => settingsStore.setFFmpegPath(e.currentTarget.value)}
              class="flex-1"
            />
            <Button variant="outline" size="icon" onclick={handleBrowseFFmpeg}>
              <FolderOpen class="size-4" />
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            Si vide, l'application utilisera FFmpeg depuis le PATH systeme
          </p>
        </div>

        <!-- FFprobe path -->
        <div class="space-y-2">
          <Label for="ffprobe-path">Chemin FFprobe (optionnel)</Label>
          <div class="flex gap-2">
            <Input
              id="ffprobe-path"
              placeholder="Laisser vide pour utiliser le PATH systeme"
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
            Telecharger FFmpeg
          </Button>
        {/if}
      </Card.Content>
    </Card.Root>

    <!-- LLM API Keys -->
    <Card.Root>
      <Card.Header>
        <div class="flex items-center gap-2">
          <Key class="size-5 text-primary" />
          <Card.Title>Cles API LLM</Card.Title>
        </div>
        <Card.Description>
          Configurer les cles API pour la traduction de sous-titres par IA
        </Card.Description>
      </Card.Header>
      <Card.Content class="space-y-4">
        {#each Object.entries(LLM_PROVIDERS) as [key, provider] (key)}
          {@const providerKey = key as LLMProvider}
          <div class="space-y-2">
            <Label for={`api-key-${key}`}>Cle API {provider.name}</Label>
            <div class="flex gap-2">
              <div class="relative flex-1">
                <Input
                  id={`api-key-${key}`}
                  type={showApiKeys[providerKey] ? 'text' : 'password'}
                  placeholder={`Entrez votre cle API ${provider.name}`}
                  value={settingsStore.settings.llmApiKeys[providerKey]}
                  oninput={(e) => handleApiKeyChange(providerKey, e.currentTarget.value)}
                  class="pr-10"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onclick={() => toggleApiKeyVisibility(providerKey)}
              >
                {#if showApiKeys[providerKey]}
                  <EyeOff class="size-4" />
                {:else}
                  <Eye class="size-4" />
                {/if}
              </Button>
            </div>
            {#if providerKey === 'openrouter'}
              <p class="text-xs text-muted-foreground">
                OpenRouter permet d'acceder a plusieurs modeles de differents fournisseurs
              </p>
            {/if}
          </div>
        {/each}

        <div class="pt-2 text-xs text-muted-foreground">
          <p>Les cles API sont stockees localement et ne sont jamais partagees. Obtenez vos cles:</p>
          <ul class="mt-1 space-y-1 list-disc list-inside">
            <li><a href="https://platform.openai.com/api-keys" target="_blank" class="text-primary hover:underline">OpenAI Platform</a></li>
            <li><a href="https://console.anthropic.com/" target="_blank" class="text-primary hover:underline">Anthropic Console</a></li>
            <li><a href="https://aistudio.google.com/apikey" target="_blank" class="text-primary hover:underline">Google AI Studio</a></li>
            <li><a href="https://openrouter.ai/keys" target="_blank" class="text-primary hover:underline">OpenRouter</a></li>
          </ul>
        </div>
      </Card.Content>
    </Card.Root>

    <!-- Translation Settings -->
    <Card.Root>
      <Card.Header>
        <div class="flex items-center gap-2">
          <Languages class="size-5 text-primary" />
          <Card.Title>Parametres de traduction</Card.Title>
        </div>
        <Card.Description>
          Configurer le traitement parallele et le batching
        </Card.Description>
      </Card.Header>
      <Card.Content class="space-y-4">
        <div class="space-y-2">
          <Label for="max-parallel">Fichiers paralleles maximum</Label>
          <Input
            id="max-parallel"
            type="number"
            min="1"
            max="10"
            value={settingsStore.settings.translationSettings.maxParallelFiles}
            oninput={(e) => settingsStore.setMaxParallelFiles(parseInt(e.currentTarget.value) || 1)}
          />
          <p class="text-xs text-muted-foreground">
            Nombre de fichiers a traduire simultanement (1-10)
          </p>
        </div>

        <div class="space-y-2">
          <Label for="default-batch">Nombre de lots par defaut</Label>
          <Input
            id="default-batch"
            type="number"
            min="1"
            max="20"
            value={settingsStore.settings.translationSettings.defaultBatchCount}
            oninput={(e) => settingsStore.setDefaultBatchCount(parseInt(e.currentTarget.value) || 1)}
          />
          <p class="text-xs text-muted-foreground">
            Nombre de parties pour diviser les fichiers (1 = pas de division)
          </p>
        </div>
      </Card.Content>
    </Card.Root>

    <!-- Appearance -->
    <Card.Root>
      <Card.Header>
        <div class="flex items-center gap-2">
          <Palette class="size-5 text-primary" />
          <Card.Title>Apparence</Card.Title>
        </div>
        <Card.Description>
          Choisir le theme de l'interface
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
          <Card.Title>A propos</Card.Title>
        </div>
      </Card.Header>
      <Card.Content class="space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-muted-foreground">Version</span>
          <span class="font-mono text-sm">1.0.0</span>
        </div>
        <Separator />
        <div class="text-sm text-muted-foreground">
          <p>RsExtractor est un outil pour extraire et fusionner des pistes multimedia (audio, video, sous-titres) depuis des fichiers MKV et autres conteneurs.</p>
          <p class="mt-2">Construit avec Tauri, Svelte, et FFmpeg.</p>
        </div>
      </Card.Content>
    </Card.Root>
  </div>
</div>
