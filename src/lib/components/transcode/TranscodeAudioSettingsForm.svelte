<script lang="ts">
  import type {
    Track,
    TranscodeAudioEncoderCapability,
    TranscodeAudioMode,
    TranscodeAudioSettings,
    TranscodeAudioTrackOverride,
  } from '$lib/types';
  import type { TranscodeModeOption } from '$lib/services/transcode';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Switch } from '$lib/components/ui/switch';
  import * as Select from '$lib/components/ui/select';
  import { formatChannels } from '$lib/utils/format';

  interface Props {
    settings: Pick<TranscodeAudioSettings, 'mode' | 'encoderId' | 'bitrateKbps' | 'channels' | 'sampleRate'>
      | Pick<TranscodeAudioTrackOverride, 'mode' | 'encoderId' | 'bitrateKbps' | 'channels' | 'sampleRate'>;
    sourceTrack: Track | null;
    showSourceTrackDetails?: boolean;
    selectedEncoder: TranscodeAudioEncoderCapability | null;
    modeOptions: TranscodeModeOption<TranscodeAudioMode>[];
    availableAudioEncoders: TranscodeAudioEncoderCapability[];
    copyMessage: string;
    disableMessage: string;
    inactiveMessage: string;
    onModeChange: (mode: TranscodeAudioMode) => void;
    onEncoderChange: (encoderId: string) => void;
    onBitrateChange: (value: number | undefined) => void;
    onChannelsChange: (value: number | undefined) => void;
    onSampleRateChange: (value: number | undefined) => void;
  }

  let {
    settings,
    sourceTrack,
    showSourceTrackDetails = true,
    selectedEncoder,
    modeOptions,
    availableAudioEncoders,
    copyMessage,
    disableMessage,
    inactiveMessage,
    onModeChange,
    onEncoderChange,
    onBitrateChange,
    onChannelsChange,
    onSampleRateChange,
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

  const isBitrateDisabled = $derived(!selectedEncoder?.supportsBitrate || selectedEncoder?.codec === 'flac');
  const channelsDefaultLabel = $derived(
    showSourceTrackDetails ? `Default: As source (${formatChannels(sourceTrack?.channels)})` : 'Default: As source',
  );
  const sampleRateDefaultLabel = $derived(
    showSourceTrackDetails ? `Default: As source (${formatSampleRate(sourceTrack?.sampleRate)})` : 'Default: As source',
  );
</script>

<div class="grid gap-4 lg:grid-cols-2">
  <div class="space-y-4">
    <div class="space-y-2">
      <Label>Audio mode</Label>
      <Select.Root
        type="single"
        value={settings.mode}
        onValueChange={(value) => onModeChange(value as TranscodeAudioMode)}
        >
        <Select.Trigger class="w-full">{settings.mode}</Select.Trigger>
        <Select.Content>
          <Select.Group>
            {#each modeOptions as option (option.value)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Group>
        </Select.Content>
      </Select.Root>
    </div>

    {#if settings.mode === 'transcode'}
      <div class="space-y-2">
        <Label>Audio encoder</Label>
        <Select.Root
          type="single"
          value={settings.encoderId}
          onValueChange={(value) => onEncoderChange(value)}
        >
          <Select.Trigger class="w-full">{selectedEncoder?.label ?? 'Select encoder'}</Select.Trigger>
          <Select.Content>
            <Select.Group>
              {#each availableAudioEncoders as encoder (encoder.id)}
                <Select.Item value={encoder.id}>{encoder.label}</Select.Item>
              {/each}
            </Select.Group>
          </Select.Content>
        </Select.Root>
      </div>
    {:else}
      <div class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        {settings.mode === 'copy' ? copyMessage : disableMessage}
      </div>
    {/if}
  </div>

  <div class="space-y-4">
    {#if settings.mode === 'transcode'}
      <div class="space-y-2">
        <Label>Bitrate (kbps)</Label>
        <Input
          type="number"
          value={settings.bitrateKbps?.toString() ?? ''}
          oninput={(event) => onBitrateChange(parseOptionalInt(event.currentTarget.value))}
          disabled={isBitrateDisabled}
        />
      </div>

      <div class="grid gap-4 xl:grid-cols-2">
        {#if selectedEncoder?.supportsChannels}
          <div class="space-y-2">
            <div class="rounded-md border bg-muted/20 p-3 space-y-3 min-w-0">
              <div class="space-y-1 min-w-0">
                <Label>Channels</Label>
                <p class="text-xs text-muted-foreground break-words">
                  {channelsDefaultLabel}
                </p>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-xs text-muted-foreground">Override</span>
                <Switch
                  checked={settings.channels !== undefined}
                  onCheckedChange={(checked) => onChannelsChange(
                    checked ? (settings.channels ?? (showSourceTrackDetails ? sourceTrack?.channels : undefined) ?? 2) : undefined,
                  )}
                />
              </div>
            </div>

            {#if settings.channels !== undefined}
              <Input
                type="number"
                value={settings.channels?.toString() ?? ''}
                oninput={(event) => onChannelsChange(parseOptionalInt(event.currentTarget.value))}
              />
            {/if}
          </div>
        {/if}

        {#if selectedEncoder?.supportsSampleRate}
          <div class="space-y-2">
            <div class="rounded-md border bg-muted/20 p-3 space-y-3 min-w-0">
              <div class="space-y-1 min-w-0">
                <Label>Sample rate</Label>
                <p class="text-xs text-muted-foreground break-words">
                  {sampleRateDefaultLabel}
                </p>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-xs text-muted-foreground">Override</span>
                <Switch
                  checked={settings.sampleRate !== undefined}
                  onCheckedChange={(checked) => onSampleRateChange(
                    checked ? (settings.sampleRate ?? (showSourceTrackDetails ? sourceTrack?.sampleRate : undefined) ?? 48000) : undefined,
                  )}
                />
              </div>
            </div>

            {#if settings.sampleRate !== undefined}
              <Input
                type="number"
                value={settings.sampleRate?.toString() ?? ''}
                oninput={(event) => onSampleRateChange(parseOptionalInt(event.currentTarget.value))}
              />
            {/if}
          </div>
        {/if}
      </div>
    {:else}
      <div class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        {inactiveMessage}
      </div>
    {/if}

    {#if showSourceTrackDetails}
      <div class="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
        <p><span class="font-medium">Source codec:</span> {sourceTrack?.codec.toUpperCase() ?? 'N/A'}</p>
        <p><span class="font-medium">Channels:</span> {formatChannels(sourceTrack?.channels)}</p>
        <p><span class="font-medium">Sample rate:</span> {formatSampleRate(sourceTrack?.sampleRate)}</p>
        <p><span class="font-medium">Layout:</span> {sourceTrack?.channelLayout ?? 'N/A'}</p>
      </div>
    {:else}
      <div class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        Source codec, channels, sample rate, and layout vary across the detected audio tracks. Open Track Overrides to inspect per-track details.
      </div>
    {/if}
  </div>
</div>
