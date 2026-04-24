<script lang="ts">
  import { Settings2 } from '@lucide/svelte';

  import type {
    Track,
    TranscodeAdditionalArg,
    TranscodeAudioEncoderCapability,
    TranscodeAudioTrackOverride,
    TranscodeContainerCapability,
    TranscodeFile,
    TranscodeAudioMode,
  } from '$lib/types';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Separator } from '$lib/components/ui/separator';
  import { Switch } from '$lib/components/ui/switch';
  import {
    cloneAudioTrackOverride,
    cloneAudioTrackOverrides,
    getAvailableAudioTrackModeOptions,
    getEffectiveAudioSettingsForTrack,
  } from '$lib/services/transcode';
  import { formatLanguage } from '$lib/utils/format';
  import { cn } from '$lib/utils';

  import type { TranscodeProfileUpdater } from './types';
  import TranscodeAdditionalOverrides from './TranscodeAdditionalOverrides.svelte';
  import TranscodeAudioSettingsForm from './TranscodeAudioSettingsForm.svelte';

  interface Props {
    open: boolean;
    file: TranscodeFile | null;
    audioTracks: Track[];
    selectedContainer: TranscodeContainerCapability | null;
    availableAudioEncoders: TranscodeAudioEncoderCapability[];
    createId: (prefix: string) => string;
    updateProfile: TranscodeProfileUpdater;
  }

  let {
    open = $bindable(),
    file,
    audioTracks,
    selectedContainer,
    availableAudioEncoders,
    createId,
    updateProfile,
  }: Props = $props();

  let draftTrackOverrides = $state<TranscodeAudioTrackOverride[]>([]);
  let selectedTrackId = $state<number | null>(null);

  const selectedTrack = $derived.by(() =>
    audioTracks.find((track) => track.id === selectedTrackId) ?? audioTracks[0] ?? null,
  );
  const selectedTrackOverride = $derived.by(() =>
    selectedTrack ? draftTrackOverrides.find((trackOverride) => trackOverride.trackId === selectedTrack.id) ?? null : null,
  );
  const selectedTrackEffectiveSettings = $derived.by(() =>
    selectedTrack && file
      ? {
        ...getEffectiveAudioSettingsForTrack({
          ...file.profile.audio,
          trackOverrides: draftTrackOverrides,
        }, selectedTrack.id),
      }
      : null,
  );
  const selectedTrackEncoder = $derived.by(() =>
    selectedTrackEffectiveSettings
      ? availableAudioEncoders.find((encoder) => encoder.id === selectedTrackEffectiveSettings.encoderId) ?? null
      : null,
  );
  const selectedTrackModeOptions = $derived.by(() =>
    getAvailableAudioTrackModeOptions(selectedTrack, selectedContainer),
  );

  $effect(() => {
    if (!open) {
      return;
    }

    const initialTrackOverrides = cloneAudioTrackOverrides(file?.profile.audio.trackOverrides ?? []);
    const initialSelectedTrackId = initialTrackOverrides[0]?.trackId ?? audioTracks[0]?.id ?? null;

    draftTrackOverrides = initialTrackOverrides;
    selectedTrackId = initialSelectedTrackId;
  });

  function getTrackLabel(track: Track): string {
    const position = audioTracks.findIndex((item) => item.id === track.id);
    return position >= 0 ? `Track ${position + 1}` : 'Track';
  }

  function getTrackDescription(track: Track): string {
    const details = [track.codec.toUpperCase()];
    if (track.language) {
      details.push(formatLanguage(track.language));
    }
    return details.join(' · ');
  }

  function getTrackMeta(track: Track): string {
    const parts = [track.title?.trim() || 'Untitled'];
    if (track.default) {
      parts.push('default');
    }
    return parts.join(' · ');
  }

  function getDraftOverride(trackId: number): TranscodeAudioTrackOverride | undefined {
    return draftTrackOverrides.find((trackOverride) => trackOverride.trackId === trackId);
  }

  function hasDraftOverride(trackId: number): boolean {
    return Boolean(getDraftOverride(trackId));
  }

  function getDraftEffectiveSettings(trackId: number): TranscodeAudioTrackOverride | null {
    if (!file) {
      return null;
    }

    return cloneAudioTrackOverride(
      getEffectiveAudioSettingsForTrack({
        ...file.profile.audio,
        trackOverrides: draftTrackOverrides,
      }, trackId),
    );
  }

  function upsertTrackOverride(trackId: number, updates: Partial<TranscodeAudioTrackOverride>): void {
    const effectiveSettings = getDraftEffectiveSettings(trackId);
    if (!effectiveSettings) {
      return;
    }

    const nextOverride = {
      ...effectiveSettings,
      ...updates,
      trackId,
      source: 'user' as const,
      reason: undefined,
    };

    if (hasDraftOverride(trackId)) {
      draftTrackOverrides = draftTrackOverrides.map((trackOverride) =>
        trackOverride.trackId === trackId ? nextOverride : trackOverride,
      );
      return;
    }

    draftTrackOverrides = [...draftTrackOverrides, nextOverride];
  }

  function removeTrackOverride(trackId: number): void {
    draftTrackOverrides = draftTrackOverrides.filter((trackOverride) => trackOverride.trackId !== trackId);
  }

  function setCustomEnabled(trackId: number, enabled: boolean): void {
    if (!enabled) {
      removeTrackOverride(trackId);
      return;
    }

    const effectiveSettings = getDraftEffectiveSettings(trackId);
    if (!effectiveSettings) {
      return;
    }

    upsertTrackOverride(trackId, effectiveSettings);
  }

  function getTrackModeSummary(trackId: number): string {
    const settings = getDraftEffectiveSettings(trackId);
    if (!settings) {
      return 'No audio settings';
    }

    if (settings.mode !== 'transcode') {
      return settings.mode;
    }

    const encoder = availableAudioEncoders.find((item) => item.id === settings.encoderId);
    return encoder?.label ?? settings.encoderId ?? 'transcode';
  }

  function handleApply(): void {
    if (!file) {
      open = false;
      return;
    }

    updateProfile((profile) => {
      profile.audio.trackOverrides = cloneAudioTrackOverrides(draftTrackOverrides);
    });
    open = false;
  }

  function handleTrackModeChange(mode: TranscodeAudioMode): void {
    if (!selectedTrack) {
      return;
    }

    upsertTrackOverride(selectedTrack.id, { mode });
  }

  function handleTrackAdditionalOverrideAdd(flag?: string): string | void {
    if (!selectedTrack || !selectedTrackOverride) {
      return;
    }

    const argId = createId('transcode-arg-audio-track');
    const nextAdditionalArgs: TranscodeAdditionalArg[] = [
      ...(selectedTrackOverride.additionalArgs ?? []),
      {
        id: argId,
        flag: flag ?? '',
        value: '',
        enabled: true,
        source: 'user',
      },
    ];

    upsertTrackOverride(selectedTrack.id, { additionalArgs: nextAdditionalArgs });
    return argId;
  }

  function handleTrackAdditionalOverrideUpdate(
    argId: string,
    updates: Partial<TranscodeAdditionalArg>,
  ): void {
    if (!selectedTrack || !selectedTrackOverride) {
      return;
    }

    upsertTrackOverride(selectedTrack.id, {
      additionalArgs: (selectedTrackOverride.additionalArgs ?? []).map((arg) =>
        arg.id === argId ? { ...arg, ...updates } : arg,
      ),
    });
  }

  function handleTrackAdditionalOverrideRemove(argId: string): void {
    if (!selectedTrack || !selectedTrackOverride) {
      return;
    }

    upsertTrackOverride(selectedTrack.id, {
      additionalArgs: (selectedTrackOverride.additionalArgs ?? []).filter((arg) => arg.id !== argId),
    });
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-5xl flex h-[85vh] max-h-[85vh] flex-col overflow-hidden">
    <Dialog.Header class="shrink-0">
      <Dialog.Title class="flex items-center gap-2">
        <Settings2 class="size-5" />
        Track Overrides
      </Dialog.Title>
      <Dialog.Description>
        Override audio settings per track while keeping the current global audio profile as the default.
      </Dialog.Description>
    </Dialog.Header>

    {#if file && audioTracks.length > 0}
      <div class="flex min-h-0 flex-1 flex-col gap-4 py-2 lg:flex-row">
        <div class="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-muted/20 p-3 lg:w-72 lg:flex-none">
          <div class="mb-3 flex items-center justify-between gap-3">
            <p class="text-sm font-medium">Detected audio tracks</p>
            <Badge variant="outline">{audioTracks.length}</Badge>
          </div>

          <div class="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {#each audioTracks as track (track.id)}
              {@const isSelected = selectedTrack?.id === track.id}
              {@const isCustom = hasDraftOverride(track.id)}
              <button
                class={cn(
                  'w-full rounded-lg border bg-background px-3 py-2 text-left transition-colors',
                  isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                )}
                onclick={() => selectedTrackId = track.id}
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium">{getTrackLabel(track)} · {getTrackDescription(track)}</p>
                    <p class="truncate text-xs text-muted-foreground">{getTrackMeta(track)}</p>
                    <p class="truncate text-xs text-muted-foreground">{getTrackModeSummary(track.id)}</p>
                  </div>

                  <Badge variant={isCustom ? 'default' : 'outline'}>
                    {isCustom ? 'Custom' : 'Global'}
                  </Badge>
                </div>
              </button>
            {/each}
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-auto">
          <div class="h-full min-h-0 px-4">
            {#if selectedTrack && selectedTrackEffectiveSettings}
              <div class="space-y-4 pb-1">
                <div class="rounded-lg border bg-muted/20 p-4">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p class="text-sm font-medium">{getTrackLabel(selectedTrack)}</p>
                      <p class="text-sm text-muted-foreground">{getTrackDescription(selectedTrack)}</p>
                    </div>

                    <Badge variant={selectedTrackOverride ? 'default' : 'outline'}>
                      {selectedTrackOverride ? 'Custom' : 'Global'}
                    </Badge>
                  </div>

                  <div class="mt-4 flex flex-wrap items-center gap-3">
                    <label class="flex items-center gap-2 text-sm">
                      <Switch
                        checked={Boolean(selectedTrackOverride)}
                        onCheckedChange={(checked) => setCustomEnabled(selectedTrack.id, checked)}
                      />
                      <span>Use custom settings for this track</span>
                    </label>

                    <Button
                      variant="outline"
                      size="sm"
                      onclick={() => removeTrackOverride(selectedTrack.id)}
                      disabled={!selectedTrackOverride}
                    >
                      Reset to global
                    </Button>
                  </div>
                </div>

                {#if selectedTrackOverride}
                  <TranscodeAudioSettingsForm
                    settings={selectedTrackEffectiveSettings}
                    sourceTrack={selectedTrack}
                    selectedEncoder={selectedTrackEncoder}
                    modeOptions={selectedTrackModeOptions}
                    availableAudioEncoders={availableAudioEncoders}
                    copyMessage="This track will be copied without re-encoding."
                    disableMessage="This track is disabled for this output."
                    inactiveMessage={`Encoder bitrate and stream overrides are not used while this track is ${selectedTrackEffectiveSettings.mode}.`}
                    onModeChange={handleTrackModeChange}
                    onEncoderChange={(encoderId) => upsertTrackOverride(selectedTrack.id, { encoderId })}
                    onBitrateChange={(value) => upsertTrackOverride(selectedTrack.id, { bitrateKbps: value })}
                    onChannelsChange={(value) => upsertTrackOverride(selectedTrack.id, { channels: value })}
                    onSampleRateChange={(value) => upsertTrackOverride(selectedTrack.id, { sampleRate: value })}
                  />

                  {#if selectedTrackEffectiveSettings.mode === 'transcode'}
                    <TranscodeAdditionalOverrides
                      title="Additional Overrides"
                      description="Optional safe FFmpeg flags applied only to this track."
                      emptyMessage="No per-track audio overrides added."
                      encoderOptions={selectedTrackEncoder?.options ?? []}
                      args={selectedTrackOverride.additionalArgs ?? []}
                      onAddOverride={handleTrackAdditionalOverrideAdd}
                      onUpdateOverride={handleTrackAdditionalOverrideUpdate}
                      onRemoveOverride={handleTrackAdditionalOverrideRemove}
                    />
                  {/if}
                {:else}
                  <div class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground space-y-2">
                    <p>This track currently inherits the global audio settings from the Audio tab.</p>
                    <Separator />
                    <div class="grid gap-2 text-foreground sm:grid-cols-2">
                      <p><span class="font-medium">Mode:</span> {selectedTrackEffectiveSettings.mode}</p>
                      <p><span class="font-medium">Encoder:</span> {selectedTrackEncoder?.label ?? selectedTrackEffectiveSettings.encoderId ?? 'N/A'}</p>
                      <p><span class="font-medium">Bitrate:</span> {selectedTrackEffectiveSettings.bitrateKbps ? `${selectedTrackEffectiveSettings.bitrateKbps} kbps` : 'Source / automatic'}</p>
                      <p><span class="font-medium">Channels:</span> {selectedTrackEffectiveSettings.channels ?? 'Source / automatic'}</p>
                      <p><span class="font-medium">Sample rate:</span> {selectedTrackEffectiveSettings.sampleRate ? `${selectedTrackEffectiveSettings.sampleRate} Hz` : 'Source / automatic'}</p>
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </div>

      <Dialog.Footer class="shrink-0">
        <Button variant="outline" onclick={() => open = false}>
          Cancel
        </Button>
        <Button onclick={handleApply}>
          Apply
        </Button>
      </Dialog.Footer>
    {:else}
      <div class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        No audio tracks were detected in this file.
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
