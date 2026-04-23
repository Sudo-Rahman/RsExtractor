<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import * as Card from '$lib/components/ui/card';

  import type { Track } from '$lib/types';

  import { formatBitrate, formatFileSize, getTrackIcon, getTrackTypeColor } from './info-utils';

  interface Props {
    tracks: Track[];
  }

  let { tracks }: Props = $props();
</script>

<div class="p-4 space-y-2">
  {#each tracks as track (track.id)}
    {@const Icon = getTrackIcon(track.type)}
    <Card.Root>
      <Card.Content class="p-3">
        <div class="flex items-start gap-3">
          <div class="p-2 rounded-md bg-muted">
            <Icon class={`size-4 ${getTrackTypeColor(track.type)}`} />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" class="font-mono">#{track.index}</Badge>
              <span class="font-semibold capitalize">{track.type}</span>
              <span class="font-medium">{track.codec.toUpperCase()}</span>
              {#if track.language}
                <Badge variant="secondary">{track.language}</Badge>
              {/if}
              {#if track.default}
                <Badge>Default</Badge>
              {/if}
              {#if track.forced}
                <Badge variant="destructive">Forced</Badge>
              {/if}
            </div>

            {#if track.title}
              <p class="text-sm text-muted-foreground mt-1">"{track.title}"</p>
            {/if}

            <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
              {#if track.codecLong}
                <span>Codec: {track.codecLong}</span>
              {/if}
              {#if track.bitrate}
                <span>Bitrate: {formatBitrate(track.bitrate)}</span>
              {/if}
              {#if track.size}
                <span>Size: {formatFileSize(track.size)}</span>
              {/if}

              {#if track.type === 'video'}
                {#if track.width && track.height}
                  <span>Resolution: {track.width}×{track.height}</span>
                {/if}
                {#if track.frameRate}
                  <span>FPS: {track.frameRate}</span>
                {/if}
                {#if track.pixelFormat}
                  <span>Format: {track.pixelFormat}</span>
                {/if}
                {#if track.colorRange}
                  <span>Range: {track.colorRange}</span>
                {/if}
                {#if track.aspectRatio}
                  <span>AR: {track.aspectRatio}</span>
                {/if}
              {/if}

              {#if track.type === 'audio'}
                {#if track.channels}
                  <span>Channels: {track.channels}</span>
                {/if}
                {#if track.sampleRate}
                  <span>Sample Rate: {track.sampleRate} Hz</span>
                {/if}
              {/if}

              {#if track.numberOfFrames}
                <span>Frames: {track.numberOfFrames}</span>
              {/if}
            </div>
          </div>
        </div>
      </Card.Content>
    </Card.Root>
  {:else}
    <div class="text-center py-8 text-muted-foreground">
      No tracks found
    </div>
  {/each}
</div>
