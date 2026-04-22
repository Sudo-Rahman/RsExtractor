<script lang="ts">
  import { tick } from 'svelte';
  import { Check, ChevronsUpDown, Trash2 } from '@lucide/svelte';
  import type { Attachment } from 'svelte/attachments';

  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Slider } from '$lib/components/ui/slider';
  import { Switch } from '$lib/components/ui/switch';
  import * as Card from '$lib/components/ui/card';
  import * as Command from '$lib/components/ui/command';
  import * as Popover from '$lib/components/ui/popover';
  import * as Select from '$lib/components/ui/select';
  import type {
    TranscodeAdditionalArg,
    TranscodeEncoderOption,
    TranscodeEncoderOptionChoice,
    TranscodeProfile,
    TranscodePresetTab,
  } from '$lib/types';
  import { cn } from '$lib/utils';

  import type { TranscodeProfileUpdater } from './types';

  interface Props {
    tab?: TranscodePresetTab;
    title: string;
    description: string;
    emptyMessage: string;
    commonFlags: string[];
    encoderOptions?: TranscodeEncoderOption[];
    args: TranscodeAdditionalArg[];
    createId?: (prefix: string) => string;
    updateProfile?: TranscodeProfileUpdater;
    onAddOverride?: (flag?: string) => string | void;
    onUpdateOverride?: (argId: string, updates: Partial<TranscodeAdditionalArg>) => void;
    onRemoveOverride?: (argId: string) => void;
  }

  let {
    tab,
    title,
    description,
    emptyMessage,
    commonFlags,
    encoderOptions = [],
    args,
    createId,
    updateProfile,
    onAddOverride,
    onUpdateOverride,
    onRemoveOverride,
  }: Props = $props();

  let flagSelectorOpenById = $state<Record<string, boolean>>({});
  const overrideRowElements: Record<string, HTMLDivElement | undefined> = {};

  const optionByFlag = $derived.by(() => new Map(encoderOptions.map((option) => [option.flag, option])));
  const availableCommonFlags = $derived.by(() => commonFlags.filter((flag) => optionByFlag.has(flag)));
  const hasAvailableEncoderOptions = $derived(encoderOptions.length > 0);

  function getTarget(profile: TranscodeProfile) {
    switch (tab) {
      case 'audio':
        return profile.audio;
      case 'subtitles':
        return profile.subtitles;
      default:
        return profile.video;
    }
  }

  async function scrollToOverride(argId: string): Promise<void> {
    await tick();
    overrideRowElements[argId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });
  }

  function registerOverrideRow(argId: string): Attachment<HTMLDivElement> {
    return (element) => {
      overrideRowElements[argId] = element;

      return () => {
        if (overrideRowElements[argId] === element) {
          delete overrideRowElements[argId];
        }
      };
    };
  }

  async function addOverride(flag?: string): Promise<void> {
    if (onAddOverride) {
      const argId = onAddOverride(flag);
      if (argId) {
        await scrollToOverride(argId);
      }
      return;
    }

    if (!updateProfile || !createId || !tab) {
      return;
    }

    const argId = createId(`transcode-arg-${tab}`);

    updateProfile((profile) => {
      const target = getTarget(profile);
      target.additionalArgs = [
        ...target.additionalArgs,
        {
          id: argId,
          flag: flag ?? '',
          value: '',
          enabled: true,
        },
      ];
    });

    await scrollToOverride(argId);
  }

  function updateOverride(argId: string, updates: Partial<TranscodeAdditionalArg>): void {
    if (onUpdateOverride) {
      onUpdateOverride(argId, updates);
      return;
    }

    if (!updateProfile || !tab) {
      return;
    }

    updateProfile((profile) => {
      const target = getTarget(profile);
      target.additionalArgs = target.additionalArgs.map((arg) =>
        arg.id === argId ? { ...arg, ...updates } : arg,
      );
    });
  }

  function removeOverride(argId: string): void {
    if (onRemoveOverride) {
      onRemoveOverride(argId);
      return;
    }

    if (!updateProfile || !tab) {
      return;
    }

    updateProfile((profile) => {
      const target = getTarget(profile);
      target.additionalArgs = target.additionalArgs.filter((arg) => arg.id !== argId);
    });
  }

  function setFlagSelectorOpen(argId: string, open: boolean): void {
    flagSelectorOpenById = {
      ...flagSelectorOpenById,
      [argId]: open,
    };
  }

  function selectEncoderOption(argId: string, option: TranscodeEncoderOption): void {
    updateOverride(argId, {
      flag: option.flag,
      value: undefined,
    });
    setFlagSelectorOpen(argId, false);
  }

  function getOptionForFlag(flag?: string): TranscodeEncoderOption | undefined {
    const normalizedFlag = flag?.trim();
    return normalizedFlag ? optionByFlag.get(normalizedFlag) : undefined;
  }

  function getBooleanChoices(): TranscodeEncoderOptionChoice[] {
    return [
      { value: 'true', description: 'Enabled' },
      { value: 'false', description: 'Disabled' },
    ];
  }

  function getValueChoices(option?: TranscodeEncoderOption): TranscodeEncoderOptionChoice[] {
    if (!option) {
      return [];
    }

    if (option.valueKind !== 'boolean') {
      return option.choices;
    }

    const choices = [...option.choices];
    for (const booleanChoice of getBooleanChoices()) {
      if (!choices.some((choice) => choice.value === booleanChoice.value)) {
        choices.push(booleanChoice);
      }
    }
    return choices;
  }

  function formatRange(option: TranscodeEncoderOption): string | null {
    if (option.min === undefined && option.max === undefined) {
      return null;
    }

    return `${option.min ?? 'unbounded'} to ${option.max ?? 'unbounded'}`;
  }

  function formatOptionHelp(option: TranscodeEncoderOption): string {
    const details = [];
    if (option.description) {
      details.push(option.description);
    }
    if (option.defaultValue !== undefined) {
      details.push(`Default: ${option.defaultValue}`);
    }
    const range = formatRange(option);
    if (range) {
      details.push(`Range: ${range}`);
    }
    return details.join(' · ');
  }

  function getValuePlaceholder(option?: TranscodeEncoderOption): string {
    if (!option) {
      return 'Optional value';
    }

    const defaultText = option.defaultValue !== undefined ? `Default: ${option.defaultValue}` : 'Optional value';
    const range = formatRange(option);
    return range ? `${defaultText} · ${range}` : defaultText;
  }

  function supportsNumericInput(option: TranscodeEncoderOption): boolean {
    return option.valueKind === 'int' || option.valueKind === 'float';
  }

  function hasFiniteRange(option: TranscodeEncoderOption): boolean {
    return option.min !== undefined
      && option.max !== undefined
      && Number.isFinite(option.min)
      && Number.isFinite(option.max)
      && option.max > option.min;
  }

  function shouldUseSlider(option: TranscodeEncoderOption): boolean {
    if (!supportsNumericInput(option) || !hasFiniteRange(option)) {
      return false;
    }

    const span = option.max! - option.min!;
    return option.valueKind === 'int' ? span <= 200 : span <= 200;
  }

  function getNumericStep(option: TranscodeEncoderOption): number {
    if (option.valueKind === 'int') {
      return 1;
    }

    if (!hasFiniteRange(option)) {
      return 0.1;
    }

    const span = option.max! - option.min!;
    if (span <= 1) return 0.01;
    if (span <= 10) return 0.1;
    return 1;
  }

  function parseNumericValue(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function getSliderValue(arg: TranscodeAdditionalArg, option: TranscodeEncoderOption): number {
    const fallback = option.defaultValue !== undefined
      ? parseNumericValue(option.defaultValue, option.min ?? 0)
      : option.min ?? 0;
    return parseNumericValue(arg.value, fallback);
  }

  function formatSliderValue(value: number, option: TranscodeEncoderOption): string {
    if (option.valueKind === 'int') {
      return Math.round(value).toString();
    }

    return Number(value.toFixed(3)).toString();
  }
</script>

<Card.Root>
  <Card.Header class="pb-3">
    <Card.Title>{title}</Card.Title>
    <Card.Description>{description}</Card.Description>
  </Card.Header>
  <Card.Content class="space-y-3">
    <div class="flex flex-wrap gap-2">
      {#each availableCommonFlags as flag (flag)}
        <Button variant="outline" size="sm" onclick={() => void addOverride(flag)}>
          {flag}
        </Button>
      {/each}
      <Button
        variant="secondary"
        size="sm"
        onclick={() => void addOverride()}
        disabled={!hasAvailableEncoderOptions}
      >
        Add empty override
      </Button>
    </div>

    {#if !hasAvailableEncoderOptions}
      <p class="text-sm text-muted-foreground">No encoder-specific override flags are exposed for this encoder.</p>
    {/if}

    {#if args.length === 0}
      <p class="text-sm text-muted-foreground">{emptyMessage}</p>
    {/if}

    {#each args as arg (arg.id)}
      {@const selectedOption = getOptionForFlag(arg.flag)}
      {@const valueChoices = getValueChoices(selectedOption)}
      <div
        {@attach registerOverrideRow(arg.id)}
        class="grid gap-2 md:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)_auto_auto] items-start"
      >
        <div class="space-y-1.5">
          <Popover.Root
            open={Boolean(flagSelectorOpenById[arg.id])}
            onOpenChange={(open) => setFlagSelectorOpen(arg.id, open)}
          >
            <Popover.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="outline"
                  role="combobox"
                  aria-expanded={Boolean(flagSelectorOpenById[arg.id])}
                  class={cn('w-full justify-between font-normal', !arg.flag && 'text-muted-foreground')}
                >
                  <span class="truncate">{arg.flag || 'Select flag'}</span>
                  <ChevronsUpDown class="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              {/snippet}
            </Popover.Trigger>
            <Popover.Content
              class="w-[var(--bits-popover-anchor-width)] p-0"
              align="start"
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              <Command.Root>
                <Command.Input placeholder="Search encoder flags..." />
                <Command.List>
                  <Command.Empty>No matching encoder flags</Command.Empty>
                  <Command.Group>
                    {#each encoderOptions as option (option.flag)}
                      <Command.Item
                        value={`${option.flag} ${option.description}`}
                        onSelect={() => selectEncoderOption(arg.id, option)}
                        class="items-start"
                      >
                        <span class="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                          {#if arg.flag === option.flag}
                            <Check class="size-4" />
                          {/if}
                        </span>
                        <div class="min-w-0 flex-1">
                          <p class="font-medium">{option.flag}</p>
                          {#if option.description}
                            <p class="truncate text-xs text-muted-foreground">{option.description}</p>
                          {/if}
                        </div>
                      </Command.Item>
                    {/each}
                  </Command.Group>
                </Command.List>
              </Command.Root>
            </Popover.Content>
          </Popover.Root>

          {#if arg.flag && !selectedOption}
            <p class="text-xs text-destructive">Not available for the current encoder.</p>
          {/if}
        </div>

        <div class="space-y-1.5">
          {#if !arg.flag}
            <Input placeholder="Select a flag first" value="" disabled />
          {:else if !selectedOption}
            <Input
              placeholder="Optional value"
              value={arg.value ?? ''}
              oninput={(event) => updateOverride(arg.id, { value: event.currentTarget.value || undefined })}
            />
          {:else if valueChoices.length > 0}
            <Select.Root
              type="single"
              value={arg.value}
              onValueChange={(value) => updateOverride(arg.id, { value })}
            >
              <Select.Trigger class="w-full">{arg.value ?? 'Select value'}</Select.Trigger>
              <Select.Content>
                <Select.Group>
                  {#each valueChoices as choice (choice.value)}
                    <Select.Item value={choice.value}>
                      <span>{choice.value}</span>
                      {#if choice.description}
                        <span class="ml-2 text-xs text-muted-foreground">{choice.description}</span>
                      {/if}
                    </Select.Item>
                  {/each}
                </Select.Group>
              </Select.Content>
            </Select.Root>
          {:else if supportsNumericInput(selectedOption)}
            <div class="space-y-2">
              <Input
                type="number"
                min={selectedOption.min}
                max={selectedOption.max}
                step={getNumericStep(selectedOption)}
                placeholder={getValuePlaceholder(selectedOption)}
                value={arg.value ?? ''}
                oninput={(event) => updateOverride(arg.id, { value: event.currentTarget.value || undefined })}
              />
              {#if shouldUseSlider(selectedOption)}
                <Slider
                  type="single"
                  value={getSliderValue(arg, selectedOption)}
                  onValueChange={(value) => updateOverride(arg.id, {
                    value: formatSliderValue(value, selectedOption),
                  })}
                  min={selectedOption.min}
                  max={selectedOption.max}
                  step={getNumericStep(selectedOption)}
                />
              {/if}
            </div>
          {:else}
            <Input
              placeholder={getValuePlaceholder(selectedOption)}
              value={arg.value ?? ''}
              oninput={(event) => updateOverride(arg.id, { value: event.currentTarget.value || undefined })}
            />
          {/if}

          {#if selectedOption}
            {@const optionHelp = formatOptionHelp(selectedOption)}
            {#if optionHelp}
              <p class="text-xs text-muted-foreground">{optionHelp}</p>
            {/if}
          {/if}
        </div>

        <div class="flex items-center gap-2 pt-1">
          <Switch
            checked={arg.enabled}
            onCheckedChange={(checked) => updateOverride(arg.id, { enabled: checked })}
          />
          <span class="text-xs text-muted-foreground">Enabled</span>
        </div>
        <Button variant="ghost" size="icon-sm" onclick={() => removeOverride(arg.id)}>
          <Trash2 class="size-4" />
        </Button>
      </div>
    {/each}
  </Card.Content>
</Card.Root>
