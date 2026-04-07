<script lang="ts">
  import type { Track, TranscodeFile, TranscodeSubtitleEncoderCapability, TranscodeSubtitleMode } from '$lib/types';
  import { formatLanguage } from '$lib/utils/format';
  import { Label } from '$lib/components/ui/label';
  import * as Select from '$lib/components/ui/select';

  import TranscodeAdditionalOverrides from './TranscodeAdditionalOverrides.svelte';
  import type { TranscodeProfileUpdater } from './types';

  interface Props {
    file: TranscodeFile;
    selectedSubtitleTracks: Track[];
    selectedSubtitleEncoder: TranscodeSubtitleEncoderCapability | null;
    availableSubtitleEncoders: TranscodeSubtitleEncoderCapability[];
    commonOverrideFlags: string[];
    updateProfile: TranscodeProfileUpdater;
    createId: (prefix: string) => string;
  }

  let {
    file,
    selectedSubtitleTracks,
    selectedSubtitleEncoder,
    availableSubtitleEncoders,
    commonOverrideFlags,
    updateProfile,
    createId,
  }: Props = $props();
</script>

{#if selectedSubtitleTracks.length === 0}
  <div class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
    No subtitle tracks were detected in this file.
  </div>
{:else}
  <div class="grid gap-4 lg:grid-cols-2">
    <div class="space-y-4">
      <div class="space-y-2">
        <Label>Subtitle mode</Label>
        <Select.Root
          type="single"
          value={file.profile.subtitles.mode}
          onValueChange={(value) => {
            updateProfile((profile) => {
              profile.subtitles.mode = value as TranscodeSubtitleMode;
            });
          }}
        >
          <Select.Trigger class="w-full">{file.profile.subtitles.mode}</Select.Trigger>
          <Select.Content>
            <Select.Item value="copy">copy</Select.Item>
            <Select.Item value="convert_text">convert_text</Select.Item>
            <Select.Item value="disable">disable</Select.Item>
          </Select.Content>
        </Select.Root>
      </div>

      {#if file.profile.subtitles.mode === 'convert_text'}
        <div class="space-y-2">
          <Label>Subtitle encoder</Label>
          <Select.Root
            type="single"
            value={file.profile.subtitles.encoderId}
            onValueChange={(value) => {
              updateProfile((profile) => {
                profile.subtitles.encoderId = value;
              });
            }}
          >
            <Select.Trigger class="w-full">{selectedSubtitleEncoder?.label ?? 'Select encoder'}</Select.Trigger>
            <Select.Content>
              {#each availableSubtitleEncoders as encoder (encoder.id)}
                <Select.Item value={encoder.id}>{encoder.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      {:else}
        <div class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {file.profile.subtitles.mode === 'copy'
            ? 'Subtitle tracks will be copied without conversion.'
            : 'Subtitles are disabled for this output.'}
        </div>
      {/if}
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

{#if selectedSubtitleTracks.length > 0 && file.profile.subtitles.mode === 'convert_text'}
  <TranscodeAdditionalOverrides
    tab="subtitles"
    title="Additional Overrides"
    description="Optional safe FFmpeg flags for subtitle handling."
    emptyMessage="No subtitle overrides added."
    commonFlags={commonOverrideFlags}
    args={file.profile.subtitles.additionalArgs}
    createId={createId}
    updateProfile={updateProfile}
  />
{/if}
