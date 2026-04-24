<script lang="ts">
  import type {
    Track,
    TranscodeFile,
    TranscodeQualityMode,
    TranscodeVideoEncoderCapability,
    TranscodeVideoMode,
  } from '$lib/types';
  import {
    getDefaultVideoPresetValue,
    hasManualVideoQualityControls,
    type TranscodeModeOption,
    type TranscodePresetOption,
  } from '$lib/services/transcode';
  import { formatResolution } from '$lib/utils/format';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Select from '$lib/components/ui/select';

  import TranscodeAdditionalOverrides from './TranscodeAdditionalOverrides.svelte';
  import type { TranscodeProfileUpdater } from './types';

  interface Props {
    file: TranscodeFile;
    selectedVideoTrack: Track | null;
    selectedVideoEncoder: TranscodeVideoEncoderCapability | null;
    availableVideoModeOptions: TranscodeModeOption<TranscodeVideoMode>[];
    availableVideoEncoders: TranscodeVideoEncoderCapability[];
    videoProfileOptions: string[];
    videoLevelOptions: string[];
    videoPixelFormatOptions: string[];
    videoPresetOptions: TranscodePresetOption[];
    updateProfile: TranscodeProfileUpdater;
    createId: (prefix: string) => string;
  }

  let {
    file,
    selectedVideoTrack,
    selectedVideoEncoder,
    availableVideoModeOptions,
    availableVideoEncoders,
    videoProfileOptions,
    videoLevelOptions,
    videoPixelFormatOptions,
    videoPresetOptions,
    updateProfile,
    createId,
  }: Props = $props();

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

  function formatBitDepth(track?: Track | null): string {
    if (!track?.derivedBitDepth) return 'N/A';
    return `${track.derivedBitDepth}-bit`;
  }

  const selectedPresetValue = $derived(
    file.profile.video.preset ?? getDefaultVideoPresetValue(selectedVideoEncoder?.id) ?? '',
  );
  const hasManualQualityControls = $derived(hasManualVideoQualityControls(selectedVideoEncoder));
</script>

{#if !file.hasVideo}
  <div class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
    This file is audio-only, so video transcoding is disabled.
  </div>
{:else}
  <div class="grid gap-4 lg:grid-cols-2">
    <div class="space-y-4">
      <div class="space-y-2">
        <Label>Video mode</Label>
        <Select.Root
          type="single"
          value={file.profile.video.mode}
          onValueChange={(value) => {
            updateProfile((profile) => {
              profile.video.mode = value as TranscodeVideoMode;
            });
          }}
        >
          <Select.Trigger class="w-full">{file.profile.video.mode}</Select.Trigger>
          <Select.Content>
            <Select.Group>
              {#each availableVideoModeOptions as option (option.value)}
                <Select.Item value={option.value}>{option.label}</Select.Item>
              {/each}
            </Select.Group>
          </Select.Content>
        </Select.Root>
      </div>

      {#if file.profile.video.mode === 'transcode'}
        <div class="space-y-2">
          <Label>Video encoder</Label>
          <Select.Root
            type="single"
            value={file.profile.video.encoderId}
            onValueChange={(value) => {
              updateProfile((profile) => {
                profile.video.encoderId = value;
                profile.video.preset = getDefaultVideoPresetValue(value);
              });
            }}
          >
            <Select.Trigger class="w-full">{selectedVideoEncoder?.label ?? 'Select encoder'}</Select.Trigger>
            <Select.Content>
              <Select.Group>
                {#each availableVideoEncoders as encoder (encoder.id)}
                  <Select.Item value={encoder.id}>{encoder.label}</Select.Item>
                {/each}
              </Select.Group>
            </Select.Content>
          </Select.Root>
        </div>

        {#if videoProfileOptions.length > 0 || videoLevelOptions.length > 0}
          <div class="grid gap-4 md:grid-cols-2">
            {#if videoProfileOptions.length > 0}
              <div class="space-y-2">
                <Label>Profile</Label>
                <Select.Root
                  type="single"
                  value={file.profile.video.profile}
                  onValueChange={(value) => {
                    updateProfile((profile) => {
                      profile.video.profile = value;
                    });
                  }}
                >
                  <Select.Trigger class="w-full">{file.profile.video.profile ?? 'Auto'}</Select.Trigger>
                  <Select.Content>
                    <Select.Group>
                      {#each videoProfileOptions as profile (profile)}
                        <Select.Item value={profile}>{profile}</Select.Item>
                      {/each}
                    </Select.Group>
                  </Select.Content>
                </Select.Root>
              </div>
            {/if}

            {#if videoLevelOptions.length > 0}
              <div class="space-y-2">
                <Label>Level</Label>
                <Select.Root
                  type="single"
                  value={file.profile.video.level}
                  onValueChange={(value) => {
                    updateProfile((profile) => {
                      profile.video.level = value;
                    });
                  }}
                >
                  <Select.Trigger class="w-full">{file.profile.video.level ?? 'Auto'}</Select.Trigger>
                  <Select.Content>
                    <Select.Group>
                      {#each videoLevelOptions as level (level)}
                        <Select.Item value={level}>{level}</Select.Item>
                      {/each}
                    </Select.Group>
                  </Select.Content>
                </Select.Root>
              </div>
            {/if}
          </div>
        {/if}

        {#if videoPixelFormatOptions.length > 0}
          <div class="space-y-2">
            <Label>Pixel format</Label>
            <Select.Root
              type="single"
              value={file.profile.video.pixelFormat}
              onValueChange={(value) => {
                updateProfile((profile) => {
                  profile.video.pixelFormat = value;
                });
              }}
            >
              <Select.Trigger class="w-full">{file.profile.video.pixelFormat ?? 'Auto'}</Select.Trigger>
              <Select.Content>
                <Select.Group>
                  {#each videoPixelFormatOptions as pixelFormat (pixelFormat)}
                    <Select.Item value={pixelFormat}>{pixelFormat}</Select.Item>
                  {/each}
                </Select.Group>
              </Select.Content>
            </Select.Root>
            {#if selectedVideoEncoder?.supportedBitDepths?.length}
              <p class="text-xs text-muted-foreground">
                Supported bit depths: {selectedVideoEncoder.supportedBitDepths.join(', ')}-bit
              </p>
            {/if}
          </div>
        {/if}
      {:else}
        <div class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {file.profile.video.mode === 'copy'
            ? 'Video streams will be copied without re-encoding.'
            : 'Video streams are disabled for this output.'}
        </div>
      {/if}
    </div>

    <div class="space-y-4">
      {#if file.profile.video.mode === 'transcode'}
        {#if hasManualQualityControls}
          <div class="space-y-2">
            <Label>Quality mode</Label>
            <Select.Root
              type="single"
              value={file.profile.video.qualityMode}
              onValueChange={(value) => {
                updateProfile((profile) => {
                  profile.video.qualityMode = value as TranscodeQualityMode;
                });
              }}
            >
              <Select.Trigger class="w-full">{file.profile.video.qualityMode}</Select.Trigger>
              <Select.Content>
                <Select.Group>
                  {#if selectedVideoEncoder?.supportsCrf}
                    <Select.Item value="crf">crf</Select.Item>
                  {/if}
                  {#if selectedVideoEncoder?.supportsQp}
                    <Select.Item value="qp">qp</Select.Item>
                  {/if}
                  {#if selectedVideoEncoder?.supportsBitrate}
                    <Select.Item value="bitrate">bitrate</Select.Item>
                  {/if}
                </Select.Group>
              </Select.Content>
            </Select.Root>
          </div>

          {#if file.profile.video.qualityMode === 'crf'}
            <div class="space-y-2">
              <Label>CRF</Label>
              <Input
                type="number"
                value={file.profile.video.crf?.toString() ?? ''}
                oninput={(event) => {
                  const value = parseOptionalFloat(event.currentTarget.value);
                  updateProfile((profile) => {
                    profile.video.crf = value;
                  });
                }}
              />
            </div>
          {:else if file.profile.video.qualityMode === 'qp'}
            <div class="space-y-2">
              <Label>QP</Label>
              <Input
                type="number"
                value={file.profile.video.qp?.toString() ?? ''}
                oninput={(event) => {
                  const value = parseOptionalInt(event.currentTarget.value);
                  updateProfile((profile) => {
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
                value={file.profile.video.bitrateKbps?.toString() ?? ''}
                oninput={(event) => {
                  const value = parseOptionalInt(event.currentTarget.value);
                  updateProfile((profile) => {
                    profile.video.bitrateKbps = value;
                  });
                }}
              />
            </div>
          {/if}
        {:else}
          <div class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            This encoder manages quality automatically.
          </div>
        {/if}

        {#if videoPresetOptions.length > 0}
          <div class="space-y-2">
            <Label>Preset</Label>
            <Select.Root
              type="single"
              value={selectedPresetValue}
              onValueChange={(value) => {
                updateProfile((profile) => {
                  profile.video.preset = value || undefined;
                });
              }}
            >
              <Select.Trigger class="w-full">
                {videoPresetOptions.find((option) => option.value === selectedPresetValue)?.label ?? 'Select preset'}
              </Select.Trigger>
              <Select.Content>
                <Select.Group>
                  {#each videoPresetOptions as option (option.value)}
                    <Select.Item value={option.value}>{option.label}</Select.Item>
                  {/each}
                </Select.Group>
              </Select.Content>
            </Select.Root>
          </div>
        {/if}
      {:else}
        <div class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Encoder quality settings are not used while video mode is {file.profile.video.mode}.
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

{#if file.hasVideo && file.profile.video.mode === 'transcode'}
  <TranscodeAdditionalOverrides
    tab="video"
    title="Additional Overrides"
    description="Optional safe FFmpeg flags for the current video encoder."
    emptyMessage="No video overrides added."
    encoderOptions={selectedVideoEncoder?.options ?? []}
    args={file.profile.video.additionalArgs}
    createId={createId}
    updateProfile={updateProfile}
  />
{/if}
