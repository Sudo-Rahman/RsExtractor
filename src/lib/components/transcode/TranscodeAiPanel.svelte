<script lang="ts">
  import { Loader2, Sparkles, Wand2 } from '@lucide/svelte';

  import { LlmProviderModelSelector } from '$lib/components/llm';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import type { TranscodeAiIntent, TranscodeFile, LLMProvider } from '$lib/types';

  interface Props {
    selectedFile: TranscodeFile;
    provider: LLMProvider;
    model: string;
    intent: TranscodeAiIntent;
    userPrompt: string;
    isAnalyzing: boolean;
    onAnalyzeSelected?: () => void | Promise<void>;
    onAnalyzeAll?: () => void | Promise<void>;
    onProviderChange?: (provider: LLMProvider) => void;
    onModelChange?: (model: string) => void;
    onIntentChange?: (intent: TranscodeAiIntent) => void;
    onUserPromptChange?: (value: string) => void;
    onNavigateToSettings?: () => void;
  }

  let {
    selectedFile,
    provider,
    model,
    intent,
    userPrompt,
    isAnalyzing,
    onAnalyzeSelected,
    onAnalyzeAll,
    onProviderChange,
    onModelChange,
    onIntentChange,
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

    <div class="space-y-2">
      <Label class="text-sm font-medium">Intent</Label>
      <div class="flex flex-wrap gap-2">
        <Button
          variant={intent === 'speed' ? 'default' : 'outline'}
          size="sm"
          onclick={() => onIntentChange?.('speed')}
        >
          Speed
        </Button>
        <Button
          variant={intent === 'quality' ? 'default' : 'outline'}
          size="sm"
          onclick={() => onIntentChange?.('quality')}
        >
          Quality
        </Button>
        <Button
          variant={intent === 'archive' ? 'default' : 'outline'}
          size="sm"
          onclick={() => onIntentChange?.('archive')}
        >
          Archive
        </Button>
      </div>
    </div>

    <div class="space-y-2">
      <Label class="text-sm font-medium" for="transcode-ai-user-prompt">Optional instruction</Label>
      <Textarea
        id="transcode-ai-user-prompt"
        value={userPrompt}
        class="min-h-24 text-sm"
        placeholder="Example: Prefer AV1 if it is supported and still practical for this source."
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
          <Badge>{selectedFile.aiRecommendation.intent}</Badge>
        </div>
        <Textarea value={selectedFile.aiRecommendation.rationale} readonly class="min-h-24 text-sm" />
        <div class="rounded-md border bg-background p-3 text-sm space-y-1">
          <p><span class="font-medium">Container:</span> {selectedFile.profile.containerId.toUpperCase()}</p>
          <p><span class="font-medium">Video:</span> {formatVideoSummary(selectedFile)}</p>
          <p><span class="font-medium">Audio:</span> {formatAudioSummary(selectedFile)}</p>
          <p><span class="font-medium">Subtitles:</span> {formatSubtitleSummary(selectedFile)}</p>
        </div>
      </div>
    {:else}
      <div class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        AI recommendations will appear here and automatically fill the advanced settings below.
      </div>
    {/if}
  </Card.Content>
</Card.Root>
