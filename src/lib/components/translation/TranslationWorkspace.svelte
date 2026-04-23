<script lang="ts">
  import { AlertCircle, Copy, FileText, Languages, Loader2, RotateCw, X } from '@lucide/svelte';

  import { Textarea } from '$lib/components/ui/textarea';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Progress } from '$lib/components/ui/progress';
  import * as Resizable from '$lib/components/ui/resizable';
  import * as Select from '$lib/components/ui/select';
  import * as Tooltip from '$lib/components/ui/tooltip/index.js';
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

  const originalLineCount = $derived(selectedJob ? selectedJob.file.content.split('\n').length : 0);
  const translatedLineCount = $derived(displayedContent ? displayedContent.split('\n').length : 0);
  const activeUsage = $derived(activeVersion?.usage ?? (activeVersion ? undefined : selectedJob?.result?.usage));

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

        {#if selectedJobVersions.length > 1}
          <Select.Root
            type="single"
            value={activeVersionId ?? undefined}
            onValueChange={onSelectVersion}
          >
            <Select.Trigger class="h-7 text-xs w-auto min-w-[120px]">
              {activeVersion?.name ?? 'Select version'}
            </Select.Trigger>
            <Select.Content>
              <Select.Group>
                {#each selectedJobVersions as version (version.id)}
                  <Select.Item value={version.id}>{version.name}</Select.Item>
                {/each}
              </Select.Group>
            </Select.Content>
          </Select.Root>
        {/if}
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
          <div class="p-2 bg-muted/30 border-b flex items-center justify-between">
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
          <div class="p-2 bg-muted/30 border-b flex items-center justify-between">
            <span class="text-sm font-medium">
              Translation
              {#if activeVersion}
                <span class="text-xs text-muted-foreground ml-1">({activeVersion.name})</span>
              {/if}
            </span>
            <span class="text-xs text-muted-foreground">
              {#if displayedContent}
                {translatedLineCount} lines
              {/if}
              {#if activeUsage}
                <Tooltip.Root>
                  <Tooltip.Trigger>· {activeUsage.totalTokens.toLocaleString()} tokens</Tooltip.Trigger>
                  <Tooltip.Content>
                    <span>
                      {activeUsage.promptTokens.toLocaleString()} in / {activeUsage.completionTokens.toLocaleString()} out
                    </span>
                  </Tooltip.Content>
                </Tooltip.Root>
              {/if}
            </span>
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
