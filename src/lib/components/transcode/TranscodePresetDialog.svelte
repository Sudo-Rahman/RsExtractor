<script lang="ts">
  import { Save } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';

  import type { TranscodeFile, TranscodePreset, TranscodePresetTab } from '$lib/types';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Select from '$lib/components/ui/select';
  import * as Dialog from '$lib/components/ui/dialog';

  interface Props {
    open: boolean;
    tab: TranscodePresetTab;
    selectedFile: TranscodeFile | null;
    presets: TranscodePreset[];
    onApply?: (presetId: string) => void | Promise<void>;
    onDelete?: (presetId: string) => void | Promise<void>;
    onSave?: (name: string) => void | Promise<void>;
  }

  let {
    open = $bindable(),
    tab,
    selectedFile,
    presets,
    onApply,
    onDelete,
    onSave,
  }: Props = $props();

  let selectedPresetIds = $state<Record<TranscodePresetTab, string>>({
    video: '',
    audio: '',
    subtitles: '',
  });

  let savePresetNames = $state<Record<TranscodePresetTab, string>>({
    video: '',
    audio: '',
    subtitles: '',
  });

  function getPresetTitle(): string {
    if (tab === 'audio') return 'Audio Presets';
    if (tab === 'subtitles') return 'Subtitle Presets';
    return 'Video Presets';
  }

  function getPresetDescription(): string {
    if (tab === 'audio') return 'Save and reuse audio settings for the selected file.';
    if (tab === 'subtitles') return 'Save and reuse subtitle conversion policies.';
    return 'Save and reuse video settings for the selected file.';
  }

  function getSelectedPresetId(): string {
    return selectedPresetIds[tab];
  }

  function setSelectedPresetId(value: string): void {
    selectedPresetIds[tab] = value;
  }

  function getSavePresetName(): string {
    return savePresetNames[tab];
  }

  function setSavePresetName(value: string): void {
    savePresetNames[tab] = value;
  }

  async function handleApply(): Promise<void> {
    const presetId = getSelectedPresetId();
    if (!presetId) {
      toast.info('Select a preset first');
      return;
    }

    await onApply?.(presetId);
  }

  async function handleDelete(): Promise<void> {
    const presetId = getSelectedPresetId();
    if (!presetId) {
      toast.info('Select a preset first');
      return;
    }

    await onDelete?.(presetId);
    selectedPresetIds[tab] = '';
  }

  async function handleSave(): Promise<void> {
    const name = getSavePresetName();
    if (!name.trim()) {
      toast.info('Enter a preset name first');
      return;
    }

    await onSave?.(name);
    savePresetNames[tab] = '';
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-xl">
    <Dialog.Header>
      <Dialog.Title>{getPresetTitle()}</Dialog.Title>
      <Dialog.Description>{getPresetDescription()}</Dialog.Description>
    </Dialog.Header>

    {#if selectedFile}
      <div class="space-y-3">
        <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <Select.Root
            type="single"
            value={getSelectedPresetId()}
            onValueChange={(value) => setSelectedPresetId(value)}
          >
            <Select.Trigger class="w-full">
              {getSelectedPresetId()
                ? presets.find((preset) => preset.id === getSelectedPresetId())?.name
                : 'Select a saved preset'}
            </Select.Trigger>
            <Select.Content>
              <Select.Group>
                {#each presets as preset (preset.id)}
                  <Select.Item value={preset.id}>{preset.name}</Select.Item>
                {/each}
              </Select.Group>
            </Select.Content>
          </Select.Root>
          <Button variant="outline" onclick={handleApply} disabled={!getSelectedPresetId()}>Apply</Button>
          <Button variant="ghost" onclick={handleDelete} disabled={!getSelectedPresetId()}>Delete</Button>
        </div>

        <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            placeholder={`Save current ${tab} settings as...`}
            value={getSavePresetName()}
            oninput={(event) => setSavePresetName(event.currentTarget.value)}
          />
          <Button onclick={handleSave}>
            <Save class="size-4 mr-2" />
            Save Preset
          </Button>
        </div>
      </div>
    {:else}
      <div class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Select a file to manage presets for the active tab.
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
