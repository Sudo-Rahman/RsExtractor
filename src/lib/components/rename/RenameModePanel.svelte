<script lang="ts">
  import * as RadioGroup from '$lib/components/ui/radio-group';
  import { Label } from '$lib/components/ui/label';
  import { OutputFolderField } from '$lib/components/shared';
  import type { RenameMode } from '$lib/types/rename';
  import type { ResolvedOutputFolderDisplay } from '$lib/utils';

  interface RenameModePanelProps {
    mode: RenameMode;
    outputFolderDisplay: ResolvedOutputFolderDisplay;
    onModeChange: (mode: RenameMode) => void;
    onSelectOutputDir: () => void | Promise<void>;
  }

  let {
    mode,
    outputFolderDisplay,
    onModeChange,
    onSelectOutputDir,
  }: RenameModePanelProps = $props();

  function handleModeChange(value: string): void {
    onModeChange(value as RenameMode);
  }
</script>

<div class="space-y-4">
  <div class="space-y-2">
    <Label class="text-xs uppercase tracking-wide text-muted-foreground">Mode</Label>
    <RadioGroup.Root value={mode} onValueChange={handleModeChange} class="flex gap-4">
      <label class="flex cursor-pointer items-center gap-2">
        <RadioGroup.Item value="rename" />
        <span class="text-sm">Rename</span>
      </label>
      <label class="flex cursor-pointer items-center gap-2">
        <RadioGroup.Item value="copy" />
        <span class="text-sm">Copy</span>
      </label>
    </RadioGroup.Root>
  </div>

  {#if mode === 'copy'}
    <OutputFolderField
      label="Output folder"
      displayText={outputFolderDisplay.displayText}
      state={outputFolderDisplay.state}
      onBrowse={onSelectOutputDir}
    />
  {/if}
</div>
