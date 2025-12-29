<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { open } from '@tauri-apps/plugin-dialog';
  import { listen } from '@tauri-apps/api/event';
  import { toast } from 'svelte-sonner';

  import { fileListStore } from '$lib/stores/files.svelte';
  import { extractionStore } from '$lib/stores/extraction.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { scanFile } from '$lib/services/ffprobe';
  import { extractTrack, buildOutputPath } from '$lib/services/ffmpeg';
  import type { VideoFile, Track } from '$lib/types';

  import {
    Button,
    DropZone,
    FileList,
    TrackDetails,
    ExtractionPanel,
    BatchTrackSelector,
    ThemeToggle,
    Alert,
    AlertTitle,
    AlertDescription
  } from '$lib/components';
  import Upload from 'lucide-svelte/icons/upload';
  import AlertCircle from 'lucide-svelte/icons/alert-circle';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import {OS} from "$lib/utils";

  let ffmpegAvailable = $state<boolean | null>(null);
  let unlistenDragDrop: (() => void) | null = null;

  onMount(() => {
    // Initialize async tasks
    initApp();

    return () => {
      if (unlistenDragDrop) {
        unlistenDragDrop();
      }
    };
  });

  async function initApp() {
    // Check if FFmpeg is available
    try {
      ffmpegAvailable = await invoke<boolean>('check_ffmpeg');
      if (!ffmpegAvailable) {
        toast.error('FFmpeg non trouvé', {
          description: 'Veuillez installer FFmpeg pour utiliser cette application.'
        });
      }
    } catch (e) {
      ffmpegAvailable = false;
      console.error('Error checking FFmpeg:', e);
    }

    // Listen for drag & drop events from Tauri
    unlistenDragDrop = await listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
      await handleFileDrop(event.payload.paths);
    });
  }

  async function handleFileDrop(paths: string[]) {
    // Filter for video files
    const videoExtensions = ['.mkv', '.mp4', '.avi', '.mov', '.webm', '.m4v'];
    const videoPaths = paths.filter(p =>
      videoExtensions.some(ext => p.toLowerCase().endsWith(ext))
    );

    if (videoPaths.length === 0) {
      toast.warning('Aucun fichier vidéo valide détecté');
      return;
    }

    // If extraction is completed, clear everything and start fresh
    if (extractionStore.progress.status === 'completed') {
      fileListStore.clear();
      extractionStore.reset();
      extractionStore.clearAllTracks();
    }

    // Add files with pending status
    const pendingFiles: VideoFile[] = videoPaths.map(path => ({
      path,
      name: path.split('/').pop() || path.split('\\').pop() || path,
      size: 0,
      tracks: [],
      status: 'scanning' as const
    }));

    fileListStore.addFiles(pendingFiles);

    // Select first file if none selected
    if (!fileListStore.selectedFilePath && videoPaths.length > 0) {
      fileListStore.selectFile(videoPaths[0]);
    }

    // Scan each file
    for (const path of videoPaths) {
      try {
        const scannedFile = await scanFile(path);
        fileListStore.updateFile(path, scannedFile);
      } catch (error) {
        fileListStore.updateFile(path, {
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    toast.success(`${videoPaths.length} fichier(s) importé(s)`);
  }

  async function handleImportClick() {
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Fichiers vidéo',
          extensions: ['mkv', 'mp4', 'avi', 'mov', 'webm', 'm4v']
        }]
      });

      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        await handleFileDrop(paths);
      }
    } catch (error) {
      console.error('Error opening file dialog:', error);
      toast.error('Erreur lors de l\'ouverture du dialogue');
    }
  }

  async function handleSelectOutputDir() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Sélectionner le dossier de destination'
      });

      if (selected && typeof selected === 'string') {
        extractionStore.setOutputDir(selected);
      }
    } catch (error) {
      console.error('Error selecting output directory:', error);
    }
  }

  function handleToggleTrack(trackId: number) {
    const path = fileListStore.selectedFilePath;
    if (path) {
      extractionStore.toggleTrack(path, trackId);
    }
  }

  function handleSelectAllOfType(type: Track['type']) {
    const file = fileListStore.selectedFile;
    if (!file) return;

    const trackIds = file.tracks
      .filter(t => t.type === type)
      .map(t => t.id);

    extractionStore.selectAllTracksOfType(file.path, trackIds);
  }

  function handleDeselectAllOfType(type: Track['type']) {
    const file = fileListStore.selectedFile;
    if (!file) return;

    const trackIds = file.tracks
      .filter(t => t.type === type)
      .map(t => t.id);

    // Remove these tracks from selection
    const currentTracks = extractionStore.getSelectedTracksForFile(file.path);
    const newTracks = currentTracks.filter(id => !trackIds.includes(id));
    extractionStore.setTracksForFile(file.path, newTracks);
  }

  function handleBatchSelect(selection: Map<string, number[]>) {
    // Apply batch selection to all files
    for (const [filePath, trackIds] of selection) {
      extractionStore.setTracksForFile(filePath, trackIds);
    }
    // Clear unselected files
    for (const file of fileListStore.files) {
      if (!selection.has(file.path)) {
        extractionStore.clearTracksForFile(file.path);
      }
    }
  }

  async function handleExtract() {
    const outputDir = extractionStore.outputDir;
    if (!outputDir) {
      toast.error('Veuillez sélectionner un dossier de destination');
      return;
    }

    const files = fileListStore.files.filter(f => f.status === 'ready');
    const selectedTracks = extractionStore.selectedTracks;

    // Build list of extractions
    const extractions: { file: VideoFile; track: Track }[] = [];

    for (const file of files) {
      const trackIds = selectedTracks.get(file.path) || [];
      for (const trackId of trackIds) {
        const track = file.tracks.find(t => t.id === trackId);
        if (track) {
          extractions.push({ file, track });
        }
      }
    }

    if (extractions.length === 0) {
      toast.warning('Aucune piste sélectionnée');
      return;
    }

    // Start extraction
    extractionStore.updateProgress({
      status: 'extracting',
      totalFiles: files.length,
      totalTracks: extractions.length,
      currentFileIndex: 0,
      currentTrack: 0
    });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < extractions.length; i++) {
      const { file, track } = extractions[i];
      const outputPath = buildOutputPath(file.path, track, outputDir);

      extractionStore.updateProgress({
        currentFile: file.name,
        currentFileIndex: Math.floor(i / extractions.length * files.length) + 1,
        currentTrack: i + 1
      });

      const result = await extractTrack({
        inputPath: file.path,
        outputPath,
        trackIndex: track.index,
        trackType: track.type,
        codec: track.codec
      });

      extractionStore.addResult(result);

      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    extractionStore.updateProgress({ status: 'completed' });

    if (errorCount === 0) {
      toast.success(`${successCount} piste(s) extraite(s) avec succès`);
    } else {
      toast.warning(`${successCount} succès, ${errorCount} erreur(s)`);
    }
  }

  async function handleOpenFolder() {
    try {
      await invoke('open_folder', { path: extractionStore.outputDir });
    } catch (error) {
      console.error('Error opening folder:', error);
    }
  }

  function handleClearAll() {
    fileListStore.clear();
    extractionStore.reset();
    extractionStore.clearAllTracks();
    toast.info('Liste des fichiers vidée');
  }

  // Derived states
  const selectedFile = $derived(fileListStore.selectedFile);
  const selectedTrackIds = $derived(
    fileListStore.selectedFilePath
      ? extractionStore.getSelectedTracksForFile(fileListStore.selectedFilePath)
      : []
  );
  const readyFiles = $derived(fileListStore.files.filter(f => f.status === 'ready'));

  const isMacOS = OS() === 'MacOS';
</script>

<main class="h-screen flex flex-col bg-background">
  <!-- Header -->
  <header class="border-b px-6 py-3 flex items-center justify-between" data-tauri-drag-region={isMacOS}>
    <div class:ml-18={isMacOS}>
      <h1 class="text-xl font-bold">RsExtractor</h1>
    </div>
    <div class="flex items-center gap-2">
      <ThemeToggle />
      <Button onclick={handleImportClick}>
        <Upload class="size-4 mr-2" />
        Importer
      </Button>
    </div>
  </header>

  <!-- FFmpeg warning -->
  {#if ffmpegAvailable === false}
    <Alert variant="destructive" class="m-4">
      <AlertCircle class="size-4" />
      <AlertTitle>FFmpeg non disponible</AlertTitle>
      <AlertDescription>
        Installez FFmpeg pour utiliser cette application. Sur macOS: <code class="bg-muted px-1 rounded">brew install ffmpeg</code>
      </AlertDescription>
    </Alert>
  {/if}

  <!-- Main content -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Left panel: File list -->
    <div class="w-80 border-r flex flex-col overflow-hidden">
      <div class="p-4 border-b shrink-0 flex items-center justify-between">
        <h2 class="font-semibold">Fichiers ({fileListStore.files.length})</h2>
        {#if fileListStore.files.length > 0}
          <Button
            variant="ghost"
            size="icon-sm"
            onclick={handleClearAll}
            class="text-muted-foreground hover:text-destructive"
          >
            <Trash2 class="size-4" />
            <span class="sr-only">Vider la liste</span>
          </Button>
        {/if}
      </div>

      {#if fileListStore.files.length === 0}
        <div class="flex-1 p-4 overflow-auto">
          <DropZone isDragging={uiStore.isDragging} />
        </div>
      {:else}
        <div class="flex-1 min-h-0 overflow-auto p-4">
          <FileList
            files={fileListStore.files}
            selectedPath={fileListStore.selectedFilePath}
            onSelect={(path) => fileListStore.selectFile(path)}
            onRemove={(path) => fileListStore.removeFile(path)}
          />
        </div>
      {/if}
    </div>

    <!-- Center panel: Track details -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Batch selector for multi-selection -->
      {#if readyFiles.length > 0}
        <div class="p-4 border-b shrink-0">
          <BatchTrackSelector
            files={readyFiles}
            selectedTracks={extractionStore.selectedTracks}
            onBatchSelect={handleBatchSelect}
          />
        </div>
      {/if}

      <div class="flex-1 min-h-0 overflow-auto p-6">
        {#if selectedFile}
          <TrackDetails
            file={selectedFile}
            selectedTrackIds={selectedTrackIds}
            onToggleTrack={handleToggleTrack}
            onSelectAll={handleSelectAllOfType}
            onDeselectAll={handleDeselectAllOfType}
          />
        {:else}
          <div class="h-full flex items-center justify-center text-muted-foreground py-20">
            <p>Sélectionnez un fichier pour voir les pistes</p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Right panel: Extraction options -->
    <div class="w-80 border-l p-4 overflow-auto">
      <ExtractionPanel
        outputDir={extractionStore.outputDir}
        selectedCount={extractionStore.getTotalSelectedTracks()}
        progress={extractionStore.progress}
        onSelectOutputDir={handleSelectOutputDir}
        onExtract={handleExtract}
        onOpenFolder={handleOpenFolder}
      />
    </div>
  </div>
</main>


