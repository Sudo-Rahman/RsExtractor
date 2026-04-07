<script lang="ts">
  import { FileVideo } from '@lucide/svelte';

  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';

  interface Props {
    onAddFiles?: () => void | Promise<void>;
  }

  let { onAddFiles }: Props = $props();
</script>

<div class="flex-1 p-6">
  <Card.Root class="h-full border-dashed">
    <Card.Content class="h-full flex items-center justify-center">
      <div class="text-center space-y-3 max-w-md">
        <div class="mx-auto size-16 rounded-full bg-muted/50 flex items-center justify-center">
          <FileVideo class="size-8 text-muted-foreground" />
        </div>
        <div>
          <h2 class="text-xl font-semibold">Transcode media files</h2>
          <p class="text-sm text-muted-foreground mt-1">
            Import video or audio-only files to configure AI-assisted or advanced FFmpeg transcoding.
          </p>
        </div>
        <Button onclick={onAddFiles}>
          <FileVideo class="size-4 mr-2" />
          Add Files
        </Button>
      </div>
    </Card.Content>
  </Card.Root>
</div>
