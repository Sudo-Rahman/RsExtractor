<script lang="ts" module>
  export interface TranscodeViewApi {
    handleFileDrop: (paths: string[]) => Promise<void>;
    applySelectedProfileToAll: () => void;
    showMainView: () => void;
  }

  export interface TranscodeHeaderState {
    title?: string;
    description?: string;
    readyCount: number;
    conflictCount: number;
    hasFiles: boolean;
    mode: 'ai' | 'advanced';
    showModeToggle: boolean;
    showApplyToAll: boolean;
    showBackButton: boolean;
  }
</script>

<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { listen, type UnlistenFn } from '@tauri-apps/api/event';
  import { open } from '@tauri-apps/plugin-dialog';
  import {
    CheckCircle,
    FileVideo,
    FolderOpen,
    Info,
    Loader2,
    Play,
    Save,
    Sparkles,
    Subtitles,
    Trash2,
    Volume2,
    Wand2,
    X,
    XCircle,
  } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';

  import { createRenameWorkspaceStore, transcodeStore } from '$lib/stores';
  import { LlmProviderModelSelector } from '$lib/components/llm';
  import { RenameWorkspace } from '$lib/components/rename';
  import { FileItemCard, ToolImportButton } from '$lib/components/shared';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import * as Dialog from '$lib/components/ui/dialog';
  import { ImportDropZone } from '$lib/components/ui/import-drop-zone';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Progress } from '$lib/components/ui/progress';
  import * as Select from '$lib/components/ui/select';
  import { Switch } from '$lib/components/ui/switch';
  import * as Tabs from '$lib/components/ui/tabs';
  import { Textarea } from '$lib/components/ui/textarea';
  import { fetchFileMetadata } from '$lib/services/file-metadata';
  import { scanFiles } from '$lib/services/ffprobe';
  import { analyzeTranscodeProfile } from '$lib/services/transcode-ai';
  import {
    buildDefaultTranscodeProfile,
    buildReadableProbeSummary,
    clampTranscodeProfile,
    cloneTranscodeProfile,
    createTranscodeRequest,
    describeTrackSummary,
    extractTranscodeAnalysisFrames,
    fileHasAudio,
    fileHasVideo,
    findCompatibleContainerId,
    getAudioEncoderCapability,
    getContainerCapability,
    getContainerExtension,
    getDefaultVideoPresetValue,
    getPrimaryAudioTrack,
    getPrimaryVideoTrack,
    getSubtitleEncoderCapability,
    getTranscodeCompatibilityIssues,
    getTracksByType,
    getTranscodeCapabilities,
    getVideoPresetOptions,
    getVideoEncoderCapability,
    transcodeMedia,
  } from '$lib/services/transcode';
  import {
    getBaseName,
    type ResolveRenameTargetPathContext,
  } from '$lib/services/rename';
  import type {
    FileRunState,
    RenameFile,
    Track,
    TranscodeAdditionalArg,
    TranscodeAudioMode,
    TranscodeFile,
    TranscodePresetTab,
    TranscodeProgressEvent,
    TranscodeProfile,
    TranscodeQualityMode,
    TranscodeSubtitleMode,
    TranscodeTab,
    TranscodeVideoMode,
  } from '$lib/types';
  import { logAndToast } from '$lib/utils/log-toast';
  import { cn } from '$lib/utils';
  import {
    FILE_ITEM_CARD_ACTION_BUTTON_CLASS,
    FILE_ITEM_CARD_ACTION_ICON_CLASS,
    FILE_ITEM_CARD_CANCEL_ACTION_CLASS,
    FILE_ITEM_CARD_META_CLASS,
    FILE_ITEM_CARD_REMOVE_ACTION_CLASS,
    FILE_ITEM_CARD_STATUS_ICON_CLASS,
    FILE_ITEM_CARD_TITLE_CLASS,
  } from '$lib/utils/file-item-card-visuals';
  import { getFileCardStatus, shouldShowFileCardProgress } from '$lib/utils/file-run-state';
  import {
    formatBitrate,
    formatChannels,
    formatDuration,
    formatFileSize,
    formatLanguage,
    formatResolution,
    formatTransferRate,
  } from '$lib/utils/format';

  interface Props {
    onNavigateToSettings?: () => void;
    onHeaderStateChange?: (state: TranscodeHeaderState | null) => void;
  }

  let { onNavigateToSettings, onHeaderStateChange }: Props = $props();

  const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.mov', '.webm', '.m4v', '.avi', '.mxf'];
  const AUDIO_EXTENSIONS = ['.m4a', '.aac', '.mp3', '.flac', '.opus', '.wav', '.ogg', '.ac3', '.eac3', '.mka'];
  const SUPPORTED_EXTENSIONS = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];
  const SUPPORTED_FORMATS = SUPPORTED_EXTENSIONS.map((extension) => extension.slice(1).toUpperCase());
  const COMMON_OVERRIDE_FLAGS: Record<TranscodePresetTab, string[]> = {
    video: ['-tag:v', '-colorspace', '-color_trc', '-color_primaries', '-tune'],
    audio: ['-compression_level', '-cutoff', '-frame_duration', '-application'],
    subtitles: ['-fix_sub_duration'],
  };

  let infoDialogOpen = $state(false);
  let infoDialogFileId = $state<string | null>(null);
  let transcodeInternalView = $state<'main' | 'output-naming'>('main');
  let cancelAllRequested = $state(false);
  let cancelCurrentFileId = $state<string | null>(null);
  let isAnalyzingAi = $state(false);
  let presetManagerOpen = $state(false);
  let saveVideoPresetName = $state('');
  let saveAudioPresetName = $state('');
  let saveSubtitlePresetName = $state('');
  let selectedVideoPresetId = $state('');
  let selectedAudioPresetId = $state('');
  let selectedSubtitlePresetId = $state('');
  let unlistenTranscodeProgress: UnlistenFn | null = null;

  const outputNamingWorkspace = createRenameWorkspaceStore({
    mode: 'rename',
    includeOutputDirInTargetPath: true,
    targetPathOptions: {
      resolveTargetPath: resolveTranscodeOutputTargetPath,
    },
  });

  const infoDialogFile = $derived(
    infoDialogFileId
      ? transcodeStore.files.find((file) => file.id === infoDialogFileId) ?? null
      : null,
  );

  const selectedFile = $derived(transcodeStore.selectedFile ?? null);
  const selectedVideoTrack = $derived.by(() => selectedFile ? getPrimaryVideoTrack(selectedFile) ?? null : null);
  const selectedAudioTrack = $derived.by(() => selectedFile ? getPrimaryAudioTrack(selectedFile) ?? null : null);
  const selectedSubtitleTracks = $derived.by(() => selectedFile ? getTracksByType(selectedFile, 'subtitle') : []);
  const availableContainers = $derived.by(() => {
    if (!selectedFile || !transcodeStore.capabilities) {
      return [];
    }

    return transcodeStore.capabilities.containers.filter((container) =>
      selectedFile.hasVideo ? container.kind === 'video' : container.kind === 'audio',
    );
  });
  const selectedContainer = $derived.by(() =>
    selectedFile
      ? getContainerCapability(transcodeStore.capabilities, selectedFile.profile.containerId) ?? null
      : null,
  );
  const availableVideoEncoders = $derived.by(() =>
    selectedFile?.hasVideo ? transcodeStore.capabilities?.videoEncoders ?? [] : [],
  );
  const availableAudioEncoders = $derived.by(() =>
    selectedFile?.hasAudio ? transcodeStore.capabilities?.audioEncoders ?? [] : [],
  );
  const availableSubtitleEncoders = $derived.by(() =>
    (selectedContainer?.supportedSubtitleEncoderIds ?? [])
      .map((encoderId) => getSubtitleEncoderCapability(transcodeStore.capabilities, encoderId))
      .filter((encoder): encoder is NonNullable<typeof encoder> => Boolean(encoder)),
  );
  const selectedVideoEncoder = $derived.by(() =>
    selectedFile
      ? getVideoEncoderCapability(transcodeStore.capabilities, selectedFile.profile.video.encoderId) ?? null
      : null,
  );
  const selectedAudioEncoder = $derived.by(() =>
    selectedFile
      ? getAudioEncoderCapability(transcodeStore.capabilities, selectedFile.profile.audio.encoderId) ?? null
      : null,
  );
  const selectedSubtitleEncoder = $derived.by(() =>
    selectedFile
      ? getSubtitleEncoderCapability(transcodeStore.capabilities, selectedFile.profile.subtitles.encoderId) ?? null
      : null,
  );
  const outputPreviewPath = $derived.by(() => selectedFile ? buildTranscodeOutputPath(selectedFile) : '');
  const readyQueueFiles = $derived.by(() => {
    const selectedIds = new Set(outputNamingWorkspace.selectedFiles.map((file) => file.id));
    return transcodeStore.files.filter((file) => file.status === 'ready' && selectedIds.has(file.id));
  });
  const outputConflictCount = $derived.by(() => {
    const selectedWorkspaceFiles = outputNamingWorkspace.files.filter((file) => file.selected);
    return outputNamingWorkspace.getConflicts(selectedWorkspaceFiles).size;
  });
  const aiRationale = $derived(selectedFile?.aiRecommendation?.rationale ?? '');
  const activePresetTab = $derived.by(() =>
    transcodeStore.activeTab === 'audio' || transcodeStore.activeTab === 'subtitles'
      ? transcodeStore.activeTab
      : 'video',
  );
  const videoProfileOptions = $derived(selectedVideoEncoder?.supportedProfiles ?? []);
  const videoLevelOptions = $derived(selectedVideoEncoder?.supportedLevels ?? []);
  const videoPixelFormatOptions = $derived(selectedVideoEncoder?.supportedPixelFormats ?? []);
  const videoPresetOptions = $derived.by(() => getVideoPresetOptions(selectedVideoEncoder?.id));

  function getExtensionFromPath(path: string): string {
    const normalized = path.toLowerCase();
    const lastDot = normalized.lastIndexOf('.');
    return lastDot >= 0 ? normalized.slice(lastDot) : '';
  }

  function guessHasVideo(path: string): boolean {
    return VIDEO_EXTENSIONS.includes(getExtensionFromPath(path));
  }

  function createPlaceholderFile(path: string): TranscodeFile {
    const name = path.split('/').pop() || path.split('\\').pop() || path;
    const hasVideo = guessHasVideo(path);
    const hasAudio = true;

    return {
      id: transcodeStore.generateId(),
      path,
      name,
      size: 0,
      duration: undefined,
      bitrate: undefined,
      format: undefined,
      tracks: [],
      status: 'scanning',
      error: undefined,
      rawData: undefined,
      createdAt: undefined,
      modifiedAt: undefined,
      hasVideo,
      hasAudio,
      profile: buildDefaultTranscodeProfile(transcodeStore.capabilities, {
        hasVideo,
        hasAudio,
        tracks: [],
      }),
      analysisFrames: [],
      aiStatus: 'idle',
      aiError: undefined,
      aiRecommendation: undefined,
      lastOutputPath: undefined,
    };
  }

  function formatFrameRate(value?: string): string {
    if (!value) return 'N/A';
    const parts = value.split('/');
    if (parts.length === 2) {
      const numerator = Number(parts[0]);
      const denominator = Number(parts[1]);
      if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
        return `${(numerator / denominator).toFixed(3)} fps`;
      }
    }
    return value;
  }

  function formatSampleRate(value?: number): string {
    if (!value) return 'N/A';
    return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)} kHz`;
  }

  function formatBitDepth(track?: Track | null): string {
    if (!track?.derivedBitDepth) return 'N/A';
    return `${track.derivedBitDepth}-bit`;
  }

  function formatStatusLabel(status: ReturnType<typeof getFileCardStatus>): string {
    switch (status) {
      case 'queued':
        return 'Queued';
      case 'processing':
        return 'Transcoding';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      case 'error':
        return 'Error';
      case 'scanning':
        return 'Scanning';
      default:
        return 'Ready';
    }
  }

  function formatAiStatusLabel(file: TranscodeFile): string | null {
    if (file.aiStatus === 'analyzing') return 'AI analyzing';
    if (file.aiStatus === 'completed') return 'AI ready';
    if (file.aiStatus === 'error') return 'AI error';
    return null;
  }

  function getOutputExtensionForFileId(fileId: string): string {
    const file = transcodeStore.files.find((item) => item.id === fileId);
    if (!file) {
      return '.mp4';
    }
    return getContainerExtension(transcodeStore.capabilities, file.profile.containerId);
  }

  function resolveTranscodeOutputTargetPath(
    file: RenameFile,
    context: ResolveRenameTargetPathContext,
  ): string {
    const nextExtension = getOutputExtensionForFileId(file.id);
    const preferred = context.buildDefaultPath({ ...file, extension: nextExtension });
    if (preferred !== file.originalPath) {
      return preferred;
    }

    return context.buildDefaultPath({
      ...file,
      extension: nextExtension,
      newName: `${file.newName}_transcoded`,
    });
  }

  function createTranscodeRenameFile(file: TranscodeFile, existing?: RenameFile): RenameFile {
    const baseName = getBaseName(file.name);
    return {
      id: file.id,
      originalPath: file.path,
      originalName: baseName,
      extension: getOutputExtensionForFileId(file.id),
      newName: existing?.newName ?? baseName,
      selected: existing?.selected ?? true,
      status: 'pending',
      size: file.size,
      modifiedAt: file.modifiedAt,
      createdAt: file.createdAt,
    };
  }

  function buildTranscodeOutputPath(file: TranscodeFile): string {
    const existingNamingFile = outputNamingWorkspace.files.find((item) => item.id === file.id);
    const namingFile = existingNamingFile
      ? { ...existingNamingFile, extension: getOutputExtensionForFileId(file.id) }
      : createTranscodeRenameFile(file);
    return outputNamingWorkspace.getTargetPath(namingFile);
  }

  function parseOptionalInt(value: string): number | undefined {
    if (!value.trim()) return undefined;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function parseOptionalFloat(value: string): number | undefined {
    if (!value.trim()) return undefined;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function getPresetTitle(tab: TranscodePresetTab): string {
    if (tab === 'audio') return 'Audio Presets';
    if (tab === 'subtitles') return 'Subtitle Presets';
    return 'Video Presets';
  }

  function getPresetDescription(tab: TranscodePresetTab): string {
    if (tab === 'audio') return 'Save and reuse audio settings for the selected file.';
    if (tab === 'subtitles') return 'Save and reuse subtitle conversion policies.';
    return 'Save and reuse video settings for the selected file.';
  }

  function getPresetTriggerLabel(tab: TranscodePresetTab): string {
    if (tab === 'audio') return 'Audio presets';
    if (tab === 'subtitles') return 'Subtitle presets';
    return 'Video presets';
  }

  function getSelectedPresetId(tab: TranscodePresetTab): string {
    if (tab === 'audio') return selectedAudioPresetId;
    if (tab === 'subtitles') return selectedSubtitlePresetId;
    return selectedVideoPresetId;
  }

  function setSelectedPresetId(tab: TranscodePresetTab, value: string): void {
    if (tab === 'audio') {
      selectedAudioPresetId = value;
      return;
    }

    if (tab === 'subtitles') {
      selectedSubtitlePresetId = value;
      return;
    }

    selectedVideoPresetId = value;
  }

  function getSavePresetName(tab: TranscodePresetTab): string {
    if (tab === 'audio') return saveAudioPresetName;
    if (tab === 'subtitles') return saveSubtitlePresetName;
    return saveVideoPresetName;
  }

  function setSavePresetName(tab: TranscodePresetTab, value: string): void {
    if (tab === 'audio') {
      saveAudioPresetName = value;
      return;
    }

    if (tab === 'subtitles') {
      saveSubtitlePresetName = value;
      return;
    }

    saveVideoPresetName = value;
  }

  function alignProfileContainer(profile: TranscodeProfile, file: TranscodeFile): void {
    const compatibleContainerId = findCompatibleContainerId(transcodeStore.capabilities, profile, file);
    if (compatibleContainerId) {
      profile.containerId = compatibleContainerId;
    }
  }

  function handleSelectVideoEncoder(encoderId: string): void {
    withSelectedProfile((profile, file) => {
      profile.video.encoderId = encoderId;
      profile.video.preset = getDefaultVideoPresetValue(encoderId);
      alignProfileContainer(profile, file);
    });
  }

  function handleSelectAudioEncoder(encoderId: string): void {
    withSelectedProfile((profile, file) => {
      profile.audio.encoderId = encoderId;
      alignProfileContainer(profile, file);
    });
  }

  function handleToggleAudioChannelsOverride(checked: boolean): void {
    withSelectedProfile((profile) => {
      profile.audio.channels = checked ? (profile.audio.channels ?? selectedAudioTrack?.channels ?? 2) : undefined;
    });
  }

  function handleToggleAudioSampleRateOverride(checked: boolean): void {
    withSelectedProfile((profile) => {
      profile.audio.sampleRate = checked
        ? (profile.audio.sampleRate ?? selectedAudioTrack?.sampleRate ?? 48000)
        : undefined;
    });
  }

  function withSelectedProfile(mutator: (profile: TranscodeProfile, file: TranscodeFile) => void): void {
    const file = transcodeStore.selectedFile;
    if (!file) {
      return;
    }

    const nextProfile = cloneTranscodeProfile(file.profile);
    mutator(nextProfile, file);
    transcodeStore.setFileProfile(file.id, nextProfile);
  }

  function addAdditionalOverride(tab: TranscodePresetTab, presetFlag?: string): void {
    withSelectedProfile((profile) => {
      const target =
        tab === 'video'
          ? profile.video
          : tab === 'audio'
            ? profile.audio
            : profile.subtitles;

      target.additionalArgs = [
        ...target.additionalArgs,
        {
          id: transcodeStore.generateId(`transcode-arg-${tab}`),
          flag: presetFlag ?? '',
          value: '',
          enabled: true,
        },
      ];
    });
  }

  function updateAdditionalOverride(
    tab: TranscodePresetTab,
    argId: string,
    updates: Partial<TranscodeAdditionalArg>,
  ): void {
    withSelectedProfile((profile) => {
      const target =
        tab === 'video'
          ? profile.video
          : tab === 'audio'
            ? profile.audio
            : profile.subtitles;

      target.additionalArgs = target.additionalArgs.map((arg) =>
        arg.id === argId ? { ...arg, ...updates } : arg,
      );
    });
  }

  function removeAdditionalOverride(tab: TranscodePresetTab, argId: string): void {
    withSelectedProfile((profile) => {
      const target =
        tab === 'video'
          ? profile.video
          : tab === 'audio'
            ? profile.audio
            : profile.subtitles;

      target.additionalArgs = target.additionalArgs.filter((arg) => arg.id !== argId);
    });
  }

  async function initializeView(): Promise<void> {
    await transcodeStore.loadPresets();
    transcodeStore.setCapabilitiesLoading();

    try {
      const capabilities = await getTranscodeCapabilities();
      transcodeStore.setCapabilities(capabilities);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      transcodeStore.setCapabilitiesError(message);
      logAndToast.error({
        source: 'ffmpeg',
        title: 'Failed to load FFmpeg capabilities',
        details: message,
      });
    }

    unlistenTranscodeProgress = await listen<TranscodeProgressEvent>('media-transcode-progress', (event) => {
      if (!transcodeStore.isProcessing) {
        return;
      }

      const runtime = transcodeStore.runtimeProgress;
      if (!runtime.currentFilePath || runtime.currentFilePath !== event.payload.inputPath) {
        return;
      }

      transcodeStore.updateRuntimeCurrentFile(
        event.payload.progress,
        event.payload.speedBytesPerSec,
      );
      transcodeStore.updateFileRunProgress(
        event.payload.inputPath,
        event.payload.progress,
        event.payload.speedBytesPerSec,
      );
    });
  }

  onMount(() => {
    void initializeView();
  });

  onDestroy(() => {
    unlistenTranscodeProgress?.();
    outputNamingWorkspace.destroy();
    onHeaderStateChange?.(null);
  });

  $effect(() => {
    const existingById = untrack(() => new Map(outputNamingWorkspace.files.map((file) => [file.id, file])));
    const nextFiles = transcodeStore.files.map((file) =>
      createTranscodeRenameFile(file, existingById.get(file.id)),
    );

    untrack(() => {
      outputNamingWorkspace.replaceFiles(nextFiles, { preserveSelection: true });
    });
  });

  $effect(() => {
    onHeaderStateChange?.({
      title: transcodeInternalView === 'output-naming' ? 'Output Naming' : undefined,
      description: transcodeInternalView === 'output-naming'
        ? '': undefined,
      readyCount: readyQueueFiles.length,
      conflictCount: outputConflictCount,
      hasFiles: transcodeStore.files.length > 0,
      mode: transcodeStore.mode,
      showModeToggle: transcodeInternalView === 'main' && Boolean(selectedFile),
      showApplyToAll: transcodeInternalView === 'main' && Boolean(selectedFile),
      showBackButton: transcodeInternalView === 'output-naming',
    });
  });

  export async function handleFileDrop(paths: string[]): Promise<void> {
    const supportedPaths = paths.filter((path) => SUPPORTED_EXTENSIONS.includes(getExtensionFromPath(path)));
    if (supportedPaths.length === 0) {
      toast.warning('No supported media files detected');
      return;
    }

    await addFiles(supportedPaths);
  }

  export function applySelectedProfileToAll(): void {
    handleApplyCurrentToAll();
  }

  export function showMainView(): void {
    transcodeInternalView = 'main';
  }

  async function handleAddFiles(): Promise<void> {
    const selected = await open({
      multiple: true,
      filters: [{
        name: 'Media files',
        extensions: SUPPORTED_EXTENSIONS.map((extension) => extension.slice(1)),
      }],
    });

    if (!selected) {
      return;
    }

    const paths = Array.isArray(selected) ? selected : [selected];
    await addFiles(paths);
  }

  async function addFiles(paths: string[]): Promise<void> {
    let added = 0;
    let skipped = 0;
    const scanPaths: string[] = [];
    const fileIdsByPath = new Map<string, string>();

    for (const path of paths) {
      if (transcodeStore.hasFile(path)) {
        skipped += 1;
        continue;
      }

      const placeholder = createPlaceholderFile(path);
      transcodeStore.addFiles([placeholder]);
      scanPaths.push(path);
      fileIdsByPath.set(path, placeholder.id);
    }

    if (scanPaths.length > 0) {
      const [scannedFiles, metadataEntries] = await Promise.all([
        scanFiles(scanPaths, 3),
        Promise.all(scanPaths.map(async (path) => [path, await fetchFileMetadata(path)] as const)),
      ]);
      const metadataByPath = new Map(metadataEntries);

      for (const scanned of scannedFiles) {
        const fileId = fileIdsByPath.get(scanned.path);
        if (!fileId) {
          continue;
        }

        const metadata = metadataByPath.get(scanned.path);
        if (scanned.status === 'error') {
          transcodeStore.updateFile(fileId, {
            status: 'error',
            error: scanned.error,
            size: metadata?.size ?? scanned.size,
            createdAt: metadata?.createdAt,
            modifiedAt: metadata?.modifiedAt,
          });
          continue;
        }

        const hasVideo = fileHasVideo(scanned.rawData);
        const hasAudio = fileHasAudio(scanned.rawData);
        if (!hasVideo && !hasAudio) {
          transcodeStore.updateFile(fileId, {
            status: 'error',
            error: 'This tool supports video or audio-only media files.',
            size: metadata?.size ?? scanned.size,
            createdAt: metadata?.createdAt,
            modifiedAt: metadata?.modifiedAt,
          });
          continue;
        }

        const nextFileData = {
          id: fileId,
          path: scanned.path,
          name: scanned.name,
          size: metadata?.size ?? scanned.size,
          duration: scanned.duration,
          bitrate: scanned.bitrate,
          format: scanned.format,
          tracks: scanned.tracks,
          rawData: scanned.rawData,
          createdAt: metadata?.createdAt,
          modifiedAt: metadata?.modifiedAt,
          hasVideo,
          hasAudio,
        };

        const profile = clampTranscodeProfile(
          buildDefaultTranscodeProfile(transcodeStore.capabilities, nextFileData),
          transcodeStore.capabilities,
          nextFileData,
        );

        transcodeStore.updateFile(fileId, {
          ...nextFileData,
          status: 'ready',
          error: undefined,
          profile,
        });
        added += 1;
      }
    }

    if (added > 0 && skipped > 0) {
      toast.success(`Added ${added} file(s), ${skipped} duplicate(s) skipped`);
    } else if (added > 0) {
      toast.success(`Added ${added} file(s)`);
    } else if (skipped > 0) {
      toast.info(`${skipped} file(s) already imported`);
    }
  }

  function handleSelectFile(fileId: string): void {
    transcodeStore.selectFile(fileId);
  }

  function handleOpenInfo(fileId: string): void {
    infoDialogFileId = fileId;
    infoDialogOpen = true;
  }

  function handleRemoveFile(fileId: string): void {
    if (transcodeStore.isProcessing) {
      toast.info('Remove is disabled while transcoding is running');
      return;
    }

    transcodeStore.removeFile(fileId);
  }

  function handleClearAll(): void {
    if (transcodeStore.isProcessing) {
      toast.info('Clear is disabled while transcoding is running');
      return;
    }

    transcodeStore.clearFiles();
    toast.info('Cleared all files');
  }

  async function handleSelectOutputDir(): Promise<void> {
    const selected = await open({
      directory: true,
      multiple: false,
    });

    if (selected && !Array.isArray(selected)) {
      outputNamingWorkspace.setOutputDir(selected);
    }
  }

  function handleClearOutputDir(): void {
    outputNamingWorkspace.setOutputDir('');
  }

  async function handleAnalyzeAi(scope: 'selected' | 'all'): Promise<void> {
    if (!transcodeStore.capabilities) {
      toast.error('FFmpeg capabilities are not available yet');
      return;
    }

    const files = scope === 'selected'
      ? (selectedFile ? [selectedFile] : [])
      : transcodeStore.files.filter((file) => file.status === 'ready');

    if (files.length === 0) {
      toast.info(scope === 'selected' ? 'Select a file to analyze' : 'No ready files to analyze');
      return;
    }

    isAnalyzingAi = true;
    let completed = 0;
    let failed = 0;

    try {
      for (const file of files) {
        const latestFile = transcodeStore.files.find((item) => item.id === file.id);
        if (!latestFile || latestFile.status !== 'ready') {
          continue;
        }

        transcodeStore.setAiStatus(file.id, 'analyzing', undefined);

        try {
          let analysisFrames = latestFile.analysisFrames;
          const expectedFrameCount = transcodeStore.capabilities.defaultAnalysisFrameCount;
          const needsFrameRefresh = analysisFrames.length === 0
            || analysisFrames.length < expectedFrameCount
            || analysisFrames.some((path) => !path.toLowerCase().endsWith('.png'));

          if (needsFrameRefresh) {
            analysisFrames = await extractTranscodeAnalysisFrames(
              latestFile.path,
              expectedFrameCount,
            );
            transcodeStore.setAnalysisFrames(file.id, analysisFrames);
          }

          const refreshedFile = transcodeStore.files.find((item) => item.id === file.id) ?? {
            ...latestFile,
            analysisFrames,
          };

          const recommendation = await analyzeTranscodeProfile({
            file: refreshedFile,
            capabilities: transcodeStore.capabilities,
            provider: transcodeStore.aiProvider,
            model: transcodeStore.aiModel,
            intent: transcodeStore.aiIntent,
            userInstruction: transcodeStore.aiUserPrompt,
          });

          transcodeStore.setAiRecommendation(file.id, recommendation);
          completed += 1;
        } catch (error) {
          failed += 1;
          transcodeStore.setAiStatus(
            file.id,
            'error',
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    } finally {
      isAnalyzingAi = false;
    }

    if (completed > 0 && failed > 0) {
      toast.info(`AI analysis finished: ${completed} completed, ${failed} failed`);
    } else if (completed > 0) {
      toast.success(`AI analysis finished for ${completed} file(s)`);
    } else if (failed > 0) {
      toast.error('AI analysis failed for every file');
    }
  }

  function handleApplyCurrentToAll(): void {
    if (!selectedFile) {
      toast.info('Select a file first');
      return;
    }

    transcodeStore.applyProfileToAll(selectedFile.profile);
    toast.success('Applied the selected profile to all files');
  }

  async function handleSavePreset(tab: TranscodePresetTab): Promise<void> {
    if (!selectedFile) {
      return;
    }

    const name = tab === 'video'
      ? saveVideoPresetName
      : tab === 'audio'
        ? saveAudioPresetName
        : saveSubtitlePresetName;

    if (!name.trim()) {
      toast.info('Enter a preset name first');
      return;
    }

    const data = tab === 'video'
      ? selectedFile.profile.video
      : tab === 'audio'
        ? selectedFile.profile.audio
        : selectedFile.profile.subtitles;

    await transcodeStore.savePreset(tab, name, data);
    if (tab === 'video') saveVideoPresetName = '';
    if (tab === 'audio') saveAudioPresetName = '';
    if (tab === 'subtitles') saveSubtitlePresetName = '';
    toast.success('Preset saved');
  }

  function handleApplyPreset(tab: TranscodePresetTab): void {
    if (!selectedFile) {
      return;
    }

    const presetId = tab === 'video'
      ? selectedVideoPresetId
      : tab === 'audio'
        ? selectedAudioPresetId
        : selectedSubtitlePresetId;

    if (!presetId) {
      toast.info('Select a preset first');
      return;
    }

    transcodeStore.applyPreset(selectedFile.id, tab, presetId);
    toast.success('Preset applied');
  }

  async function handleDeletePreset(tab: TranscodePresetTab): Promise<void> {
    const presetId = tab === 'video'
      ? selectedVideoPresetId
      : tab === 'audio'
        ? selectedAudioPresetId
        : selectedSubtitlePresetId;

    if (!presetId) {
      toast.info('Select a preset first');
      return;
    }

    await transcodeStore.deletePreset(tab, presetId);
    if (tab === 'video') selectedVideoPresetId = '';
    if (tab === 'audio') selectedAudioPresetId = '';
    if (tab === 'subtitles') selectedSubtitlePresetId = '';
    toast.success('Preset deleted');
  }

  async function handleCancelFile(fileId: string): Promise<boolean> {
    if (!transcodeStore.isProcessing) return false;
    if (transcodeStore.isCancelling) return false;
    if (transcodeStore.runtimeProgress.currentFileId !== fileId) return false;

    const file = transcodeStore.files.find((item) => item.id === fileId);
    if (!file) return false;

    cancelCurrentFileId = fileId;
    transcodeStore.setCancelling(true);

    try {
      await invoke('cancel_transcode_file', { inputPath: file.path });
      toast.info('Cancelling current file...');
      return true;
    } catch (error) {
      cancelCurrentFileId = null;
      transcodeStore.setCancelling(false);
      logAndToast.error({
        source: 'ffmpeg',
        title: 'Cancel failed',
        details: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async function handleCancelAll(): Promise<boolean> {
    if (!transcodeStore.isProcessing) return false;
    if (transcodeStore.isCancelling) return false;

    cancelAllRequested = true;
    transcodeStore.setCancelling(true);

    try {
      await invoke('cancel_transcode');
      toast.info('Cancelling transcode queue...');
      return true;
    } catch (error) {
      cancelAllRequested = false;
      transcodeStore.setCancelling(false);
      logAndToast.error({
        source: 'ffmpeg',
        title: 'Cancel failed',
        details: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async function handleStartTranscode(): Promise<void> {
    if (transcodeStore.isProcessing) {
      return;
    }

    const filesToProcess = readyQueueFiles;
    if (filesToProcess.length === 0) {
      toast.warning('No ready files selected for transcoding');
      return;
    }

    if (outputConflictCount > 0) {
      toast.error('Please resolve output naming conflicts before transcoding');
      return;
    }

    if (!transcodeStore.capabilities) {
      toast.error('FFmpeg capabilities are not available yet');
      return;
    }

    for (const file of filesToProcess) {
      const compatibilityIssues = getTranscodeCompatibilityIssues(file, transcodeStore.capabilities);
      if (compatibilityIssues.length > 0) {
        transcodeStore.selectFile(file.id);
        transcodeStore.setActiveTab('subtitles');
        toast.error(`${file.name}: ${compatibilityIssues[0]}`);
        return;
      }

      const outputPath = buildTranscodeOutputPath(file);
      const expectedExtension = getContainerExtension(transcodeStore.capabilities, file.profile.containerId);
      if (getExtensionFromPath(outputPath) !== expectedExtension) {
        transcodeStore.selectFile(file.id);
        transcodeStore.setActiveTab('output');
        toast.error(`${file.name}: output file extension must match the selected container (${expectedExtension}).`);
        return;
      }
    }

    transcodeStore.setStatus('processing');
    transcodeStore.setError(null);
    transcodeStore.startRuntimeProgress(filesToProcess.length);
    transcodeStore.initializeFileRunStates(filesToProcess.map((file) => file.path));
    cancelAllRequested = false;
    cancelCurrentFileId = null;
    transcodeStore.setCancelling(false);

    let completed = 0;
    let cancelled = 0;
    let transcodeError: string | null = null;

    for (const file of filesToProcess) {
      if (cancelAllRequested) {
        break;
      }

      transcodeStore.setFileProcessing(file.path);
      transcodeStore.setCurrentRuntimeFile(file.id, file.path, file.name);

      try {
        const outputPath = buildTranscodeOutputPath(file);
        const result = await transcodeMedia(createTranscodeRequest(file, outputPath));
        completed += 1;
        transcodeStore.setFileCompleted(file.path);
        transcodeStore.updateFile(file.id, {
          lastOutputPath: result,
        });
      } catch (error) {
        if (cancelAllRequested || cancelCurrentFileId === file.id) {
          cancelled += 1;
          transcodeStore.setFileCancelled(file.path);
        } else {
          transcodeError = error instanceof Error ? error.message : String(error);
          transcodeStore.setFileError(file.path, transcodeError);
          break;
        }
      } finally {
        transcodeStore.markRuntimeFileCompleted();

        if (cancelCurrentFileId === file.id) {
          cancelCurrentFileId = null;
          if (!cancelAllRequested) {
            transcodeStore.setCancelling(false);
          }
        }
      }
    }

    if (cancelAllRequested) {
      for (const file of filesToProcess) {
        const runState = transcodeStore.getFileRunState(file.path);
        if (runState.status === 'queued') {
          transcodeStore.setFileCancelled(file.path);
        }
      }
    }

    if (transcodeError) {
      transcodeStore.setError(transcodeError);
      transcodeStore.resetRuntimeProgress();
      logAndToast.error({
        source: 'ffmpeg',
        title: 'Transcode failed',
        details: transcodeError,
      });
    } else if (cancelAllRequested || cancelled > 0) {
      transcodeStore.setStatus('idle');
      transcodeStore.resetRuntimeProgress();
      toast.info(`Transcode finished: ${completed} completed, ${cancelled} cancelled`);
    } else {
      transcodeStore.setStatus('completed');
      toast.success(`Successfully transcoded ${completed} file(s)`);
    }

    cancelAllRequested = false;
    cancelCurrentFileId = null;
    transcodeStore.setCancelling(false);
  }
</script>

{#if transcodeInternalView === 'output-naming'}
  <div class="h-full overflow-hidden">
    <RenameWorkspace
      workspace={outputNamingWorkspace}
      showImportButton={false}
      onClearAll={handleClearAll}
      onRemoveFile={handleRemoveFile}
      emptyStateTitle="No files in the transcode queue"
      emptyStateSubtitle="Add files in Transcode to prepare output names."
    >
      {#snippet actionPanel()}
        <div class="space-y-3">
          <div class="space-y-2">
            <Label class="text-xs uppercase tracking-wide text-muted-foreground">Output Folder</Label>
            <Button
              variant="outline"
              class="w-full justify-start gap-2 h-auto py-2 text-left"
              onclick={handleSelectOutputDir}
            >
              <FolderOpen class="size-4 shrink-0" />
              <span class="truncate flex-1 text-sm">
                {#if outputNamingWorkspace.outputDir}
                  {outputNamingWorkspace.outputDir}
                {:else}
                  <span class="text-muted-foreground">Use each source folder</span>
                {/if}
              </span>
            </Button>
            {#if outputNamingWorkspace.outputDir}
              <Button
                variant="ghost"
                size="sm"
                class="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
                onclick={handleClearOutputDir}
              >
                Use source folders
              </Button>
            {/if}
          </div>

          <div class="rounded-md border bg-muted/30 p-3 space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">Selected outputs</span>
              <Badge variant={outputNamingWorkspace.selectedCount > 0 ? 'default' : 'secondary'}>
                {outputNamingWorkspace.selectedCount}
              </Badge>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">Conflicts</span>
              <Badge variant={outputConflictCount > 0 ? 'destructive' : 'secondary'}>
                {outputConflictCount}
              </Badge>
            </div>
          </div>
        </div>
      {/snippet}
    </RenameWorkspace>
  </div>
{:else}
  <div class="h-full flex overflow-hidden">
    <div class="w-[max(20rem,25vw)] max-w-lg border-r flex flex-col overflow-hidden">
      <div class="p-3 border-b flex items-center justify-between gap-2">
        <div>
          <h2 class="font-semibold">Files ({transcodeStore.files.length})</h2>
          <!-- <p class="text-xs text-muted-foreground">Video and audio-only inputs.</p> -->
        </div>
        <div class="flex items-center gap-1">
          {#if transcodeStore.files.length > 0}
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={handleClearAll}
              class="text-muted-foreground hover:text-destructive"
              disabled={transcodeStore.isProcessing}
            >
              <Trash2 class="size-4" />
            </Button>
          {/if}
          <ToolImportButton
            targetTool="transcode"
            label="Add Files"
            onBrowse={handleAddFiles}
          />
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-auto p-2">
        {#if transcodeStore.files.length === 0}
          <ImportDropZone
            icon={FileVideo}
            title="Drop media files here"
            formats={SUPPORTED_FORMATS}
            onBrowse={handleAddFiles}
            class="h-full"
          />
        {:else}
          <div class="space-y-1.5">
            {#each transcodeStore.files as file (file.id)}
              {@const runState = transcodeStore.fileRunStates.get(file.path)}
              {@const status = getFileCardStatus(file.status, runState)}
              {@const showProgress = !!runState && shouldShowFileCardProgress(status)}
              {@const isCurrentProcessing = transcodeStore.isProcessing && transcodeStore.runtimeProgress.currentFileId === file.id}
              {@const showCancelAction = status === 'processing' && isCurrentProcessing}
              {@const removeDisabled = transcodeStore.isProcessing && !isCurrentProcessing}
              {@const aiLabel = formatAiStatusLabel(file)}
              <FileItemCard
                compact
                selected={selectedFile?.id === file.id}
                onclick={() => handleSelectFile(file.id)}
              >
                {#snippet icon()}
                  {#if status === 'scanning'}
                    <Loader2 class={cn(FILE_ITEM_CARD_STATUS_ICON_CLASS, 'text-muted-foreground animate-spin')} />
                  {:else if status === 'error'}
                    <XCircle class={cn(FILE_ITEM_CARD_STATUS_ICON_CLASS, 'text-destructive')} />
                  {:else if status === 'completed'}
                    <CheckCircle class={cn(FILE_ITEM_CARD_STATUS_ICON_CLASS, 'text-green-500')} />
                  {:else if status === 'cancelled'}
                    <XCircle class={cn(FILE_ITEM_CARD_STATUS_ICON_CLASS, 'text-orange-500')} />
                  {:else if status === 'queued' || status === 'processing'}
                    <Loader2 class={cn(FILE_ITEM_CARD_STATUS_ICON_CLASS, status === 'queued' ? 'text-orange-500 animate-spin' : 'text-primary animate-spin')} />
                  {:else}
                    <FileVideo class={cn(FILE_ITEM_CARD_STATUS_ICON_CLASS, file.hasVideo ? 'text-primary' : 'text-emerald-500')} />
                  {/if}
                {/snippet}

                {#snippet content()}
                  <div class="flex items-start justify-between gap-2">
                    <p class={FILE_ITEM_CARD_TITLE_CLASS}>{file.name}</p>
                    <Badge variant={status === 'error' ? 'destructive' : status === 'completed' ? 'default' : 'secondary'} class="text-[10px] shrink-0">
                      {formatStatusLabel(status)}
                    </Badge>
                  </div>

                  <p class="mt-1 text-xs text-muted-foreground line-clamp-2">
                    {#if file.status === 'error'}
                      {file.error}
                    {:else if file.tracks.length > 0}
                      {describeTrackSummary(file)}
                    {:else}
                      Preparing media scan...
                    {/if}
                  </p>

                  <div class={FILE_ITEM_CARD_META_CLASS}>
                    <span>{formatFileSize(file.size)}</span>
                    {#if file.duration}
                      <span>• {formatDuration(file.duration)}</span>
                    {/if}
                    {#if showProgress && runState}
                      <span>• {Math.round(runState.progress)}%</span>
                    {/if}
                    {#if aiLabel}
                      <span>• {aiLabel}</span>
                    {/if}
                  </div>

                  {#if showProgress && runState}
                    <div class="mt-2">
                      <Progress value={runState.progress} class="h-1.5" />
                    </div>
                  {/if}
                {/snippet}

                {#snippet actions()}
                  <div class="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      class={FILE_ITEM_CARD_ACTION_BUTTON_CLASS}
                      onclick={(event: MouseEvent) => {
                        event.stopPropagation();
                        handleOpenInfo(file.id);
                      }}
                      title="File information"
                    >
                      <Info class={FILE_ITEM_CARD_ACTION_ICON_CLASS} />
                    </Button>

                    {#if showCancelAction}
                      <Button
                        variant="ghost"
                        size="icon"
                        class={cn(FILE_ITEM_CARD_ACTION_BUTTON_CLASS, FILE_ITEM_CARD_CANCEL_ACTION_CLASS)}
                        onclick={(event: MouseEvent) => {
                          event.stopPropagation();
                          void handleCancelFile(file.id);
                        }}
                        title="Cancel current file"
                      >
                        <X class={FILE_ITEM_CARD_ACTION_ICON_CLASS} />
                      </Button>
                    {:else}
                      <Button
                        variant="ghost"
                        size="icon"
                        class={cn(FILE_ITEM_CARD_ACTION_BUTTON_CLASS, FILE_ITEM_CARD_REMOVE_ACTION_CLASS)}
                        onclick={(event: MouseEvent) => {
                          event.stopPropagation();
                          handleRemoveFile(file.id);
                        }}
                        disabled={removeDisabled}
                        title={removeDisabled ? 'Cannot remove while another file is processing' : 'Remove'}
                      >
                        <Trash2 class={FILE_ITEM_CARD_ACTION_ICON_CLASS} />
                      </Button>
                    {/if}
                  </div>
                {/snippet}
              </FileItemCard>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div class="flex-1 min-w-0 flex flex-col overflow-hidden">
      {#if !selectedFile}
        <div class="flex-1 p-6">
          <Card.Root class="h-full border-dashed">
            <Card.Content class="h-full flex items-center justify-center">
              <div class="text-center space-y-3 max-w-md">
                <div class="mx-auto size-16 rounded-full bg-muted/50 flex items-center justify-center">
                  <FileVideo class="size-8 text-muted-foreground" />
                </div>
                <div>
                  <h2 class="text-xl font-semibold">Transcode media files</h2>
                  <p class="text-sm text-muted-foreground mt-1">
                    Import video or audio-only files to configure AI-assisted or advanced FFmpeg transcoding.
                  </p>
                </div>
                <Button onclick={handleAddFiles}>
                  <FileVideo class="size-4 mr-2" />
                  Add Files
                </Button>
              </div>
            </Card.Content>
          </Card.Root>
        </div>
      {:else}
        <div class="border-b px-4 py-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h2 class="font-semibold truncate">{selectedFile.name}</h2>
              <Badge variant="outline">{selectedFile.hasVideo ? 'Video' : 'Audio-only'}</Badge>
              {#if selectedFile.aiRecommendation}
                <Badge class="gap-1">
                  <Sparkles class="size-3" />
                  AI {selectedFile.aiRecommendation.intent}
                </Badge>
              {/if}
            </div>
            <p class="text-sm text-muted-foreground truncate mt-1">
              {describeTrackSummary(selectedFile)}
            </p>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-auto p-4 space-y-4">
          {#if transcodeStore.mode === 'ai'}
            <Card.Root>
              <Card.Header class="pb-3">
                <Card.Title>AI Assist</Card.Title>
                <Card.Description>
                  Let AI recommend the best transcode settings for each file.
                </Card.Description>
              </Card.Header>
              <Card.Content class="space-y-4">
                <LlmProviderModelSelector
                  provider={transcodeStore.aiProvider}
                  model={transcodeStore.aiModel}
                  onProviderChange={(provider) => transcodeStore.setAiProvider(provider)}
                  onModelChange={(model) => transcodeStore.setAiModel(model)}
                  onNavigateToSettings={onNavigateToSettings}
                />

                <div class="space-y-2">
                  <Label class="text-sm font-medium">Intent</Label>
                  <div class="flex flex-wrap gap-2">
                    <Button
                      variant={transcodeStore.aiIntent === 'speed' ? 'default' : 'outline'}
                      size="sm"
                      onclick={() => transcodeStore.setAiIntent('speed')}
                    >
                      Speed
                    </Button>
                    <Button
                      variant={transcodeStore.aiIntent === 'quality' ? 'default' : 'outline'}
                      size="sm"
                      onclick={() => transcodeStore.setAiIntent('quality')}
                    >
                      Quality
                    </Button>
                    <Button
                      variant={transcodeStore.aiIntent === 'archive' ? 'default' : 'outline'}
                      size="sm"
                      onclick={() => transcodeStore.setAiIntent('archive')}
                    >
                      Archive
                    </Button>
                  </div>
                </div>

                <div class="space-y-2">
                  <Label class="text-sm font-medium" for="transcode-ai-user-prompt">Optional instruction</Label>
                  <Textarea
                    id="transcode-ai-user-prompt"
                    value={transcodeStore.aiUserPrompt}
                    class="min-h-24 text-sm"
                    placeholder="Example: Prefer AV1 if it is supported and still practical for this source."
                    oninput={(event) => transcodeStore.setAiUserPrompt(event.currentTarget.value)}
                  />
                  <p class="text-xs text-muted-foreground">
                    Use this to steer codec or quality choices. Requests unrelated to transcoding will be rejected.
                  </p>
                </div>

                <div class="flex flex-wrap gap-2">
                  <Button onclick={() => void handleAnalyzeAi('selected')} disabled={isAnalyzingAi || selectedFile.status !== 'ready'}>
                    {#if isAnalyzingAi}
                      <Loader2 class="size-4 mr-2 animate-spin" />
                    {:else}
                      <Wand2 class="size-4 mr-2" />
                    {/if}
                    Analyze Selected File
                  </Button>
                  <Button variant="outline" onclick={() => void handleAnalyzeAi('all')} disabled={isAnalyzingAi}>
                    {#if isAnalyzingAi}
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
                    <Textarea value={aiRationale} readonly class="min-h-24 text-sm" />
                    <div class="rounded-md border bg-background p-3 text-sm space-y-1">
                      <p><span class="font-medium">Container:</span> {selectedFile.profile.containerId.toUpperCase()}</p>
                      <p><span class="font-medium">Video:</span> {selectedFile.profile.video.mode}{selectedFile.profile.video.encoderId ? ` · ${selectedFile.profile.video.encoderId}` : ''}</p>
                      <p><span class="font-medium">Audio:</span> {selectedFile.profile.audio.mode}{selectedFile.profile.audio.encoderId ? ` · ${selectedFile.profile.audio.encoderId}` : ''}</p>
                      <p><span class="font-medium">Subtitles:</span> {selectedFile.profile.subtitles.mode}{selectedFile.profile.subtitles.encoderId ? ` · ${selectedFile.profile.subtitles.encoderId}` : ''}</p>
                    </div>
                  </div>
                {:else}
                  <div class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    AI recommendations will appear here and automatically fill the advanced settings below.
                  </div>
                {/if}
              </Card.Content>
            </Card.Root>
          {/if}

          <Card.Root>
            <Card.Content class="pt-4">
              <Tabs.Root
                value={transcodeStore.activeTab}
                onValueChange={(value) => transcodeStore.setActiveTab(value as TranscodeTab)}
                class="gap-4"
              >
                <Tabs.List class="grid w-full grid-cols-4">
                  <Tabs.Trigger value="video">Video</Tabs.Trigger>
                  <Tabs.Trigger value="audio">Audio</Tabs.Trigger>
                  <Tabs.Trigger value="subtitles">Subtitles</Tabs.Trigger>
                  <Tabs.Trigger value="output">Output</Tabs.Trigger>
                </Tabs.List>

                {#if transcodeStore.activeTab !== 'output'}
                  <div class="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2">
                    <p class="min-w-0 flex-1 text-sm text-muted-foreground">
                      Saved presets for the current <span class="font-medium text-foreground">{activePresetTab}</span> tab.
                    </p>
                    <Button variant="outline" size="sm" class="shrink-0" onclick={() => presetManagerOpen = true}>
                      <Save class="size-4 mr-2" />
                      {getPresetTriggerLabel(activePresetTab)}
                    </Button>
                  </div>
                {/if}

                <Tabs.Content value="video" class="space-y-4">
                  {#if !selectedFile.hasVideo}
                    <div class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      This file is audio-only, so video transcoding is disabled.
                    </div>
                  {:else}
                    <div class="grid gap-4 lg:grid-cols-2">
                      <div class="space-y-4">
                        <div class="space-y-2">
                          <Label>Video mode</Label>
                          <Select.Root type="single" value={selectedFile.profile.video.mode} onValueChange={(value) => {
                            withSelectedProfile((profile) => {
                              profile.video.mode = value as TranscodeVideoMode;
                            });
                          }}>
                            <Select.Trigger class="w-full">{selectedFile.profile.video.mode}</Select.Trigger>
                            <Select.Content>
                              <Select.Item value="copy">copy</Select.Item>
                              <Select.Item value="transcode">transcode</Select.Item>
                              <Select.Item value="disable">disable</Select.Item>
                            </Select.Content>
                          </Select.Root>
                        </div>

                        <div class="space-y-2">
                          <Label>Video encoder</Label>
                          <Select.Root type="single" value={selectedFile.profile.video.encoderId} onValueChange={handleSelectVideoEncoder}>
                            <Select.Trigger class="w-full">{selectedVideoEncoder?.label ?? 'Select encoder'}</Select.Trigger>
                            <Select.Content>
                              {#each availableVideoEncoders as encoder (encoder.id)}
                                <Select.Item value={encoder.id}>{encoder.label}</Select.Item>
                              {/each}
                            </Select.Content>
                          </Select.Root>
                        </div>

                        {#if videoProfileOptions.length > 0 || videoLevelOptions.length > 0}
                          <div class="grid gap-4 md:grid-cols-2">
                            {#if videoProfileOptions.length > 0}
                              <div class="space-y-2">
                                <Label>Profile</Label>
                                <Select.Root type="single" value={selectedFile.profile.video.profile} onValueChange={(value) => {
                                  withSelectedProfile((profile) => {
                                    profile.video.profile = value;
                                  });
                                }}>
                                  <Select.Trigger class="w-full">{selectedFile.profile.video.profile ?? 'Auto'}</Select.Trigger>
                                  <Select.Content>
                                    {#each videoProfileOptions as profile (profile)}
                                      <Select.Item value={profile}>{profile}</Select.Item>
                                    {/each}
                                  </Select.Content>
                                </Select.Root>
                              </div>
                            {/if}

                            {#if videoLevelOptions.length > 0}
                              <div class="space-y-2">
                                <Label>Level</Label>
                                <Select.Root type="single" value={selectedFile.profile.video.level} onValueChange={(value) => {
                                  withSelectedProfile((profile) => {
                                    profile.video.level = value;
                                  });
                                }}>
                                  <Select.Trigger class="w-full">{selectedFile.profile.video.level ?? 'Auto'}</Select.Trigger>
                                  <Select.Content>
                                    {#each videoLevelOptions as level (level)}
                                      <Select.Item value={level}>{level}</Select.Item>
                                    {/each}
                                  </Select.Content>
                                </Select.Root>
                              </div>
                            {/if}
                          </div>
                        {/if}

                        {#if videoPixelFormatOptions.length > 0}
                          <div class="space-y-2">
                            <Label>Pixel format</Label>
                            <Select.Root type="single" value={selectedFile.profile.video.pixelFormat} onValueChange={(value) => {
                              withSelectedProfile((profile) => {
                                profile.video.pixelFormat = value;
                              });
                            }}>
                              <Select.Trigger class="w-full">{selectedFile.profile.video.pixelFormat ?? 'Auto'}</Select.Trigger>
                              <Select.Content>
                                {#each videoPixelFormatOptions as pixelFormat (pixelFormat)}
                                  <Select.Item value={pixelFormat}>{pixelFormat}</Select.Item>
                                {/each}
                              </Select.Content>
                            </Select.Root>
                            {#if selectedVideoEncoder?.supportedBitDepths?.length}
                              <p class="text-xs text-muted-foreground">
                                Supported bit depths: {selectedVideoEncoder.supportedBitDepths.join(', ')}-bit
                              </p>
                            {/if}
                          </div>
                        {/if}
                      </div>

                      <div class="space-y-4">
                        <div class="space-y-2">
                          <Label>Quality mode</Label>
                          <Select.Root type="single" value={selectedFile.profile.video.qualityMode} onValueChange={(value) => {
                            withSelectedProfile((profile) => {
                              profile.video.qualityMode = value as TranscodeQualityMode;
                            });
                          }}>
                            <Select.Trigger class="w-full">{selectedFile.profile.video.qualityMode}</Select.Trigger>
                            <Select.Content>
                              {#if selectedVideoEncoder?.supportsCrf}
                                <Select.Item value="crf">crf</Select.Item>
                              {/if}
                              {#if selectedVideoEncoder?.supportsQp}
                                <Select.Item value="qp">qp</Select.Item>
                              {/if}
                              {#if selectedVideoEncoder?.supportsBitrate}
                                <Select.Item value="bitrate">bitrate</Select.Item>
                              {/if}
                            </Select.Content>
                          </Select.Root>
                        </div>

                        {#if selectedFile.profile.video.qualityMode === 'crf'}
                          <div class="space-y-2">
                            <Label>CRF</Label>
                            <Input
                              type="number"
                              value={selectedFile.profile.video.crf?.toString() ?? ''}
                              oninput={(event) => {
                                const value = parseOptionalFloat(event.currentTarget.value);
                                withSelectedProfile((profile) => {
                                  profile.video.crf = value;
                                });
                              }}
                            />
                          </div>
                        {:else if selectedFile.profile.video.qualityMode === 'qp'}
                          <div class="space-y-2">
                            <Label>QP</Label>
                            <Input
                              type="number"
                              value={selectedFile.profile.video.qp?.toString() ?? ''}
                              oninput={(event) => {
                                const value = parseOptionalInt(event.currentTarget.value);
                                withSelectedProfile((profile) => {
                                  profile.video.qp = value;
                                });
                              }}
                            />
                          </div>
                        {:else}
                          <div class="space-y-2">
                            <Label>Bitrate (kbps)</Label>
                            <Input
                              type="number"
                              value={selectedFile.profile.video.bitrateKbps?.toString() ?? ''}
                              oninput={(event) => {
                                const value = parseOptionalInt(event.currentTarget.value);
                                withSelectedProfile((profile) => {
                                  profile.video.bitrateKbps = value;
                                });
                              }}
                            />
                          </div>
                        {/if}

                        {#if videoPresetOptions.length > 0}
                          <div class="space-y-2">
                            <Label>Preset</Label>
                            <Select.Root
                              type="single"
                              value={selectedFile.profile.video.preset ?? getDefaultVideoPresetValue(selectedVideoEncoder?.id) ?? ''}
                              onValueChange={(value) => {
                                withSelectedProfile((profile) => {
                                  profile.video.preset = value || undefined;
                                });
                              }}
                            >
                              <Select.Trigger class="w-full">
                                {videoPresetOptions.find((option) => option.value === (selectedFile.profile.video.preset ?? getDefaultVideoPresetValue(selectedVideoEncoder?.id)))?.label ?? 'Select preset'}
                              </Select.Trigger>
                              <Select.Content>
                                {#each videoPresetOptions as option (option.value)}
                                  <Select.Item value={option.value}>{option.label}</Select.Item>
                                {/each}
                              </Select.Content>
                            </Select.Root>
                          </div>
                        {/if}

                        <div class="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                          <p><span class="font-medium">Source codec:</span> {selectedVideoTrack?.codec.toUpperCase() ?? 'N/A'}</p>
                          <p><span class="font-medium">Source resolution:</span> {formatResolution(selectedVideoTrack?.width, selectedVideoTrack?.height)}</p>
                          <p><span class="font-medium">Source bit depth:</span> {formatBitDepth(selectedVideoTrack)}</p>
                          <p><span class="font-medium">Source color:</span> {selectedVideoTrack?.colorSpace ?? 'N/A'} / {selectedVideoTrack?.colorTransfer ?? 'N/A'} / {selectedVideoTrack?.colorPrimaries ?? 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  {/if}

                  <Card.Root>
                    <Card.Header class="pb-3">
                      <Card.Title>Additional Overrides</Card.Title>
                      <Card.Description>Optional safe FFmpeg flags for the current video encoder.</Card.Description>
                    </Card.Header>
                    <Card.Content class="space-y-3">
                      <div class="flex flex-wrap gap-2">
                        {#each COMMON_OVERRIDE_FLAGS.video as flag (flag)}
                          <Button variant="outline" size="sm" onclick={() => addAdditionalOverride('video', flag)}>
                            {flag}
                          </Button>
                        {/each}
                        <Button variant="secondary" size="sm" onclick={() => addAdditionalOverride('video')}>Add empty override</Button>
                      </div>

                      {#if selectedFile.profile.video.additionalArgs.length === 0}
                        <p class="text-sm text-muted-foreground">No video overrides added.</p>
                      {/if}

                      {#each selectedFile.profile.video.additionalArgs as arg (arg.id)}
                        <div class="grid gap-2 md:grid-cols-[8rem_minmax(0,1fr)_auto_auto] items-center">
                          <Input
                            placeholder="-flag"
                            value={arg.flag}
                            oninput={(event) => updateAdditionalOverride('video', arg.id, { flag: event.currentTarget.value })}
                          />
                          <Input
                            placeholder="Optional value"
                            value={arg.value ?? ''}
                            oninput={(event) => updateAdditionalOverride('video', arg.id, { value: event.currentTarget.value || undefined })}
                          />
                          <div class="flex items-center gap-2">
                            <Switch
                              checked={arg.enabled}
                              onCheckedChange={(checked) => updateAdditionalOverride('video', arg.id, { enabled: checked })}
                            />
                            <span class="text-xs text-muted-foreground">Enabled</span>
                          </div>
                          <Button variant="ghost" size="icon-sm" onclick={() => removeAdditionalOverride('video', arg.id)}>
                            <Trash2 class="size-4" />
                          </Button>
                        </div>
                      {/each}
                    </Card.Content>
                  </Card.Root>
                </Tabs.Content>

                <Tabs.Content value="audio" class="space-y-4">
                  {#if !selectedFile.hasAudio}
                    <div class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      No audio stream was detected in this file.
                    </div>
                  {:else}
                    <div class="grid gap-4 lg:grid-cols-2">
                      <div class="space-y-4">
                        <div class="space-y-2">
                          <Label>Audio mode</Label>
                          <Select.Root type="single" value={selectedFile.profile.audio.mode} onValueChange={(value) => {
                            withSelectedProfile((profile) => {
                              profile.audio.mode = value as TranscodeAudioMode;
                            });
                          }}>
                            <Select.Trigger class="w-full">{selectedFile.profile.audio.mode}</Select.Trigger>
                            <Select.Content>
                              <Select.Item value="copy">copy</Select.Item>
                              <Select.Item value="transcode">transcode</Select.Item>
                              <Select.Item value="disable">disable</Select.Item>
                            </Select.Content>
                          </Select.Root>
                        </div>

                        <div class="space-y-2">
                          <Label>Audio encoder</Label>
                          <Select.Root type="single" value={selectedFile.profile.audio.encoderId} onValueChange={handleSelectAudioEncoder}>
                            <Select.Trigger class="w-full">{selectedAudioEncoder?.label ?? 'Select encoder'}</Select.Trigger>
                            <Select.Content>
                              {#each availableAudioEncoders as encoder (encoder.id)}
                                <Select.Item value={encoder.id}>{encoder.label}</Select.Item>
                              {/each}
                            </Select.Content>
                          </Select.Root>
                        </div>
                      </div>

                      <div class="space-y-4">
                        <div class="space-y-2">
                          <Label>Bitrate (kbps)</Label>
                          <Input
                            type="number"
                            value={selectedFile.profile.audio.bitrateKbps?.toString() ?? ''}
                            oninput={(event) => {
                              const value = parseOptionalInt(event.currentTarget.value);
                              withSelectedProfile((profile) => {
                                profile.audio.bitrateKbps = value;
                              });
                            }}
                            disabled={!selectedAudioEncoder?.supportsBitrate}
                          />
                        </div>

                        <div class="grid gap-4 xl:grid-cols-2">
                          {#if selectedAudioEncoder?.supportsChannels}
                            <div class="space-y-2">
                              <div class="rounded-md border bg-muted/20 p-3 space-y-3 min-w-0">
                                <div class="space-y-1 min-w-0">
                                  <Label>Channels</Label>
                                  <p class="text-xs text-muted-foreground break-words">
                                    Default: As source ({formatChannels(selectedAudioTrack?.channels)})
                                  </p>
                                </div>
                                <div class="flex items-center justify-between gap-3">
                                  <span class="text-xs text-muted-foreground">Override</span>
                                  <Switch
                                    checked={selectedFile.profile.audio.channels !== undefined}
                                    onCheckedChange={handleToggleAudioChannelsOverride}
                                  />
                                </div>
                              </div>

                              {#if selectedFile.profile.audio.channels !== undefined}
                                <Input
                                  type="number"
                                  value={selectedFile.profile.audio.channels?.toString() ?? ''}
                                  oninput={(event) => {
                                    const value = parseOptionalInt(event.currentTarget.value);
                                    withSelectedProfile((profile) => {
                                      profile.audio.channels = value;
                                    });
                                  }}
                                />
                              {/if}
                            </div>
                          {/if}

                          {#if selectedAudioEncoder?.supportsSampleRate}
                            <div class="space-y-2">
                              <div class="rounded-md border bg-muted/20 p-3 space-y-3 min-w-0">
                                <div class="space-y-1 min-w-0">
                                  <Label>Sample rate</Label>
                                  <p class="text-xs text-muted-foreground break-words">
                                    Default: As source ({formatSampleRate(selectedAudioTrack?.sampleRate)})
                                  </p>
                                </div>
                                <div class="flex items-center justify-between gap-3">
                                  <span class="text-xs text-muted-foreground">Override</span>
                                  <Switch
                                    checked={selectedFile.profile.audio.sampleRate !== undefined}
                                    onCheckedChange={handleToggleAudioSampleRateOverride}
                                  />
                                </div>
                              </div>

                              {#if selectedFile.profile.audio.sampleRate !== undefined}
                                <Input
                                  type="number"
                                  value={selectedFile.profile.audio.sampleRate?.toString() ?? ''}
                                  oninput={(event) => {
                                    const value = parseOptionalInt(event.currentTarget.value);
                                    withSelectedProfile((profile) => {
                                      profile.audio.sampleRate = value;
                                    });
                                  }}
                                />
                              {/if}
                            </div>
                          {/if}
                        </div>

                        <div class="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                          <p><span class="font-medium">Source codec:</span> {selectedAudioTrack?.codec.toUpperCase() ?? 'N/A'}</p>
                          <p><span class="font-medium">Channels:</span> {formatChannels(selectedAudioTrack?.channels)}</p>
                          <p><span class="font-medium">Sample rate:</span> {formatSampleRate(selectedAudioTrack?.sampleRate)}</p>
                          <p><span class="font-medium">Layout:</span> {selectedAudioTrack?.channelLayout ?? 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  {/if}

                  <Card.Root>
                    <Card.Header class="pb-3">
                      <Card.Title>Additional Overrides</Card.Title>
                      <Card.Description>Optional safe FFmpeg flags for audio transcoding.</Card.Description>
                    </Card.Header>
                    <Card.Content class="space-y-3">
                      <div class="flex flex-wrap gap-2">
                        {#each COMMON_OVERRIDE_FLAGS.audio as flag (flag)}
                          <Button variant="outline" size="sm" onclick={() => addAdditionalOverride('audio', flag)}>
                            {flag}
                          </Button>
                        {/each}
                        <Button variant="secondary" size="sm" onclick={() => addAdditionalOverride('audio')}>Add empty override</Button>
                      </div>

                      {#if selectedFile.profile.audio.additionalArgs.length === 0}
                        <p class="text-sm text-muted-foreground">No audio overrides added.</p>
                      {/if}

                      {#each selectedFile.profile.audio.additionalArgs as arg (arg.id)}
                        <div class="grid gap-2 md:grid-cols-[8rem_minmax(0,1fr)_auto_auto] items-center">
                          <Input
                            placeholder="-flag"
                            value={arg.flag}
                            oninput={(event) => updateAdditionalOverride('audio', arg.id, { flag: event.currentTarget.value })}
                          />
                          <Input
                            placeholder="Optional value"
                            value={arg.value ?? ''}
                            oninput={(event) => updateAdditionalOverride('audio', arg.id, { value: event.currentTarget.value || undefined })}
                          />
                          <div class="flex items-center gap-2">
                            <Switch
                              checked={arg.enabled}
                              onCheckedChange={(checked) => updateAdditionalOverride('audio', arg.id, { enabled: checked })}
                            />
                            <span class="text-xs text-muted-foreground">Enabled</span>
                          </div>
                          <Button variant="ghost" size="icon-sm" onclick={() => removeAdditionalOverride('audio', arg.id)}>
                            <Trash2 class="size-4" />
                          </Button>
                        </div>
                      {/each}
                    </Card.Content>
                  </Card.Root>
                </Tabs.Content>

                <Tabs.Content value="subtitles" class="space-y-4">
                  {#if selectedSubtitleTracks.length === 0}
                    <div class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      No subtitle tracks were detected in this file.
                    </div>
                  {:else}
                    <div class="grid gap-4 lg:grid-cols-2">
                      <div class="space-y-4">
                        <div class="space-y-2">
                          <Label>Subtitle mode</Label>
                          <Select.Root type="single" value={selectedFile.profile.subtitles.mode} onValueChange={(value) => {
                            withSelectedProfile((profile) => {
                              profile.subtitles.mode = value as TranscodeSubtitleMode;
                            });
                          }}>
                            <Select.Trigger class="w-full">{selectedFile.profile.subtitles.mode}</Select.Trigger>
                            <Select.Content>
                              <Select.Item value="copy">copy</Select.Item>
                              <Select.Item value="convert_text">convert_text</Select.Item>
                              <Select.Item value="disable">disable</Select.Item>
                            </Select.Content>
                          </Select.Root>
                        </div>

                        <div class="space-y-2">
                          <Label>Subtitle encoder</Label>
                          <Select.Root type="single" value={selectedFile.profile.subtitles.encoderId} onValueChange={(value) => {
                            withSelectedProfile((profile) => {
                              profile.subtitles.encoderId = value;
                            });
                          }}>
                            <Select.Trigger class="w-full">{selectedSubtitleEncoder?.label ?? 'Select encoder'}</Select.Trigger>
                            <Select.Content>
                              {#each availableSubtitleEncoders as encoder (encoder.id)}
                                <Select.Item value={encoder.id}>{encoder.label}</Select.Item>
                              {/each}
                            </Select.Content>
                          </Select.Root>
                        </div>
                      </div>

                      <div class="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
                        <p class="font-medium">Detected subtitle tracks</p>
                        {#each selectedSubtitleTracks as track (track.id)}
                          <div class="rounded-md border bg-background px-3 py-2">
                            <p>{track.codec.toUpperCase()} {track.language ? `· ${formatLanguage(track.language)}` : ''}</p>
                            <p class="text-xs text-muted-foreground">
                              {track.title ?? 'Untitled'} {track.default ? '· default' : ''} {track.forced ? '· forced' : ''}
                            </p>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/if}

                  <Card.Root>
                    <Card.Header class="pb-3">
                      <Card.Title>Additional Overrides</Card.Title>
                      <Card.Description>Optional safe FFmpeg flags for subtitle handling.</Card.Description>
                    </Card.Header>
                    <Card.Content class="space-y-3">
                      <div class="flex flex-wrap gap-2">
                        {#each COMMON_OVERRIDE_FLAGS.subtitles as flag (flag)}
                          <Button variant="outline" size="sm" onclick={() => addAdditionalOverride('subtitles', flag)}>
                            {flag}
                          </Button>
                        {/each}
                        <Button variant="secondary" size="sm" onclick={() => addAdditionalOverride('subtitles')}>Add empty override</Button>
                      </div>

                      {#if selectedFile.profile.subtitles.additionalArgs.length === 0}
                        <p class="text-sm text-muted-foreground">No subtitle overrides added.</p>
                      {/if}

                      {#each selectedFile.profile.subtitles.additionalArgs as arg (arg.id)}
                        <div class="grid gap-2 md:grid-cols-[8rem_minmax(0,1fr)_auto_auto] items-center">
                          <Input
                            placeholder="-flag"
                            value={arg.flag}
                            oninput={(event) => updateAdditionalOverride('subtitles', arg.id, { flag: event.currentTarget.value })}
                          />
                          <Input
                            placeholder="Optional value"
                            value={arg.value ?? ''}
                            oninput={(event) => updateAdditionalOverride('subtitles', arg.id, { value: event.currentTarget.value || undefined })}
                          />
                          <div class="flex items-center gap-2">
                            <Switch
                              checked={arg.enabled}
                              onCheckedChange={(checked) => updateAdditionalOverride('subtitles', arg.id, { enabled: checked })}
                            />
                            <span class="text-xs text-muted-foreground">Enabled</span>
                          </div>
                          <Button variant="ghost" size="icon-sm" onclick={() => removeAdditionalOverride('subtitles', arg.id)}>
                            <Trash2 class="size-4" />
                          </Button>
                        </div>
                      {/each}
                    </Card.Content>
                  </Card.Root>
                </Tabs.Content>

                <Tabs.Content value="output" class="space-y-4">
                  <div class="grid gap-4 lg:grid-cols-2">
                    <Card.Root>
                      <Card.Header class="pb-3">
                        <Card.Title>Container & Destination</Card.Title>
                        <Card.Description>Choose the output container and where the transcoded files will be saved.</Card.Description>
                      </Card.Header>
                      <Card.Content class="space-y-4">
                        <div class="space-y-2">
                          <Label>Container</Label>
                          <Select.Root type="single" value={selectedFile.profile.containerId} onValueChange={(value) => {
                            withSelectedProfile((profile) => {
                              profile.containerId = value;
                            });
                          }}>
                            <Select.Trigger class="w-full">{selectedContainer?.label ?? selectedFile.profile.containerId.toUpperCase()}</Select.Trigger>
                            <Select.Content>
                              {#each availableContainers as container (container.id)}
                                <Select.Item value={container.id}>{container.label}</Select.Item>
                              {/each}
                            </Select.Content>
                          </Select.Root>
                        </div>

                        <div class="space-y-2">
                          <Label>Output folder</Label>
                          <Button
                            variant="outline"
                            class="w-full justify-start gap-2 h-auto py-2 text-left"
                            onclick={handleSelectOutputDir}
                          >
                            <FolderOpen class="size-4 shrink-0" />
                            <span class="truncate flex-1 text-sm">
                              {#if outputNamingWorkspace.outputDir}
                                {outputNamingWorkspace.outputDir}
                              {:else}
                                <span class="text-muted-foreground">Use each source folder</span>
                              {/if}
                            </span>
                          </Button>
                          {#if outputNamingWorkspace.outputDir}
                            <Button
                              variant="ghost"
                              size="sm"
                              class="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
                              onclick={handleClearOutputDir}
                            >
                              Use source folders
                            </Button>
                          {/if}
                        </div>

                        <div class="space-y-2">
                          <Label>Output preview</Label>
                          <div class="rounded-md border bg-muted/20 p-3">
                            <p class="text-sm break-all">{outputPreviewPath}</p>
                          </div>
                        </div>
                      </Card.Content>
                    </Card.Root>

                    <Card.Root>
                      <Card.Header class="pb-3">
                        <Card.Title>Rename Workspace</Card.Title>
                        <Card.Description>Open the integrated renaming workspace to edit output file names before transcoding.</Card.Description>
                      </Card.Header>
                      <Card.Content class="space-y-4">
                        <div class="rounded-md border bg-muted/20 p-3 space-y-2 text-sm">
                          <div class="flex items-center justify-between">
                            <span class="text-muted-foreground">Selected outputs</span>
                            <Badge>{outputNamingWorkspace.selectedCount}</Badge>
                          </div>
                          <div class="flex items-center justify-between">
                            <span class="text-muted-foreground">Conflicts</span>
                            <Badge variant={outputConflictCount > 0 ? 'destructive' : 'secondary'}>
                              {outputConflictCount}
                            </Badge>
                          </div>
                        </div>

                        <Button class="w-full" variant="outline" onclick={() => transcodeInternalView = 'output-naming'}>
                          <FileVideo class="size-4 mr-2" />
                          Open Rename Workspace
                        </Button>

                        <div class="space-y-2">
                          <Label>Batch preview</Label>
                          <div class="rounded-md border bg-muted/20 p-3 space-y-2 max-h-56 overflow-auto">
                            {#each readyQueueFiles.slice(0, 6) as file (file.id)}
                              <div class="text-sm">
                                <p class="font-medium truncate">{file.name}</p>
                                <p class="text-xs text-muted-foreground break-all">{buildTranscodeOutputPath(file)}</p>
                              </div>
                            {:else}
                              <p class="text-sm text-muted-foreground">No ready files selected for output.</p>
                            {/each}
                          </div>
                        </div>
                      </Card.Content>
                    </Card.Root>
                  </div>
                </Tabs.Content>
              </Tabs.Root>
            </Card.Content>
          </Card.Root>
        </div>

        <div class="border-t px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-medium">Queue</p>
            <p class="text-xs text-muted-foreground">
              {readyQueueFiles.length} ready file(s)
              {#if outputConflictCount > 0}
                · {outputConflictCount} conflict(s)
              {/if}
              {#if transcodeStore.isProcessing && transcodeStore.runtimeProgress.totalFiles > 0}
                · {Math.round(transcodeStore.progress)}% overall
                {#if transcodeStore.runtimeProgress.currentSpeedBytesPerSec}
                  · {formatTransferRate(transcodeStore.runtimeProgress.currentSpeedBytesPerSec)}
                {/if}
              {/if}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <Button variant="outline" onclick={() => transcodeStore.setActiveTab('output')}>
              <FolderOpen class="size-4 mr-2" />
              Output
            </Button>

            {#if transcodeStore.isProcessing}
              <Button variant="destructive" onclick={() => void handleCancelAll()} disabled={transcodeStore.isCancelling}>
                <X class="size-4 mr-2" />
                Cancel All
              </Button>
            {:else}
              <Button onclick={() => void handleStartTranscode()} disabled={readyQueueFiles.length === 0 || outputConflictCount > 0}>
                <Play class="size-4 mr-2" />
                Start Transcode
              </Button>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<Dialog.Root bind:open={presetManagerOpen}>
  <Dialog.Content class="sm:max-w-xl">
    <Dialog.Header>
      <Dialog.Title>{getPresetTitle(activePresetTab)}</Dialog.Title>
      <Dialog.Description>{getPresetDescription(activePresetTab)}</Dialog.Description>
    </Dialog.Header>

    {#if selectedFile}
      <div class="space-y-3">
        <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <Select.Root type="single" value={getSelectedPresetId(activePresetTab)} onValueChange={(value) => setSelectedPresetId(activePresetTab, value)}>
            <Select.Trigger class="w-full">
              {getSelectedPresetId(activePresetTab)
                ? transcodeStore.getPresets(activePresetTab).find((preset) => preset.id === getSelectedPresetId(activePresetTab))?.name
                : 'Select a saved preset'}
            </Select.Trigger>
            <Select.Content>
              {#each transcodeStore.getPresets(activePresetTab) as preset (preset.id)}
                <Select.Item value={preset.id}>{preset.name}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <Button variant="outline" onclick={handleApplyPreset.bind(null, activePresetTab)} disabled={!getSelectedPresetId(activePresetTab)}>Apply</Button>
          <Button variant="ghost" onclick={() => void handleDeletePreset(activePresetTab)} disabled={!getSelectedPresetId(activePresetTab)}>Delete</Button>
        </div>

        <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            placeholder={`Save current ${activePresetTab} settings as...`}
            value={getSavePresetName(activePresetTab)}
            oninput={(event) => setSavePresetName(activePresetTab, event.currentTarget.value)}
          />
          <Button onclick={() => void handleSavePreset(activePresetTab)}>
            <Save class="size-4 mr-2" />
            Save Preset
          </Button>
        </div>
      </div>
    {:else}
      <div class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Select a file to manage presets for the active tab.
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={infoDialogOpen}>
  <Dialog.Content class="max-w-4xl">
    <Dialog.Header>
      <Dialog.Title>{infoDialogFile?.name ?? 'File information'}</Dialog.Title>
      <Dialog.Description>Important stream details detected by FFprobe.</Dialog.Description>
    </Dialog.Header>

    {#if infoDialogFile}
      <div class="max-h-[70vh] overflow-auto pr-1 space-y-4">
        <div class="grid gap-4 md:grid-cols-2">
          <Card.Root>
            <Card.Header class="pb-3">
              <Card.Title>Overview</Card.Title>
            </Card.Header>
            <Card.Content class="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Container</p>
                <p>{infoDialogFile.format ?? 'Unknown'}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Size</p>
                <p>{formatFileSize(infoDialogFile.size)}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Duration</p>
                <p>{formatDuration(infoDialogFile.duration)}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Overall bitrate</p>
                <p>{formatBitrate(infoDialogFile.bitrate)}</p>
              </div>
              <div class="sm:col-span-2">
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Path</p>
                <p class="break-all">{infoDialogFile.path}</p>
              </div>
            </Card.Content>
          </Card.Root>

          <Card.Root>
            <Card.Header class="pb-3">
              <Card.Title>Track Summary</Card.Title>
            </Card.Header>
            <Card.Content class="space-y-3 text-sm">
              <div class="flex items-center justify-between rounded-md border px-3 py-2">
                <div class="flex items-center gap-2">
                  <FileVideo class="size-4 text-primary" />
                  <span>Video</span>
                </div>
                <Badge>{getTracksByType(infoDialogFile, 'video').length}</Badge>
              </div>
              <div class="flex items-center justify-between rounded-md border px-3 py-2">
                <div class="flex items-center gap-2">
                  <Volume2 class="size-4 text-emerald-500" />
                  <span>Audio</span>
                </div>
                <Badge>{getTracksByType(infoDialogFile, 'audio').length}</Badge>
              </div>
              <div class="flex items-center justify-between rounded-md border px-3 py-2">
                <div class="flex items-center gap-2">
                  <Subtitles class="size-4 text-amber-500" />
                  <span>Subtitles</span>
                </div>
                <Badge>{getTracksByType(infoDialogFile, 'subtitle').length}</Badge>
              </div>
            </Card.Content>
          </Card.Root>
        </div>

        {#if getPrimaryVideoTrack(infoDialogFile)}
          {@const videoTrack = getPrimaryVideoTrack(infoDialogFile)}
          <Card.Root>
            <Card.Header class="pb-3">
              <Card.Title>Primary Video</Card.Title>
            </Card.Header>
            <Card.Content class="grid gap-3 md:grid-cols-3 text-sm">
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Codec</p>
                <p>{videoTrack?.codec.toUpperCase()}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Profile</p>
                <p>{videoTrack?.profile ?? 'N/A'}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Level</p>
                <p>{videoTrack?.level ?? 'N/A'}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Resolution</p>
                <p>{formatResolution(videoTrack?.width, videoTrack?.height)}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Frame rate</p>
                <p>{formatFrameRate(videoTrack?.frameRate)}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Bitrate</p>
                <p>{formatBitrate(videoTrack?.bitrate)}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Pixel format</p>
                <p>{videoTrack?.pixelFormat ?? 'N/A'}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Bit depth</p>
                <p>{formatBitDepth(videoTrack)}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Aspect ratio</p>
                <p>{videoTrack?.aspectRatio ?? 'N/A'}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Color range</p>
                <p>{videoTrack?.colorRange ?? 'N/A'}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Color space</p>
                <p>{videoTrack?.colorSpace ?? 'N/A'}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Transfer / Primaries</p>
                <p>{videoTrack?.colorTransfer ?? 'N/A'} / {videoTrack?.colorPrimaries ?? 'N/A'}</p>
              </div>
            </Card.Content>
          </Card.Root>
        {/if}

        {#if getPrimaryAudioTrack(infoDialogFile)}
          {@const audioTrack = getPrimaryAudioTrack(infoDialogFile)}
          <Card.Root>
            <Card.Header class="pb-3">
              <Card.Title>Primary Audio</Card.Title>
            </Card.Header>
            <Card.Content class="grid gap-3 md:grid-cols-3 text-sm">
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Codec</p>
                <p>{audioTrack?.codec.toUpperCase()}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Language</p>
                <p>{formatLanguage(audioTrack?.language)}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Bitrate</p>
                <p>{formatBitrate(audioTrack?.bitrate)}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Channels</p>
                <p>{formatChannels(audioTrack?.channels)}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Sample rate</p>
                <p>{formatSampleRate(audioTrack?.sampleRate)}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-muted-foreground">Format / Layout</p>
                <p>{audioTrack?.sampleFormat ?? 'N/A'} / {audioTrack?.channelLayout ?? 'N/A'}</p>
              </div>
            </Card.Content>
          </Card.Root>
        {/if}

        {#if getTracksByType(infoDialogFile, 'subtitle').length > 0}
          <Card.Root>
            <Card.Header class="pb-3">
              <Card.Title>Subtitles</Card.Title>
            </Card.Header>
            <Card.Content class="space-y-2">
              {#each getTracksByType(infoDialogFile, 'subtitle') as track (track.id)}
                <div class="rounded-md border px-3 py-2 text-sm">
                  <div class="flex items-center justify-between gap-3">
                    <p class="font-medium">{track.codec.toUpperCase()}</p>
                    <div class="flex items-center gap-2">
                      {#if track.default}
                        <Badge variant="outline">default</Badge>
                      {/if}
                      {#if track.forced}
                        <Badge variant="outline">forced</Badge>
                      {/if}
                    </div>
                  </div>
                  <p class="text-xs text-muted-foreground mt-1">
                    {track.title ?? 'Untitled'} {track.language ? `· ${formatLanguage(track.language)}` : ''}
                  </p>
                </div>
              {/each}
            </Card.Content>
          </Card.Root>
        {/if}

        <Card.Root>
          <Card.Header class="pb-3">
            <Card.Title>Readable FFprobe Summary</Card.Title>
          </Card.Header>
          <Card.Content>
            <Textarea value={buildReadableProbeSummary(infoDialogFile)} readonly class="min-h-40 text-xs font-mono" />
          </Card.Content>
        </Card.Root>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
