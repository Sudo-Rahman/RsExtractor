<script lang="ts">
  import { Loader2, Sparkles, Wand2 } from '@lucide/svelte';

  import { LlmProviderModelSelector } from '$lib/components/llm';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import type { TranscodeAiIntent, TranscodeAiSizePreference, TranscodeFile, LLMProvider } from '$lib/types';

  const INTENT_OPTIONS: Array<{ value: TranscodeAiIntent; label: string }> = [
    { value: 'speed', label: 'Speed' },
    { value: 'quality', label: 'Quality' },
    { value: 'archive', label: 'Archive' },
  ];

  const SIZE_OPTIONS: Array<{ value: TranscodeAiSizePreference; label: string }> = [
    { value: 'minimum', label: 'Min size' },
    { value: 'balanced', label: 'Balanced' },
    { value: 'no_compromise', label: 'No compromise' },
  ];

  interface Props {
    selectedFile: TranscodeFile;
    provider: LLMProvider;
    model: string;
    intent: TranscodeAiIntent;
    sizePreference: TranscodeAiSizePreference;
    userPrompt: string;
    isAnalyzing: boolean;
    onAnalyzeSelected?: () => void | Promise<void>;
    onAnalyzeAll?: () => void | Promise<void>;
    onProviderChange?: (provider: LLMProvider) => void;
    onModelChange?: (model: string) => void;
    onIntentChange?: (intent: TranscodeAiIntent) => void;
    onSizePreferenceChange?: (sizePreference: TranscodeAiSizePreference) => void;
    onUserPromptChange?: (value: string) => void;
    onNavigateToSettings?: () => void;
  }

  let {
    selectedFile,
    provider,
    model,
    intent,
    sizePreference,
    userPrompt,
    isAnalyzing,
    onAnalyzeSelected,
    onAnalyzeAll,
    onProviderChange,
    onModelChange,
    onIntentChange,
    onSizePreferenceChange,
    onUserPromptChange,
    onNavigateToSettings,
  }: Props = $props();

  function handleAnalyzeSelected(): void {
    void onAnalyzeSelected?.();
  }

  function handleAnalyzeAll(): void {
    void onAnalyzeAll?.();
  }

  function formatVideoSummary(file: TranscodeFile): string {
    return file.profile.video.mode === 'transcode' && file.profile.video.encoderId
      ? `${file.profile.video.mode} · ${file.profile.video.encoderId}`
      : file.profile.video.mode;
  }

  function formatAudioSummary(file: TranscodeFile): string {
    return file.profile.audio.mode === 'transcode' && file.profile.audio.encoderId
      ? `${file.profile.audio.mode} · ${file.profile.audio.encoderId}`
      : file.profile.audio.mode;
  }

  function formatSubtitleSummary(file: TranscodeFile): string {
    return file.profile.subtitles.mode === 'convert_text' && file.profile.subtitles.encoderId
      ? `${file.profile.subtitles.mode} · ${file.profile.subtitles.encoderId}`
      : file.profile.subtitles.mode;
  }

  function countAiAdditionalOverrides(file: TranscodeFile): number {
    return [
      ...file.profile.video.additionalArgs,
      ...file.profile.audio.additionalArgs,
      ...file.profile.subtitles.additionalArgs,
      ...file.profile.audio.trackOverrides.flatMap((trackOverride) => trackOverride.additionalArgs ?? []),
    ].filter((arg) => arg.source === 'ai').length;
  }

  function countAiAudioTrackOverrides(file: TranscodeFile): number {
    return file.profile.audio.trackOverrides.filter((trackOverride) => trackOverride.source === 'ai').length;
  }

  function formatAiGeneratedSummary(file: TranscodeFile): string {
    const flagCount = countAiAdditionalOverrides(file);
    const trackOverrideCount = countAiAudioTrackOverrides(file);
    const parts = [];

    if (flagCount > 0) {
      parts.push(`${flagCount} override flag${flagCount === 1 ? '' : 's'}`);
    }
    if (trackOverrideCount > 0) {
      parts.push(`${trackOverrideCount} audio track override${trackOverrideCount === 1 ? '' : 's'}`);
    }

    return parts.length > 0 ? parts.join(' · ') : 'No AI-generated overrides';
  }

  function formatSizePreference(sizePreference?: TranscodeAiSizePreference): string {
    return SIZE_OPTIONS.find((option) => option.value === sizePreference)?.label ?? 'Balanced';
  }
</script>

<Card.Root>
  <Card.Header class="pb-3">
    <Card.Title>AI Assist</Card.Title>
    <Card.Description>
      Let AI recommend the best transcode settings for each file.
    </Card.Description>
  </Card.Header>
  <Card.Content class="space-y-4">
    <LlmProviderModelSelector
      provider={provider}
      model={model}
      onProviderChange={onProviderChange ?? (() => undefined)}
      onModelChange={onModelChange ?? (() => undefined)}
      onNavigateToSettings={onNavigateToSettings}
    />

    <div class="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div class="space-y-2">
        <Label class="text-sm font-medium">Optimization target</Label>
        <div class="flex flex-wrap gap-2">
          {#each INTENT_OPTIONS as option (option.value)}
            <Button
              variant={intent === option.value ? 'default' : 'outline'}
              size="sm"
              onclick={() => onIntentChange?.(option.value)}
            >
              {option.label}
            </Button>
          {/each}
        </div>
      </div>

      <div class="space-y-2">
        <Label class="text-sm font-medium">Size preference</Label>
        <div class="flex flex-nowrap gap-2">
          {#each SIZE_OPTIONS as option (option.value)}
            <Button
              variant={sizePreference === option.value ? 'default' : 'outline'}
              size="sm"
              class="shrink-0 px-3"
              onclick={() => onSizePreferenceChange?.(option.value)}
            >
              <span class="whitespace-nowrap">{option.label}</span>
            </Button>
          {/each}
        </div>
      </div>
    </div>

    <div class="space-y-2">
      <Label class="text-sm font-medium" for="transcode-ai-user-prompt">Optional instruction</Label>
      <Textarea
        id="transcode-ai-user-prompt"
        value={userPrompt}
        class="min-h-24 text-sm"
        placeholder="Example: Keep all original audio tracks and make the video as small as practical."
        oninput={(event) => onUserPromptChange?.(event.currentTarget.value)}
      />
      <p class="text-xs text-muted-foreground">
        Use this to steer codec or quality choices. Requests unrelated to transcoding will be rejected.
      </p>
    </div>

    <div class="flex flex-wrap gap-2">
      <Button onclick={handleAnalyzeSelected} disabled={isAnalyzing || selectedFile.status !== 'ready'}>
        {#if isAnalyzing}
          <Loader2 class="size-4 mr-2 animate-spin" />
        {:else}
          <Wand2 class="size-4 mr-2" />
        {/if}
        Analyze Selected File
      </Button>
      <Button variant="outline" onclick={handleAnalyzeAll} disabled={isAnalyzing}>
        {#if isAnalyzing}
          <Loader2 class="size-4 mr-2 animate-spin" />
        {:else}
          <Sparkles class="size-4 mr-2" />
        {/if}
        Analyze All Ready Files
      </Button>
    </div>

    {#if selectedFile.aiStatus === 'error' && selectedFile.aiError}
      <div class="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
        <p class="font-medium text-destructive">AI request rejected</p>
        <p class="text-sm text-muted-foreground">{selectedFile.aiError}</p>
      </div>
    {:else if selectedFile.aiRecommendation}
      <div class="rounded-lg border bg-muted/30 p-4 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="font-medium">Latest AI recommendation</p>
            <p class="text-xs text-muted-foreground">
              {selectedFile.aiRecommendation.provider} · {selectedFile.aiRecommendation.model}
            </p>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <Badge>{selectedFile.aiRecommendation.intent}</Badge>
            <Badge variant="outline">
              {formatSizePreference(selectedFile.aiRecommendation.sizePreference)}
            </Badge>
          </div>
        </div>
        <Textarea value={selectedFile.aiRecommendation.rationale} readonly class="min-h-24 text-sm" />
        <div class="rounded-md border bg-background p-3 text-sm space-y-1">
          <p><span class="font-medium">Container:</span> {selectedFile.profile.containerId.toUpperCase()}</p>
          <p><span class="font-medium">Video:</span> {formatVideoSummary(selectedFile)}</p>
          <p><span class="font-medium">Audio:</span> {formatAudioSummary(selectedFile)}</p>
          <p><span class="font-medium">Subtitles:</span> {formatSubtitleSummary(selectedFile)}</p>
          <p><span class="font-medium">AI overrides:</span> {formatAiGeneratedSummary(selectedFile)}</p>
        </div>
        {#if selectedFile.aiRecommendation.warnings?.length}
          <div class="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm space-y-1">
            <p class="font-medium">AI warnings</p>
            {#each selectedFile.aiRecommendation.warnings as warning, index (index)}
              <p class="text-muted-foreground">{warning}</p>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <div class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        AI recommendations will appear here and automatically fill the advanced settings below.
      </div>
    {/if}
  </Card.Content>
</Card.Root>
