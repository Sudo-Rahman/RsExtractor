<script lang="ts">
  import { AlertCircle, Check, ChevronDown, Copy, FileText, Info, Languages, Loader2, RotateCw, X } from '@lucide/svelte';

  import { Textarea } from '$lib/components/ui/textarea';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as HoverCard from '$lib/components/ui/hover-card';
  import * as Item from '$lib/components/ui/item';
  import * as Popover from '$lib/components/ui/popover';
  import { Progress } from '$lib/components/ui/progress';
  import * as Resizable from '$lib/components/ui/resizable';
  import type { TranslationJob, TranslationVersion } from '$lib/types';

  interface TranslationWorkspaceProps {
    selectedJob: TranslationJob | null;
    selectedJobVersions: TranslationVersion[];
    activeVersionId: string | null;
    activeVersion: TranslationVersion | null;
    displayedContent: string;
    tokenCount: number | null;
    isCountingTokens: boolean;
    isTranslating: boolean;
    onSelectVersion: (versionId: string) => void;
    onCopyContent: (content: string) => void | Promise<void>;
    onEditContent: (content: string) => void;
    onRetryWithMoreBatches: (job: TranslationJob) => void | Promise<void>;
  }

  let {
    selectedJob,
    selectedJobVersions,
    activeVersionId,
    activeVersion,
    displayedContent,
    tokenCount,
    isCountingTokens,
    isTranslating,
    onSelectVersion,
    onCopyContent,
    onEditContent,
    onRetryWithMoreBatches,
  }: TranslationWorkspaceProps = $props();

  let versionPopoverOpen = $state(false);

  const originalLineCount = $derived(selectedJob ? selectedJob.file.content.split('\n').length : 0);
  const translatedLineCount = $derived(displayedContent ? displayedContent.split('\n').length : 0);
  const activeUsage = $derived(activeVersion?.usage ?? (activeVersion ? undefined : selectedJob?.result?.usage));
  const hasTranslationMetrics = $derived(Boolean(displayedContent || activeUsage));

  function getStatusBadgeVariant(status: TranslationJob['status']): 'default' | 'destructive' | 'secondary' {
    if (status === 'completed') {
      return 'default';
    }
    if (status === 'error') {
      return 'destructive';
    }
    return 'secondary';
  }

  function handleContentInput(event: Event): void {
    onEditContent((event.currentTarget as HTMLTextAreaElement).value);
  }

  function handleSelectVersion(versionId: string): void {
    onSelectVersion(versionId);
    versionPopoverOpen = false;
  }

  function formatVersionMeta(version: TranslationVersion): string {
    const createdAt = new Date(version.createdAt);
    const createdAtLabel = Number.isNaN(createdAt.getTime())
      ? 'Unknown date'
      : createdAt.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

    return `${version.provider} · ${version.model} · ${createdAtLabel}`;
  }
</script>

<div class="flex-2 flex flex-col min-h-0 overflow-scroll">
  {#if selectedJob}
    <div class="p-4 border-b flex items-center justify-between">
      <div class="flex items-center gap-2 min-w-0">
        <FileText class="size-5 text-primary shrink-0" />
        <h3 class="font-medium truncate">{selectedJob.file.name}</h3>
        <Badge variant={getStatusBadgeVariant(selectedJob.status)}>
          {selectedJob.status}
        </Badge>
      </div>

      {#if displayedContent}
        <div class="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="icon-sm"
            onclick={() => onCopyContent(displayedContent)}
            title="Copy translation"
            aria-label="Copy translation"
          >
            <Copy class="size-4" />
          </Button>
        </div>
      {/if}
    </div>

    <Resizable.PaneGroup direction="horizontal" class="flex-1 min-h-0">
      <Resizable.Pane defaultSize={50} minSize={20}>
        <div class="h-full flex flex-col">
          <div class="h-10 px-2 bg-muted/30 border-b flex items-center justify-between">
            <span class="text-sm font-medium">Original</span>
            <span class="text-xs text-muted-foreground">
              {originalLineCount} lines
              {#if tokenCount !== null}
                · ~{tokenCount.toLocaleString()} tokens
              {:else if isCountingTokens}
                · <Loader2 class="size-3 animate-spin inline" />
              {/if}
            </span>
          </div>
          <div class="flex-1 overflow-y-scroll">
            <pre class="p-4 text-sm whitespace-pre-wrap font-mono">{selectedJob.file.content}</pre>
          </div>
        </div>
      </Resizable.Pane>

      <Resizable.Handle withHandle />

      <Resizable.Pane defaultSize={50} minSize={20}>
        <div class="h-full flex flex-col">
          <div class="@container h-10 px-2 bg-muted/30 border-b flex items-center justify-between gap-2 overflow-hidden">
            <div class="text-sm font-medium min-w-0 flex items-center gap-1.5 whitespace-nowrap">
              <span class="shrink-0">Translation</span>
              {#if activeVersion && selectedJobVersions.length > 1}
                <Popover.Root bind:open={versionPopoverOpen}>
                  <Popover.Trigger>
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        variant="ghost"
                        size="xs"
                        class="mr-2 h-6 min-w-0 max-w-44 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
                        aria-label="Select translation version"
                        aria-expanded={versionPopoverOpen}
                      >
                        <span class="truncate">{activeVersion.name}</span>
                        <ChevronDown class="size-3" />
                      </Button>
                    {/snippet}
                  </Popover.Trigger>
                  <Popover.Content align="end" class="w-80 max-w-[calc(100vw-2rem)] rounded-2xl p-2">
                    <div class="px-2 py-1.5">
                      <p class="text-xs font-medium text-muted-foreground">Translation version</p>
                    </div>
                    <div class="max-h-72 overflow-y-auto">
                      {#each selectedJobVersions as version (version.id)}
                        <Item.Root
                          size="xs"
                          class="cursor-pointer flex-nowrap hover:bg-muted"
                          aria-current={version.id === activeVersionId ? 'true' : undefined}
                          onclick={() => handleSelectVersion(version.id)}
                        >
                          {#snippet child({ props })}
                            <button type="button" {...props}>
                              <Item.Content class="min-w-0 overflow-hidden">
                                <Item.Title class="w-full truncate">{version.name}</Item.Title>
                                <Item.Description class="block w-full truncate text-xs">
                                  {formatVersionMeta(version)}
                                </Item.Description>
                              </Item.Content>
                              <Item.Actions class="shrink-0">
                                {#if version.id === activeVersionId}
                                  <Check class="size-4 shrink-0 text-primary" />
                                {/if}
                              </Item.Actions>
                            </button>
                          {/snippet}
                        </Item.Root>
                      {/each}
                    </div>
                  </Popover.Content>
                </Popover.Root>
              {:else if activeVersion}
                <span class="truncate text-xs text-muted-foreground">({activeVersion.name})</span>
              {/if}
            </div>
            {#if hasTranslationMetrics}
              <HoverCard.Root openDelay={200}>
                <span class="@max-[24rem]:hidden min-w-0 truncate whitespace-nowrap text-right text-xs text-muted-foreground">
                  {#if displayedContent}
                    {translatedLineCount} lines
                  {/if}
                  {#if activeUsage}
                    · {activeUsage.totalTokens.toLocaleString()} tokens
                  {/if}
                </span>
                <HoverCard.Trigger>
                  {#snippet child({ props })}
                    <Button
                      {...props}
                      variant="ghost"
                      size="icon-xs"
                      class="hidden text-muted-foreground hover:text-foreground @max-[24rem]:inline-flex"
                      aria-label="Show translation metrics"
                    >
                      <Info class="size-3.5" />
                    </Button>
                  {/snippet}
                </HoverCard.Trigger>
                <HoverCard.Content align="end" class="w-56 rounded-2xl p-3">
                  <div class="space-y-2">
                    <p class="text-xs font-medium text-muted-foreground">Translation metrics</p>
                    <div class="space-y-1 text-xs">
                      {#if displayedContent}
                        <div class="flex items-center justify-between gap-4">
                          <span class="text-muted-foreground">Lines</span>
                          <span class="font-medium">{translatedLineCount.toLocaleString()}</span>
                        </div>
                      {/if}
                      {#if activeUsage}
                        <div class="flex items-center justify-between gap-4">
                          <span class="text-muted-foreground">Tokens</span>
                          <span class="font-medium">{activeUsage.totalTokens.toLocaleString()}</span>
                        </div>
                        <div class="flex items-center justify-between gap-4">
                          <span class="text-muted-foreground">Input</span>
                          <span>{activeUsage.promptTokens.toLocaleString()}</span>
                        </div>
                        <div class="flex items-center justify-between gap-4">
                          <span class="text-muted-foreground">Output</span>
                          <span>{activeUsage.completionTokens.toLocaleString()}</span>
                        </div>
                      {/if}
                    </div>
                  </div>
                </HoverCard.Content>
              </HoverCard.Root>
            {/if}
          </div>

          <div class="flex-1 overflow-y-scroll">
            {#if selectedJob.status === 'translating'}
              <div class="flex flex-col items-center justify-center h-full p-8 gap-4">
                <Loader2 class="size-8 text-primary animate-spin" />
                <div class="text-center">
                  <p class="font-medium">Translating...</p>
                  <p class="text-sm text-muted-foreground">
                    {selectedJob.progress}%
                    {#if selectedJob.totalBatches > 1}
                      - Batch {selectedJob.currentBatch}/{selectedJob.totalBatches}
                    {/if}
                  </p>
                </div>
                <Progress value={selectedJob.progress} class="w-48" />
              </div>
            {:else if displayedContent}
              <Textarea
                class="w-full h-full p-4 resize-none font-mono text-sm border-0 focus-visible:ring-0 rounded-none bg-transparent"
                value={displayedContent}
                oninput={handleContentInput}
              />
            {:else if selectedJob.status === 'error'}
              <div class="flex flex-col items-center justify-center h-full p-8 gap-4">
                <AlertCircle class="size-8 text-destructive" />
                <div class="text-center">
                  <p class="font-medium text-destructive">Translation failed</p>
                  <p class="text-sm text-muted-foreground mt-2">{selectedJob.error}</p>
                </div>
                {#if selectedJob.result?.truncated}
                  <div class="flex flex-col items-center gap-2 mt-2">
                    <p class="text-xs text-muted-foreground">Response was truncated due to token limits</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onclick={() => onRetryWithMoreBatches(selectedJob)}
                      disabled={isTranslating}
                    >
                      <RotateCw class="size-4 mr-2" />
                      Retry with more batches
                    </Button>
                  </div>
                {/if}
              </div>
            {:else if selectedJob.status === 'cancelled'}
              <div class="flex flex-col items-center justify-center h-full p-8 gap-4">
                <X class="size-8 text-orange-500" />
                <p class="font-medium text-orange-500">Translation cancelled</p>
              </div>
            {:else}
              <div class="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
                <Languages class="size-8 mb-4" />
                <p>Click "Translate" to start</p>
              </div>
            {/if}
          </div>
        </div>
      </Resizable.Pane>
    </Resizable.PaneGroup>
  {:else}
    <div class="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground p-8">
      <Languages class="size-12 mb-4" />
      <p class="text-lg font-medium">No file selected</p>
      <p class="text-sm">Import subtitle files to get started</p>
    </div>
  {/if}
</div>
