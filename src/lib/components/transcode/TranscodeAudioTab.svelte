<script lang="ts">
  import { Settings2 } from '@lucide/svelte';

  import type {
    Track,
    TranscodeAudioEncoderCapability,
    TranscodeAudioMode,
    TranscodeContainerCapability,
    TranscodeFile,
  } from '$lib/types';
  import type { TranscodeModeOption } from '$lib/services/transcode';
  import { Button } from '$lib/components/ui/button';

  import TranscodeAdditionalOverrides from './TranscodeAdditionalOverrides.svelte';
  import TranscodeAudioSettingsForm from './TranscodeAudioSettingsForm.svelte';
  import TranscodeAudioTrackOverridesDialog from './TranscodeAudioTrackOverridesDialog.svelte';
  import type { TranscodeProfileUpdater } from './types';

  interface Props {
    file: TranscodeFile;
    audioTracks: Track[];
    selectedAudioTrack: Track | null;
    selectedAudioEncoder: TranscodeAudioEncoderCapability | null;
    selectedContainer: TranscodeContainerCapability | null;
    availableAudioModeOptions: TranscodeModeOption<TranscodeAudioMode>[];
    availableAudioEncoders: TranscodeAudioEncoderCapability[];
    commonOverrideFlags: string[];
    updateProfile: TranscodeProfileUpdater;
    createId: (prefix: string) => string;
  }

  let {
    file,
    audioTracks,
    selectedAudioTrack,
    selectedAudioEncoder,
    selectedContainer,
    availableAudioModeOptions,
    availableAudioEncoders,
    commonOverrideFlags,
    updateProfile,
    createId,
  }: Props = $props();

  let trackOverridesDialogOpen = $state(false);

  const hasMultipleAudioTracks = $derived(audioTracks.length > 1);
  const customOverrideCount = $derived(file.profile.audio.trackOverrides.length);
  const audioTrackCountLabel = $derived(`${audioTracks.length} audio track${audioTracks.length === 1 ? '' : 's'} detected`);
  const customOverrideLabel = $derived(
    customOverrideCount === 0
      ? 'All tracks currently inherit the global audio settings.'
      : `${customOverrideCount} custom override${customOverrideCount === 1 ? '' : 's'} configured.`,
  );
</script>

{#if !file.hasAudio}
  <div class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
    No audio stream was detected in this file.
  </div>
{:else}
  <div class="space-y-4">
    {#if hasMultipleAudioTracks}
      <div class="rounded-lg border bg-muted/20 p-3">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 space-y-1.5">
            <div class="flex items-start gap-2.5">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Settings2 class="size-4" />
              </div>

              <div class="min-w-0">
                <p class="text-sm font-medium">Per-track audio overrides</p>
                <p class="text-sm text-muted-foreground">
                  Adjust individual tracks without changing the global audio settings below.
                </p>
              </div>
            </div>

            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <p>{audioTrackCountLabel}</p>
              <p>{customOverrideLabel}</p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            class="w-full shrink-0 sm:w-auto"
            onclick={() => trackOverridesDialogOpen = true}
          >
            <Settings2 class="mr-2 size-4" />
            Open 
          </Button>
        </div>
      </div>
    {/if}

    <TranscodeAudioSettingsForm
      settings={file.profile.audio}
      sourceTrack={selectedAudioTrack}
      showSourceTrackDetails={!hasMultipleAudioTracks}
      selectedEncoder={selectedAudioEncoder}
      modeOptions={availableAudioModeOptions}
      availableAudioEncoders={availableAudioEncoders}
      copyMessage="Audio streams will be copied without re-encoding."
      disableMessage="Audio streams are disabled for this output."
      inactiveMessage={`Encoder bitrate and stream overrides are not used while audio mode is ${file.profile.audio.mode}.`}
      onModeChange={(mode) => {
        updateProfile((profile) => {
          profile.audio.mode = mode as TranscodeAudioMode;
        });
      }}
      onEncoderChange={(encoderId) => {
        updateProfile((profile) => {
          profile.audio.encoderId = encoderId;
        });
      }}
      onBitrateChange={(value) => {
        updateProfile((profile) => {
          profile.audio.bitrateKbps = value;
        });
      }}
      onChannelsChange={(value) => {
        updateProfile((profile) => {
          profile.audio.channels = value;
        });
      }}
      onSampleRateChange={(value) => {
        updateProfile((profile) => {
          profile.audio.sampleRate = value;
        });
      }}
    />
  </div>
{/if}

{#if file.hasAudio && file.profile.audio.mode === 'transcode'}
  <TranscodeAdditionalOverrides
    tab="audio"
    title="Additional Overrides"
    description="Optional safe FFmpeg flags for audio transcoding."
    emptyMessage="No audio overrides added."
    commonFlags={commonOverrideFlags}
    args={file.profile.audio.additionalArgs}
    createId={createId}
    updateProfile={updateProfile}
  />
{/if}

<TranscodeAudioTrackOverridesDialog
  bind:open={trackOverridesDialogOpen}
  file={file}
  audioTracks={audioTracks}
  selectedContainer={selectedContainer}
  availableAudioEncoders={availableAudioEncoders}
  commonOverrideFlags={commonOverrideFlags}
  createId={createId}
  updateProfile={updateProfile}
/>
