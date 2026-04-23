<script lang="ts">
  import { Clock, FileVideo, Settings2, Subtitles, Video, Volume2 } from '@lucide/svelte';

  import { mergeStore } from '$lib/stores';
  import type { MergeTrack } from '$lib/types';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import * as Card from '$lib/components/ui/card';

  interface Props {
    onEditTrack: (trackId: string) => void;
  }

  let { onEditTrack }: Props = $props();

  function getTrackTypeColor(type: string): string {
    switch (type) {
      case 'video':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
      case 'audio':
        return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30';
      case 'subtitle':
        return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30';
    }
  }

  function getTrackIcon(type: string) {
    switch (type) {
      case 'video':
        return Video;
      case 'audio':
        return Volume2;
      case 'subtitle':
        return Subtitles;
      default:
        return FileVideo;
    }
  }

  function groupTracksByType(tracks: MergeTrack[]): Record<string, MergeTrack[]> {
    const groups: Record<string, MergeTrack[]> = { video: [], audio: [], subtitle: [] };

    for (const track of tracks) {
      if (groups[track.type]) {
        groups[track.type].push(track);
      }
    }

    return groups;
  }

  const selectedVideo = $derived.by(() => mergeStore.selectedVideo ?? null);
  const groupedSourceTracks = $derived.by(() => groupTracksByType(selectedVideo?.tracks ?? []));
</script>

{#if selectedVideo}
  {@const groups = groupedSourceTracks}
  <div class="space-y-4">
    {#each Object.entries(groups) as [type, tracks] (type)}
      {#if tracks.length > 0}
        {@const Icon = getTrackIcon(type)}
        <Card.Root>
          <Card.Header class="py-3">
            <div class="flex items-center gap-2">
              <Icon class="size-4 text-muted-foreground" />
              <Card.Title class="text-sm capitalize">{type} ({tracks.length})</Card.Title>
            </div>
          </Card.Header>
          <Card.Content class="pt-0 space-y-1.5">
            {#each tracks as track (track.id)}
              {@const config = mergeStore.getSourceTrackConfig(track.id)}
              {@const enabled = config?.enabled ?? true}
              <div
                class="flex items-center gap-2 rounded-md border p-2.5 transition-all {getTrackTypeColor(track.type)} {!enabled ? 'opacity-50' : ''}"
              >
                <Checkbox
                  checked={enabled}
                  onCheckedChange={() => mergeStore.toggleSourceTrack(track.id)}
                />

                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" class="font-mono text-xs">#{track.originalIndex}</Badge>
                    <span class="font-medium text-sm">{track.codec.toUpperCase()}</span>
                    {#if config?.language || track.language}
                      <Badge variant="secondary" class="text-xs">
                        {config?.language || track.language}
                      </Badge>
                    {/if}
                    {#if config?.default ?? track.default}
                      <Badge class="text-xs">Default</Badge>
                    {/if}
                    {#if config?.forced ?? track.forced}
                      <Badge variant="destructive" class="text-xs">Forced</Badge>
                    {/if}
                  </div>

                  <div class="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                    {#if config?.title || track.title}
                      <span class="truncate max-w-[200px]">"{config?.title || track.title}"</span>
                    {/if}
                    {#if track.type === 'video' && track.width && track.height}
                      <span>{track.width}x{track.height}</span>
                    {/if}
                    {#if track.type === 'audio' && track.channels}
                      <span>{track.channels}ch</span>
                    {/if}
                    {#if config?.delayMs && config.delayMs !== 0}
                      <span class="flex items-center gap-1 text-orange-500">
                        <Clock class="size-3" />
                        {config.delayMs > 0 ? '+' : ''}{config.delayMs}ms
                      </span>
                    {/if}
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  onclick={() => onEditTrack(track.id)}
                >
                  <Settings2 class="size-4" />
                </Button>
              </div>
            {/each}
          </Card.Content>
        </Card.Root>
      {/if}
    {/each}
  </div>
{:else}
  <div class="flex items-center justify-center py-20 text-muted-foreground">
    <p>Select a video to view its tracks</p>
  </div>
{/if}
