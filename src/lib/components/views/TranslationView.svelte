<script lang="ts" module>
  export interface TranslationViewApi {
    handleFileDrop: (paths: string[]) => Promise<void>;
  }
</script>

<script lang="ts">
  import { open, save } from '@tauri-apps/plugin-dialog';
  import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
  import { toast } from 'svelte-sonner';

  import { translationStore, settingsStore } from '$lib/stores';
  import { translateSubtitle, detectSubtitleFormat, getSubtitleExtension } from '$lib/services/translation';
  import type { SubtitleFile } from '$lib/types';

  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';

  import { SubtitleDropZone, TranslationConfigPanel, TranslationResultPanel } from '$lib/components/translation';

  import Upload from 'lucide-svelte/icons/upload';
  import Play from 'lucide-svelte/icons/play';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import FileText from 'lucide-svelte/icons/file-text';
  import Languages from 'lucide-svelte/icons/languages';

  interface TranslationViewProps {
    onNavigateToSettings?: () => void;
  }

  let { onNavigateToSettings }: TranslationViewProps = $props();

  // Expose API for drag & drop from parent
  export async function handleFileDrop(paths: string[]) {
    const subtitleExtensions = ['.srt', '.ass', '.vtt'];
    const subtitlePaths = paths.filter(p =>
      subtitleExtensions.some(ext => p.toLowerCase().endsWith(ext))
    );

    if (subtitlePaths.length === 0) {
      toast.warning('No valid subtitle files detected');
      return;
    }

    // Only take the first file
    await loadSubtitleFile(subtitlePaths[0]);
  }

  async function loadSubtitleFile(path: string) {
    try {
      const content = await readTextFile(path);
      const format = detectSubtitleFormat(content);

      if (!format) {
        toast.error('Could not detect subtitle format');
        return;
      }

      const name = path.split('/').pop() || path.split('\\').pop() || path;

      const subtitleFile: SubtitleFile = {
        path,
        name,
        format,
        content,
        size: new Blob([content]).size
      };

      translationStore.setSubtitleFile(subtitleFile);
      toast.success(`Loaded: ${name}`);
    } catch (error) {
      console.error('Error loading subtitle file:', error);
      toast.error('Failed to load subtitle file');
    }
  }

  async function handleImportClick() {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Subtitle files',
          extensions: ['srt', 'ass', 'vtt']
        }]
      });

      if (selected && typeof selected === 'string') {
        await loadSubtitleFile(selected);
      }
    } catch (error) {
      console.error('Error opening file dialog:', error);
      toast.error('Error opening file dialog');
    }
  }

  async function handleTranslate() {
    const file = translationStore.subtitleFile;
    if (!file) {
      toast.error('No subtitle file loaded');
      return;
    }

    const { provider, model, sourceLanguage, targetLanguage } = translationStore.config;

    // Validate API key
    const apiKey = settingsStore.getLLMApiKey(provider);
    if (!apiKey) {
      toast.error(`No API key configured for ${provider}`);
      return;
    }

    if (!model) {
      toast.error('Please select a model');
      return;
    }

    translationStore.updateProgress({
      status: 'translating',
      currentFile: file.name,
      progress: 0
    });

    try {
      const result = await translateSubtitle(
        file,
        provider,
        model,
        sourceLanguage,
        targetLanguage,
        (progress) => {
          translationStore.updateProgress({ progress });
        }
      );

      translationStore.setResult(result);
      translationStore.updateProgress({
        status: result.success ? 'completed' : 'error',
        progress: 100
      });

      if (result.success) {
        toast.success('Translation completed');
      } else {
        toast.error(result.error || 'Translation failed');
      }
    } catch (error) {
      console.error('Translation error:', error);
      translationStore.updateProgress({
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
      toast.error('Translation failed');
    }
  }

  async function handleSaveResult() {
    const translationResult = translationStore.result;
    const file = translationStore.subtitleFile;

    if (!translationResult?.translatedContent || !file) return;

    try {
      const extension = getSubtitleExtension(file.format);
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      const targetLang = translationStore.config.targetLanguage;
      const defaultFileName = `${baseName}.${targetLang}${extension}`;

      const savePath = await save({
        defaultPath: defaultFileName,
        filters: [{
          name: 'Subtitle files',
          extensions: [extension.replace('.', '')]
        }]
      });

      if (savePath) {
        await writeTextFile(savePath, translationResult.translatedContent);
        toast.success('File saved successfully');
      }
    } catch (error) {
      console.error('Error saving file:', error);
      toast.error('Failed to save file');
    }
  }

  function handleClearFile() {
    translationStore.reset();
  }

  const hasFile = $derived(translationStore.hasFile);
  const isTranslating = $derived(translationStore.isTranslating);
  const canTranslate = $derived(
    hasFile &&
    translationStore.config.model &&
    settingsStore.getLLMApiKey(translationStore.config.provider)
  );

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<div class="flex h-full">
  <!-- Left Panel: File Import & Config -->
  <div class="w-1/2 border-r flex flex-col min-h-0 p-4 gap-4 overflow-auto">
    <!-- File Section -->
    <Card.Root>
      <Card.Header class="pb-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <FileText class="size-5 text-primary" />
            <Card.Title>Subtitle File</Card.Title>
          </div>
          <Button variant="outline" size="sm" onclick={handleImportClick} disabled={isTranslating}>
            <Upload class="size-4 mr-2" />
            Import
          </Button>
        </div>
      </Card.Header>
      <Card.Content>
        {#if hasFile}
          <div class="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div class="flex items-center gap-3 min-w-0">
              <FileText class="size-5 text-muted-foreground shrink-0" />
              <div class="min-w-0">
                <p class="font-medium truncate">{translationStore.subtitleFile?.name}</p>
                <div class="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline" class="text-xs uppercase">
                    {translationStore.subtitleFile?.format}
                  </Badge>
                  <span>{formatFileSize(translationStore.subtitleFile?.size || 0)}</span>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onclick={handleClearFile} disabled={isTranslating}>
              <Trash2 class="size-4" />
            </Button>
          </div>
        {:else}
          <SubtitleDropZone />
        {/if}
      </Card.Content>
    </Card.Root>

    <!-- Config Panel -->
    <TranslationConfigPanel onNavigateToSettings={onNavigateToSettings} />

    <!-- Translate Button -->
    <Button
      size="lg"
      class="w-full"
      onclick={handleTranslate}
      disabled={!canTranslate || isTranslating}
    >
      {#if isTranslating}
        <Languages class="size-4 mr-2 animate-pulse" />
        Translating...
      {:else}
        <Play class="size-4 mr-2" />
        Translate
      {/if}
    </Button>
  </div>

  <!-- Right Panel: Results -->
  <div class="w-1/2 flex flex-col min-h-0 p-4">
    <TranslationResultPanel onSave={handleSaveResult} />
  </div>
</div>
