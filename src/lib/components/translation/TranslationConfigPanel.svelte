<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import * as Select from '$lib/components/ui/select';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';

  import { translationStore, settingsStore } from '$lib/stores';
  import { LLM_PROVIDERS, SUPPORTED_LANGUAGES, type LLMProvider, type LanguageCode, type ProviderModel } from '$lib/types';

  import Languages from 'lucide-svelte/icons/languages';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import Bot from 'lucide-svelte/icons/bot';
  import Key from 'lucide-svelte/icons/key';

  interface TranslationConfigPanelProps {
    onNavigateToSettings?: () => void;
  }

  let { onNavigateToSettings }: TranslationConfigPanelProps = $props();

  // Filter out 'auto' for target language
  const targetLanguages = SUPPORTED_LANGUAGES.filter(l => l.code !== 'auto');

  // Provider keys for iteration
  const providerKeys: LLMProvider[] = ['google', 'anthropic', 'openai', 'openrouter'];

  // Get current provider info
  const currentProvider = $derived(LLM_PROVIDERS[translationStore.config.provider as LLMProvider]);
  const hasModels = $derived(currentProvider.models.length > 0);
  const currentApiKey = $derived(settingsStore.getLLMApiKey(translationStore.config.provider));
  const hasApiKey = $derived(!!currentApiKey);

  // OpenRouter custom model input
  let customModel = $state('');

  function getProviderApiKey(provider: LLMProvider): string {
    return settingsStore.getLLMApiKey(provider);
  }

  function getSelectedModelName(): string {
    const model = currentProvider.models.find((m: ProviderModel) => m.id === translationStore.config.model);
    return model?.name || 'Select model';
  }

  function handleProviderChange(value: string) {
    translationStore.setProvider(value as LLMProvider);
    // Set default model for providers with fixed models
    const provider = LLM_PROVIDERS[value as LLMProvider];
    if (provider.models.length > 0) {
      translationStore.setModel(provider.models[0].id);
    } else {
      translationStore.setModel(customModel);
    }
  }

  function handleModelChange(value: string) {
    translationStore.setModel(value);
  }

  function handleCustomModelChange(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    customModel = value;
    translationStore.setModel(value);
  }

  function handleSourceLangChange(value: string) {
    translationStore.setSourceLanguage(value as LanguageCode);
  }

  function handleTargetLangChange(value: string) {
    translationStore.setTargetLanguage(value as LanguageCode);
  }
</script>

<Card.Root>
  <Card.Header>
    <div class="flex items-center gap-2">
      <Languages class="size-5 text-primary" />
      <Card.Title>Translation Settings</Card.Title>
    </div>
    <Card.Description>
      Configure languages and AI model for translation
    </Card.Description>
  </Card.Header>
  <Card.Content class="space-y-6">
    <!-- Language Selection -->
    <div class="space-y-4">
      <Label class="text-sm font-medium">Languages</Label>
      <div class="flex items-center gap-3">
        <!-- Source Language -->
        <div class="flex-1">
          <Select.Root
            type="single"
            value={translationStore.config.sourceLanguage}
            onValueChange={handleSourceLangChange}
          >
            <Select.Trigger class="w-full">
              {SUPPORTED_LANGUAGES.find(l => l.code === translationStore.config.sourceLanguage)?.name || 'Select source'}
            </Select.Trigger>
            <Select.Content>
              {#each SUPPORTED_LANGUAGES as lang (lang.code)}
                <Select.Item value={lang.code}>{lang.name}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <ArrowRight class="size-5 text-muted-foreground shrink-0" />

        <!-- Target Language -->
        <div class="flex-1">
          <Select.Root
            type="single"
            value={translationStore.config.targetLanguage}
            onValueChange={handleTargetLangChange}
          >
            <Select.Trigger class="w-full">
              {targetLanguages.find(l => l.code === translationStore.config.targetLanguage)?.name || 'Select target'}
            </Select.Trigger>
            <Select.Content>
              {#each targetLanguages as lang (lang.code)}
                <Select.Item value={lang.code}>{lang.name}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>
    </div>

    <!-- Provider Selection -->
    <div class="space-y-2">
      <Label class="text-sm font-medium">AI Provider</Label>
      <Select.Root
        type="single"
        value={translationStore.config.provider}
        onValueChange={handleProviderChange}
      >
        <Select.Trigger class="w-full">
          <div class="flex items-center gap-2">
            <Bot class="size-4" />
            <span>{currentProvider.name}</span>
            {#if !hasApiKey}
              <Badge variant="destructive" class="ml-auto text-xs">No API Key</Badge>
            {/if}
          </div>
        </Select.Trigger>
        <Select.Content>
          {#each providerKeys as providerKey (providerKey)}
            {@const provider = LLM_PROVIDERS[providerKey]}
            <Select.Item value={providerKey}>
              <div class="flex items-center gap-2">
                <span>{provider.name}</span>
                {#if !getProviderApiKey(providerKey)}
                  <Badge variant="outline" class="text-xs">No key</Badge>
                {/if}
              </div>
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <!-- Model Selection -->
    <div class="space-y-2">
      <Label class="text-sm font-medium">Model</Label>
      {#if hasModels}
        <Select.Root
          type="single"
          value={translationStore.config.model}
          onValueChange={handleModelChange}
        >
          <Select.Trigger class="w-full">
            {getSelectedModelName()}
          </Select.Trigger>
          <Select.Content>
            {#each currentProvider.models as model (model.id)}
              <Select.Item value={model.id}>{model.name}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      {:else}
        <!-- OpenRouter: manual model input -->
        <Input
          placeholder="Enter model name (e.g., anthropic/claude-3-opus)"
          value={customModel}
          oninput={handleCustomModelChange}
        />
        <p class="text-xs text-muted-foreground">
          Enter the full model ID from OpenRouter
        </p>
      {/if}
    </div>

    <!-- API Key Warning -->
    {#if !hasApiKey}
      <div class="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
        <Key class="size-4 text-destructive shrink-0" />
        <div class="flex-1 text-sm">
          <p class="font-medium text-destructive">API key required</p>
          <p class="text-muted-foreground">
            Configure your {currentProvider.name} API key in Settings
          </p>
        </div>
        <Button variant="outline" size="sm" onclick={() => onNavigateToSettings?.()}>
          Settings
        </Button>
      </div>
    {/if}
  </Card.Content>
</Card.Root>

