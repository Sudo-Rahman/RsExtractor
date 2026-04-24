<script lang="ts">
  import { Sparkles } from '@lucide/svelte';

  import type { TranscodeAiSizePreference, TranscodeFile } from '$lib/types';
  import { Badge } from '$lib/components/ui/badge';
  import { describeTrackSummary } from '$lib/services/transcode';

  interface Props {
    file: TranscodeFile;
  }

  let { file }: Props = $props();

  function formatSizePreference(sizePreference?: TranscodeAiSizePreference): string {
    if (sizePreference === 'minimum') return 'minimum size';
    if (sizePreference === 'no_compromise') return 'no compromise';
    return 'balanced';
  }
</script>

<div class="border-b px-4 py-3">
  <div class="min-w-0">
    <div class="flex items-center gap-2">
      <h2 class="font-semibold truncate">{file.name}</h2>
      <Badge variant="outline">{file.hasVideo ? 'Video' : 'Audio-only'}</Badge>
      {#if file.aiRecommendation}
        <Badge class="gap-1">
          <Sparkles class="size-3" />
          AI {file.aiRecommendation.intent} · {formatSizePreference(file.aiRecommendation.sizePreference)}
        </Badge>
      {/if}
    </div>
    <p class="text-sm text-muted-foreground truncate mt-1">
      {describeTrackSummary(file)}
    </p>
  </div>
</div>
