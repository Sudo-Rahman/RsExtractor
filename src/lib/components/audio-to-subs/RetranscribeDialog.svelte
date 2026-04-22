<script lang="ts">
  import { AlertTriangle, Settings2, Users } from '@lucide/svelte';

  import type { AudioFile, DeepgramConfig } from '$lib/types';
  import { DEFAULT_DEEPGRAM_CONFIG } from '$lib/types';
  import { RetryVersionDialogShell } from '$lib/components/shared';
  import * as Alert from '$lib/components/ui/alert';

  import { Label } from '$lib/components/ui/label';
  import { Separator } from '$lib/components/ui/separator';
  import { Slider } from '$lib/components/ui/slider';
  import { Switch } from '$lib/components/ui/switch';

  import LanguageSelector from './LanguageSelector.svelte';
  import ModelSelector from './ModelSelector.svelte';

  interface RetranscribeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    file: AudioFile | null;
    baseConfig: DeepgramConfig;
    onConfirm: (fileId: string, versionName: string, config: DeepgramConfig) => Promise<string | null> | string | null;
  }

  let {
    open = $bindable(false),
    onOpenChange,
    file,
    baseConfig,
    onConfirm,
  }: RetranscribeDialogProps = $props();

  let versionName = $state('');
  let config = $state<DeepgramConfig>({ ...DEFAULT_DEEPGRAM_CONFIG });
  let validationMessage = $state('');

  $effect(() => {
    if (open && file) {
      const versionCount = file.transcriptionVersions?.length ?? 0;
      versionName = `Version ${versionCount + 1}`;
      config = { ...baseConfig };
      validationMessage = '';
    }
  });

  async function handleConfirm() {
    if (!file) {
      return;
    }

    const errorMessage = await onConfirm(file.id, versionName.trim() || 'New version', config);
    if (errorMessage) {
      validationMessage = errorMessage;
      return;
    }

    onOpenChange(false);
  }
</script>

<RetryVersionDialogShell
  bind:open
  {onOpenChange}
  title="New Transcription"
  description={`Create a new transcription version for ${file?.name ?? 'this file'}`}
  bind:versionName
  versionNamePlaceholder="Version 1"
  confirmLabel="Transcribe"
  maxWidthClass="max-w-lg"
  onConfirm={handleConfirm}
>
  {#snippet optionsContent()}
    {#if validationMessage}
      <Alert.Root class="border-amber-200/80 bg-amber-50/80 text-amber-950 shadow-none *:[svg]:text-amber-600">
        <AlertTriangle class="size-4" />
        <Alert.Title>Choose a source language to continue</Alert.Title>
        <Alert.Description>{validationMessage}</Alert.Description>
      </Alert.Root>
    {/if}

    <Separator />

    <ModelSelector
      value={config.model}
      onValueChange={(model) => config = { ...config, model }}
    />

    <LanguageSelector
      value={config.language}
      onValueChange={(language) => config = { ...config, language }}
    />

    <Separator />

    <div class="space-y-4">
      <h4 class="text-sm font-medium flex items-center gap-2">
        <Settings2 class="size-4" />
        Options
      </h4>

      <div class="flex items-center justify-between">
        <div class="space-y-0.5">
          <Label class="text-sm">Auto Punctuation</Label>
          <p class="text-xs text-muted-foreground">Add punctuation</p>
        </div>
        <Switch
          checked={config.punctuate}
          onCheckedChange={(checked) => config = { ...config, punctuate: checked }}
        />
      </div>

      <div class="flex items-center justify-between">
        <div class="space-y-0.5">
          <Label class="text-sm">Smart Format</Label>
          <p class="text-xs text-muted-foreground">Format numbers, dates, currencies</p>
        </div>
        <Switch
          checked={config.smartFormat}
          onCheckedChange={(checked) => config = { ...config, smartFormat: checked }}
        />
      </div>

      <div class="flex items-center justify-between">
        <div class="space-y-0.5">
          <Label class="text-sm">Paragraphs</Label>
          <p class="text-xs text-muted-foreground">Detect paragraphs</p>
        </div>
        <Switch
          checked={config.paragraphs}
          onCheckedChange={(checked) => config = { ...config, paragraphs: checked }}
        />
      </div>

      <Separator />

      <div class="flex items-center justify-between">
        <div class="space-y-0.5">
          <Label class="text-sm flex items-center gap-2">
            <Users class="size-4" />
            Diarization
          </Label>
          <p class="text-xs text-muted-foreground">Identify speakers</p>
        </div>
        <Switch
          checked={config.diarize}
          onCheckedChange={(checked) => config = { ...config, diarize: checked }}
        />
      </div>

      <Separator />

      <div class="space-y-3">
        <div class="space-y-0.5">
          <Label class="text-sm">Pause Threshold</Label>
          <p class="text-xs text-muted-foreground">
            Silence duration to split phrases ({config.uttSplit.toFixed(1)}s)
          </p>
        </div>
        <Slider
          type="multiple"
          value={[config.uttSplit]}
          onValueChange={(values: number[]) => config = { ...config, uttSplit: values[0] }}
          min={0.1}
          max={2.0}
          step={0.1}
        />
        <div class="flex justify-between text-xs text-muted-foreground">
          <span>0.1s</span>
          <span>2.0s</span>
        </div>
      </div>
    </div>
  {/snippet}
</RetryVersionDialogShell>
