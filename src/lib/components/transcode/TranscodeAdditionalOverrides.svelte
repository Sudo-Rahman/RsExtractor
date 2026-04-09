<script lang="ts">
  import { Trash2 } from '@lucide/svelte';

  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import * as Card from '$lib/components/ui/card';
  import type { TranscodeAdditionalArg, TranscodeProfile, TranscodePresetTab } from '$lib/types';

  import type { TranscodeProfileUpdater } from './types';

  interface Props {
    tab?: TranscodePresetTab;
    title: string;
    description: string;
    emptyMessage: string;
    commonFlags: string[];
    args: TranscodeAdditionalArg[];
    createId?: (prefix: string) => string;
    updateProfile?: TranscodeProfileUpdater;
    onAddOverride?: (flag?: string) => void;
    onUpdateOverride?: (argId: string, updates: Partial<TranscodeAdditionalArg>) => void;
    onRemoveOverride?: (argId: string) => void;
  }

  let {
    tab,
    title,
    description,
    emptyMessage,
    commonFlags,
    args,
    createId,
    updateProfile,
    onAddOverride,
    onUpdateOverride,
    onRemoveOverride,
  }: Props = $props();

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

  function addOverride(flag?: string): void {
    if (onAddOverride) {
      onAddOverride(flag);
      return;
    }

    if (!updateProfile || !createId || !tab) {
      return;
    }

    updateProfile((profile) => {
      const target = getTarget(profile);
      target.additionalArgs = [
        ...target.additionalArgs,
        {
          id: createId(`transcode-arg-${tab}`),
          flag: flag ?? '',
          value: '',
          enabled: true,
        },
      ];
    });
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
</script>

<Card.Root>
  <Card.Header class="pb-3">
    <Card.Title>{title}</Card.Title>
    <Card.Description>{description}</Card.Description>
  </Card.Header>
  <Card.Content class="space-y-3">
    <div class="flex flex-wrap gap-2">
      {#each commonFlags as flag (flag)}
        <Button variant="outline" size="sm" onclick={() => addOverride(flag)}>
          {flag}
        </Button>
      {/each}
      <Button variant="secondary" size="sm" onclick={() => addOverride()}>
        Add empty override
      </Button>
    </div>

    {#if args.length === 0}
      <p class="text-sm text-muted-foreground">{emptyMessage}</p>
    {/if}

    {#each args as arg (arg.id)}
      <div class="grid gap-2 md:grid-cols-[8rem_minmax(0,1fr)_auto_auto] items-center">
        <Input
          placeholder="-flag"
          value={arg.flag}
          oninput={(event) => updateOverride(arg.id, { flag: event.currentTarget.value })}
        />
        <Input
          placeholder="Optional value"
          value={arg.value ?? ''}
          oninput={(event) => updateOverride(arg.id, { value: event.currentTarget.value || undefined })}
        />
        <div class="flex items-center gap-2">
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
