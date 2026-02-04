<script lang="ts">
  import type { OcrSubtitle } from '$lib/types/video-ocr';

  interface SubtitleOverlayProps {
    subtitle?: OcrSubtitle;
    class?: string;
  }

  let {
    subtitle,
    class: className = '',
  }: SubtitleOverlayProps = $props();
</script>

{#if subtitle}
  <div
    class="absolute bottom-16 left-0 right-0 flex justify-center pointer-events-none px-4 {className}"
  >
    <div class="bg-black/80 text-white px-4 py-2 rounded-lg max-w-[90%] text-center">
      <p class="text-lg leading-relaxed whitespace-pre-wrap">
        {subtitle.text}
      </p>
    </div>
  </div>
{/if}
