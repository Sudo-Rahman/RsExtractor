<script lang="ts">
  import type { Track, TranscodeAudioEncoderCapability, TranscodeFile, TranscodeAudioMode } from '$lib/types';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Switch } from '$lib/components/ui/switch';
  import * as Select from '$lib/components/ui/select';

  import TranscodeAdditionalOverrides from './TranscodeAdditionalOverrides.svelte';
  import type { TranscodeProfileUpdater } from './types';
  import { formatChannels } from '$lib/utils/format';

  interface Props {
    file: TranscodeFile;
    selectedAudioTrack: Track | null;
    selectedAudioEncoder: TranscodeAudioEncoderCapability | null;
    availableAudioEncoders: TranscodeAudioEncoderCapability[];
    commonOverrideFlags: string[];
    updateProfile: TranscodeProfileUpdater;
    createId: (prefix: string) => string;
  }

  let {
    file,
    selectedAudioTrack,
    selectedAudioEncoder,
    availableAudioEncoders,
    commonOverrideFlags,
    updateProfile,
    createId,
  }: Props = $props();

  function parseOptionalInt(value: string): number | undefined {
    if (!value.trim()) return undefined;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function formatSampleRate(value?: number): string {
    if (!value) return 'N/A';
    return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)} kHz`;
  }

  const isBitrateDisabled = $derived(!selectedAudioEncoder?.supportsBitrate || selectedAudioEncoder?.codec === 'flac');
</script>

{#if !file.hasAudio}
  <div class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
    No audio stream was detected in this file.
  </div>
{:else}
  <div class="grid gap-4 lg:grid-cols-2">
    <div class="space-y-4">
      <div class="space-y-2">
        <Label>Audio mode</Label>
        <Select.Root
          type="single"
          value={file.profile.audio.mode}
          onValueChange={(value) => {
            updateProfile((profile) => {
              profile.audio.mode = value as TranscodeAudioMode;
            });
          }}
        >
          <Select.Trigger class="w-full">{file.profile.audio.mode}</Select.Trigger>
          <Select.Content>
            <Select.Item value="copy">copy</Select.Item>
            <Select.Item value="transcode">transcode</Select.Item>
            <Select.Item value="disable">disable</Select.Item>
          </Select.Content>
        </Select.Root>
      </div>

      {#if file.profile.audio.mode === 'transcode'}
        <div class="space-y-2">
          <Label>Audio encoder</Label>
          <Select.Root
            type="single"
            value={file.profile.audio.encoderId}
            onValueChange={(value) => {
              updateProfile((profile) => {
                profile.audio.encoderId = value;
              });
            }}
          >
            <Select.Trigger class="w-full">{selectedAudioEncoder?.label ?? 'Select encoder'}</Select.Trigger>
            <Select.Content>
              {#each availableAudioEncoders as encoder (encoder.id)}
                <Select.Item value={encoder.id}>{encoder.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      {:else}
        <div class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {file.profile.audio.mode === 'copy'
            ? 'Audio streams will be copied without re-encoding.'
            : 'Audio streams are disabled for this output.'}
        </div>
      {/if}
    </div>

    <div class="space-y-4">
      {#if file.profile.audio.mode === 'transcode'}
        <div class="space-y-2">
          <Label>Bitrate (kbps)</Label>
          <Input
            type="number"
            value={file.profile.audio.bitrateKbps?.toString() ?? ''}
            oninput={(event) => {
              const value = parseOptionalInt(event.currentTarget.value);
              updateProfile((profile) => {
                profile.audio.bitrateKbps = value;
              });
            }}
            disabled={isBitrateDisabled}
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
                    checked={file.profile.audio.channels !== undefined}
                    onCheckedChange={(checked) => {
                      updateProfile((profile) => {
                        profile.audio.channels = checked
                          ? (profile.audio.channels ?? selectedAudioTrack?.channels ?? 2)
                          : undefined;
                      });
                    }}
                  />
                </div>
              </div>

              {#if file.profile.audio.channels !== undefined}
                <Input
                  type="number"
                  value={file.profile.audio.channels?.toString() ?? ''}
                  oninput={(event) => {
                    const value = parseOptionalInt(event.currentTarget.value);
                    updateProfile((profile) => {
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
                    checked={file.profile.audio.sampleRate !== undefined}
                    onCheckedChange={(checked) => {
                      updateProfile((profile) => {
                        profile.audio.sampleRate = checked
                          ? (profile.audio.sampleRate ?? selectedAudioTrack?.sampleRate ?? 48000)
                          : undefined;
                      });
                    }}
                  />
                </div>
              </div>

              {#if file.profile.audio.sampleRate !== undefined}
                <Input
                  type="number"
                  value={file.profile.audio.sampleRate?.toString() ?? ''}
                  oninput={(event) => {
                    const value = parseOptionalInt(event.currentTarget.value);
                    updateProfile((profile) => {
                      profile.audio.sampleRate = value;
                    });
                  }}
                />
              {/if}
            </div>
          {/if}
        </div>
      {:else}
        <div class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Encoder bitrate and stream overrides are not used while audio mode is {file.profile.audio.mode}.
        </div>
      {/if}

      <div class="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
        <p><span class="font-medium">Source codec:</span> {selectedAudioTrack?.codec.toUpperCase() ?? 'N/A'}</p>
        <p><span class="font-medium">Channels:</span> {formatChannels(selectedAudioTrack?.channels)}</p>
        <p><span class="font-medium">Sample rate:</span> {formatSampleRate(selectedAudioTrack?.sampleRate)}</p>
        <p><span class="font-medium">Layout:</span> {selectedAudioTrack?.channelLayout ?? 'N/A'}</p>
      </div>
    </div>
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
