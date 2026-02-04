<script lang="ts">
  import type { OcrProgress, OcrPhase } from '$lib/types/video-ocr';
  import { OCR_PHASE_LABELS } from '$lib/types/video-ocr';
  import { Progress } from '$lib/components/ui/progress';
  import { CheckCircle, Circle, Loader2 } from '@lucide/svelte';
  import { cn } from '$lib/utils';

  interface OcrProgressBarProps {
    progress?: OcrProgress;
    class?: string;
  }

  let {
    progress,
    class: className = '',
  }: OcrProgressBarProps = $props();

  const phases: OcrPhase[] = ['transcoding', 'extracting', 'ocr', 'generating'];

  function getPhaseStatus(phase: OcrPhase): 'pending' | 'active' | 'completed' {
    if (!progress) return 'pending';
    
    const currentIndex = phases.indexOf(progress.phase);
    const phaseIndex = phases.indexOf(phase);
    
    if (phaseIndex < currentIndex) return 'completed';
    if (phaseIndex === currentIndex) return 'active';
    return 'pending';
  }
</script>

<div class={cn("space-y-4", className)}>
  {#each phases as phase, i (phase)}
    {@const status = getPhaseStatus(phase)}
    {@const isActive = status === 'active'}
    {@const isCompleted = status === 'completed'}
    
    <div class="flex items-start gap-3">
      <!-- Step indicator -->
      <div class="shrink-0 flex flex-col items-center">
        <div class={cn(
          "size-6 rounded-full flex items-center justify-center text-xs font-medium",
          isCompleted && "bg-green-500 text-white",
          isActive && "bg-primary text-primary-foreground",
          !isCompleted && !isActive && "bg-muted text-muted-foreground"
        )}>
          {#if isCompleted}
            <CheckCircle class="size-4" />
          {:else if isActive}
            <Loader2 class="size-4 animate-spin" />
          {:else}
            {i + 1}
          {/if}
        </div>
        
        <!-- Connector line -->
        {#if i < phases.length - 1}
          <div class={cn(
            "w-0.5 h-8 mt-1",
            isCompleted ? "bg-green-500" : "bg-muted"
          )} />
        {/if}
      </div>
      
      <!-- Phase content -->
      <div class="flex-1 min-w-0 pt-0.5">
        <p class={cn(
          "text-sm font-medium",
          isCompleted && "text-green-600",
          isActive && "text-foreground",
          !isCompleted && !isActive && "text-muted-foreground"
        )}>
          {OCR_PHASE_LABELS[phase]}
        </p>
        
        {#if isActive && progress}
          <div class="mt-2 space-y-1">
            <Progress value={progress.percentage} class="h-2" />
            <div class="flex justify-between text-xs text-muted-foreground">
              <span>{progress.message || `Processing...`}</span>
              <span>{progress.current}/{progress.total}</span>
            </div>
          </div>
        {:else if isCompleted}
          <p class="text-xs text-muted-foreground mt-0.5">Completed</p>
        {/if}
      </div>
    </div>
  {/each}
</div>
