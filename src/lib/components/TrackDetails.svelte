<script lang="ts">
  import { cn } from '$lib/utils';
  import type { Track, VideoFile } from '$lib/types';
  import { formatBitrate, formatLanguage, formatChannels, formatResolution } from '$lib/utils/format';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
  import Video from 'lucide-svelte/icons/video';
  import Volume2 from 'lucide-svelte/icons/volume-2';
  import Subtitles from 'lucide-svelte/icons/subtitles';
  import Database from 'lucide-svelte/icons/database';

  interface TrackDetailsProps {
    file: VideoFile;
    selectedTrackIds: number[];
    onToggleTrack?: (trackId: number) => void;
    onSelectAll?: (type: Track['type']) => void;
    onDeselectAll?: (type: Track['type']) => void;
    class?: string;
  }

  let { file, selectedTrackIds, onToggleTrack, onSelectAll, onDeselectAll, class: className = '' }: TrackDetailsProps = $props();

  // Group tracks by type
  const groupedTracks = $derived(() => {
    const groups: Record<string, Track[]> = {
      video: [],
      audio: [],
      subtitle: [],
      data: []
    };

    for (const track of file.tracks) {
      if (groups[track.type]) {
        groups[track.type].push(track);
      }
    }

    return groups;
  });

  const typeLabels: Record<string, string> = {
    video: 'Vidéo',
    audio: 'Audio',
    subtitle: 'Sous-titres',
    data: 'Données'
  };

  const typeIcons: Record<string, typeof Video> = {
    video: Video,
    audio: Volume2,
    subtitle: Subtitles,
    data: Database
  };

  function isSelected(trackId: number) {
    return selectedTrackIds.includes(trackId);
  }

  function areAllSelected(type: Track['type']) {
    const tracks = groupedTracks()[type];
    return tracks.length > 0 && tracks.every(t => selectedTrackIds.includes(t.id));
  }

  function areNoneSelected(type: Track['type']) {
    const tracks = groupedTracks()[type];
    return tracks.every(t => !selectedTrackIds.includes(t.id));
  }
</script>

<div class={cn('space-y-4', className)}>
  <Card.Root>
    <Card.Header class="pb-3">
      <Card.Title class="text-base truncate">{file.name}</Card.Title>
      <Card.Description>
        {file.tracks.length} piste{file.tracks.length > 1 ? 's' : ''} disponible{file.tracks.length > 1 ? 's' : ''}
      </Card.Description>
    </Card.Header>
  </Card.Root>

  {#each Object.entries(groupedTracks()) as [type, tracks]}
    {#if tracks.length > 0}
      {@const Icon = typeIcons[type]}
      {@const allSelected = areAllSelected(type as Track['type'])}
      <Card.Root>
        <Card.Header class="pb-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Icon class="size-4 text-muted-foreground" />
              <Card.Title class="text-sm">{typeLabels[type]} ({tracks.length})</Card.Title>
            </div>
            <div class="flex gap-1">
              {#if !allSelected}
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 text-xs"
                  onclick={() => onSelectAll?.(type as Track['type'])}
                >
                  Tout sélectionner
                </Button>
              {:else}
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 text-xs"
                  onclick={() => onDeselectAll?.(type as Track['type'])}
                >
                  Tout désélectionner
                </Button>
              {/if}
            </div>
          </div>
        </Card.Header>
        <Card.Content class="pt-0">
          <div class="space-y-1.5">
            {#each tracks as track (track.id)}
              <label
                class={cn(
                  'flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors hover:bg-accent',
                  isSelected(track.id) && 'border-primary bg-primary/5'
                )}
              >
                <Checkbox
                  checked={isSelected(track.id)}
                  onCheckedChange={() => onToggleTrack?.(track.id)}
                />

                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" class="font-mono text-xs">
                      #{track.index}
                    </Badge>
                    <span class="font-medium text-sm">{track.codec.toUpperCase()}</span>
                    {#if track.language}
                      <Badge variant="secondary" class="text-xs">
                        {formatLanguage(track.language)}
                      </Badge>
                    {/if}
                    {#if track.default}
                      <Badge class="text-xs">Défaut</Badge>
                    {/if}
                    {#if track.forced}
                      <Badge variant="destructive" class="text-xs">Forcé</Badge>
                    {/if}
                  </div>

                  <div class="flex flex-wrap gap-2 mt-1.5 text-xs text-muted-foreground">
                    {#if track.title}
                      <span>"{track.title}"</span>
                    {/if}

                    {#if type === 'video'}
                      {#if track.width && track.height}
                        <span>{formatResolution(track.width, track.height)}</span>
                      {/if}
                      {#if track.frameRate}
                        <span>{track.frameRate} fps</span>
                      {/if}
                    {/if}

                    {#if type === 'audio'}
                      {#if track.channels}
                        <span>{formatChannels(track.channels)}</span>
                      {/if}
                      {#if track.sampleRate}
                        <span>{track.sampleRate} Hz</span>
                      {/if}
                    {/if}

                    {#if track.bitrate}
                      <span>{formatBitrate(track.bitrate)}</span>
                    {/if}
                  </div>
                </div>
              </label>
            {/each}
          </div>
        </Card.Content>
      </Card.Root>
    {/if}
  {/each}

  {#if file.tracks.length === 0}
    <Card.Root>
      <Card.Content class="py-8 text-center text-muted-foreground">
        Aucune piste détectée dans ce fichier
      </Card.Content>
    </Card.Root>
  {/if}
</div>


