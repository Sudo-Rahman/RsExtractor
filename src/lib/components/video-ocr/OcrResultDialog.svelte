<script lang="ts">
  import { Calendar, ChevronLeft, ChevronRight, Copy, Download, Check, Clock, Info } from '@lucide/svelte';
  import { save } from '@tauri-apps/plugin-dialog';
  import { invoke } from '@tauri-apps/api/core';
  import { toast } from 'svelte-sonner';

  import type { OcrOutputFormat, OcrVideoFile, OcrVersion } from '$lib/types/video-ocr';
  import { OCR_OUTPUT_FORMATS } from '$lib/types/video-ocr';
  import { normalizeOcrSubtitles, toRustOcrSubtitles } from '$lib/utils/ocr-subtitle-adapter';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Badge } from '$lib/components/ui/badge';
  import * as Select from '$lib/components/ui/select';
  import { Separator } from '$lib/components/ui/separator';

  interface OcrResultDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    file: OcrVideoFile | null;
  }

  let {
    open = $bindable(false),
    onOpenChange,
    file,
  }: OcrResultDialogProps = $props();

  let currentVersionIndex = $state(0);
  let selectedFormat = $state<OcrOutputFormat>('srt');
  let copied = $state(false);

  $effect(() => {
    if (file && file.ocrVersions.length > 0) {
      currentVersionIndex = file.ocrVersions.length - 1;
    } else {
      currentVersionIndex = 0;
    }
  });

  const versions = $derived(file?.ocrVersions ?? []);
  const currentVersion = $derived(versions[currentVersionIndex] ?? null);
  const hasMultipleVersions = $derived(versions.length > 1);
  const normalizedSubtitles = $derived.by(() =>
    normalizeOcrSubtitles(currentVersion?.finalSubtitles ?? [])
  );
  const baseName = $derived((file?.name ?? 'video').replace(/\.[^/.]+$/, ''));

  function formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatSrtTime(ms: number): string {
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    const seconds = Math.floor((ms % 60_000) / 1000);
    const millis = ms % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
  }

  function formatVttTime(ms: number): string {
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    const seconds = Math.floor((ms % 60_000) / 1000);
    const millis = ms % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  }

  function buildFormattedPreview(format: OcrOutputFormat, version: OcrVersion): string {
    const subtitles = normalizeOcrSubtitles(version.finalSubtitles);
    if (subtitles.length === 0) {
      return '';
    }

    if (format === 'txt') {
      return subtitles.map((sub) => sub.text).join('\n');
    }

    if (format === 'vtt') {
      const body = subtitles
        .map((sub) =>
          `${formatVttTime(sub.startTime)} --> ${formatVttTime(sub.endTime)}\n${sub.text}\n`
        )
        .join('\n');
      return `WEBVTT\n\n${body}`;
    }

    return subtitles
      .map((sub, i) =>
        `${i + 1}\n${formatSrtTime(sub.startTime)} --> ${formatSrtTime(sub.endTime)}\n${sub.text}\n`
      )
      .join('\n');
  }

  const previewText = $derived(currentVersion ? buildFormattedPreview(selectedFormat, currentVersion) : '');

  function sanitizeVersionName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .trim();
  }

  function getModeLabel(mode: OcrVersion['mode']): string {
    switch (mode) {
      case 'full_pipeline':
        return 'Full pipeline';
      case 'cleanup_only':
        return 'Cleanup only';
      case 'cleanup_and_ai':
        return 'Cleanup + AI';
      case 'ai_only':
        return 'AI only';
    }
  }

  function goToPreviousVersion() {
    if (currentVersionIndex > 0) {
      currentVersionIndex -= 1;
    }
  }

  function goToNextVersion() {
    if (currentVersionIndex < versions.length - 1) {
      currentVersionIndex += 1;
    }
  }

  async function handleCopy() {
    if (!previewText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(previewText);
      copied = true;
      toast.success('Copied to clipboard');
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      toast.error('Copy failed');
    }
  }

  async function handleExport() {
    if (!file || !currentVersion) {
      return;
    }

    const versionSuffix = sanitizeVersionName(currentVersion.name);
    const outputPath = await save({
      title: 'Export subtitles',
      defaultPath: `${baseName}_${versionSuffix}.${selectedFormat}`,
      filters: [{
        name: OCR_OUTPUT_FORMATS.find((f) => f.value === selectedFormat)?.label ?? 'Subtitle file',
        extensions: [selectedFormat],
      }],
    });

    if (!outputPath) {
      return;
    }

    try {
      await invoke('export_ocr_subtitles', {
        subtitles: toRustOcrSubtitles(normalizedSubtitles),
        outputPath,
        format: selectedFormat,
      });
      toast.success(`Exported ${outputPath.split('/').pop()}`);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(error instanceof Error ? error.message : 'Export failed');
    }
  }
</script>

<Dialog.Root bind:open onOpenChange={onOpenChange}>
  <Dialog.Content class="max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
    <Dialog.Header>
      <Dialog.Title>OCR Results</Dialog.Title>
      <Dialog.Description>{file?.name ?? 'Unknown video'}</Dialog.Description>
    </Dialog.Header>

    {#if currentVersion}
      {#if hasMultipleVersions}
        <div class="flex items-center justify-between py-2">
          <Button
            variant="ghost"
            size="icon"
            disabled={currentVersionIndex === 0}
            onclick={goToPreviousVersion}
          >
            <ChevronLeft class="size-4" />
          </Button>

          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">{currentVersion.name}</span>
            <Badge variant="secondary" class="text-xs">
              {currentVersionIndex + 1} / {versions.length}
            </Badge>
          </div>

          <Button
            variant="ghost"
            size="icon"
            disabled={currentVersionIndex === versions.length - 1}
            onclick={goToNextVersion}
          >
            <ChevronRight class="size-4" />
          </Button>
        </div>
      {:else}
        <div class="py-2">
          <span class="text-sm font-medium">{currentVersion.name}</span>
        </div>
      {/if}

      <div class="flex items-center gap-4 text-xs text-muted-foreground pb-2 flex-wrap">
        <span class="flex items-center gap-1">
          <Calendar class="size-3" />
          {formatDate(currentVersion.createdAt)}
        </span>
        <span class="flex items-center gap-1">
          <Info class="size-3" />
          {getModeLabel(currentVersion.mode)}
        </span>
        <span class="flex items-center gap-1">
          <Clock class="size-3" />
          {normalizedSubtitles.length} subtitle{normalizedSubtitles.length > 1 ? 's' : ''}
        </span>
        <Badge variant="outline" class="text-[10px]">
          {currentVersion.configSnapshot.language}
        </Badge>
        <Badge variant="outline" class="text-[10px]">
          {currentVersion.configSnapshot.frameRate} fps
        </Badge>
      </div>

      <Separator />

      <div class="flex items-center gap-4 py-3">
        <span class="text-sm text-muted-foreground">Format:</span>
        <Select.Root
          type="single"
          value={selectedFormat}
          onValueChange={(v) => v && (selectedFormat = v as OcrOutputFormat)}
        >
          <Select.Trigger class="w-36">
            <span>{selectedFormat.toUpperCase()}</span>
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="srt" label="SRT">SRT</Select.Item>
            <Select.Item value="vtt" label="VTT">VTT</Select.Item>
            <Select.Item value="txt" label="TXT">TXT</Select.Item>
          </Select.Content>
        </Select.Root>
      </div>

      <div class="flex-1">
        <ScrollArea class="overflow-scroll h-[calc(50vh-200px)] rounded-md border bg-muted/30">
          {#if previewText}
            <pre class="p-4 text-xs whitespace-pre-wrap leading-relaxed font-mono">{previewText}</pre>
          {:else}
            <p class="p-6 text-sm text-muted-foreground text-center">No subtitles in this version</p>
          {/if}
        </ScrollArea>
      </div>
    {:else}
      <div class="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <p>No OCR version available</p>
      </div>
    {/if}

    <Dialog.Footer class="flex items-center justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        onclick={handleCopy}
        disabled={!currentVersion}
      >
        {#if copied}
          <Check class="size-4 mr-2" />
          Copied
        {:else}
          <Copy class="size-4 mr-2" />
          Copy
        {/if}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onclick={handleExport}
        disabled={!currentVersion}
      >
        <Download class="size-4 mr-2" />
        Export
      </Button>
      <Button variant="default" size="sm" onclick={() => onOpenChange(false)}>
        Close
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
