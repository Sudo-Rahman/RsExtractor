<script lang="ts">
  import { toast } from 'svelte-sonner';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import {
    ChevronsUpDown,
    FileOutput,
    FileVideo,
    GitMerge,
    Info,
    LayoutDashboard,
    Loader2,
    LogIn,
    LogOut,
    XCircle,
    Settings,
    Languages,
    PenLine,
    AudioLines,
    ScanText,
    UserRound,
  } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import type { ComponentProps } from 'svelte';

  import { Badge } from '$lib/components/ui/badge';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { settingsStore } from '$lib/stores';
  import { formatAppVersion, loadAppVersion } from '$lib/services/app-metadata';
  import {
    cancelPendingMediaFlowSignIn,
    signInWithMediaFlow,
    signOutMediaFlow,
  } from '$lib/services/mediaflow-auth';
  import { OS } from '$lib/utils';

  interface NavItem {
    id: string;
    title: string;
    icon: typeof FileOutput;
    badge?: string;
  }

  const navItems: NavItem[] = [
    {
      id: 'extract',
      title: 'Extraction',
      icon: FileOutput,
    },
    {
      id: 'merge',
      title: 'Merge',
      icon: GitMerge,
    },
    {
      id: 'transcode',
      title: 'Transcode',
      icon: FileVideo,
    },
    {
      id: 'audio-to-subs',
      title: 'Audio to Subs',
      icon: AudioLines,
    },
    {
      id: 'video-ocr',
      title: 'Video OCR',
      icon: ScanText,
    },
    {
      id: 'translate',
      title: 'AI Translation',
      icon: Languages,
    },
    {
      id: 'rename',
      title: 'Rename',
      icon: PenLine,
    },
    {
      id: 'info',
      title: 'Info',
      icon: Info,
    },
  ];

  interface AppSidebarProps extends ComponentProps<typeof Sidebar.Root> {
    currentView?: string;
    onNavigate?: (viewId: string) => void;
  }

  type AccountAction = 'idle' | 'opening-browser' | 'waiting-callback' | 'signing-out';

  let {
    currentView = 'extract',
    onNavigate,
    ...restProps
  }: AppSidebarProps = $props();

  const isMacOS = OS() === 'MacOS';
  let appVersionLabel = $state('Loading version...');
  let accountAction = $state<AccountAction>('idle');
  const mediaflowUser = $derived(settingsStore.settings.mediaflowUser);
  const effectiveAccountAction = $derived(
    mediaflowUser && (accountAction === 'opening-browser' || accountAction === 'waiting-callback')
      ? 'idle'
      : accountAction
  );
  const isAccountBusy = $derived(effectiveAccountAction !== 'idle');
  const isWaitingForCallback = $derived(effectiveAccountAction === 'waiting-callback');
  const accountDisplayName = $derived(
    mediaflowUser?.name ||
      mediaflowUser?.email ||
      (isWaitingForCallback ? 'Waiting for browser' : 'MediaFlow Account')
  );
  const accountEmail = $derived.by(() => {
    if (effectiveAccountAction === 'opening-browser') return 'Opening sign-in page...';
    if (effectiveAccountAction === 'waiting-callback') return 'Complete sign-in in your browser';
    if (effectiveAccountAction === 'signing-out') return 'Signing out...';
    return mediaflowUser?.email || 'Sign in to continue';
  });
  const accountButtonLabel = $derived.by(() => {
    if (effectiveAccountAction === 'opening-browser') return 'Opening...';
    if (effectiveAccountAction === 'waiting-callback') return 'Waiting...';
    if (effectiveAccountAction === 'signing-out') return 'Signing out...';
    return 'Account';
  });
  const accountInitials = $derived.by(() => {
    const source = mediaflowUser?.name || mediaflowUser?.email || 'MF';
    const parts = source.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return source.slice(0, 2).toUpperCase();
  });

  onMount(() => {
    void loadAppVersion()
      .then((version) => {
        appVersionLabel = formatAppVersion(version);
      })
      .catch(() => {
        appVersionLabel = 'Version unavailable';
      });
  });

  function dashboardUrl() {
    return `${(settingsStore.settings.mediaflowBaseUrl || 'http://localhost:5173').replace(/\/+$/, '')}/dashboard`;
  }

  async function handleOpenDashboard() {
    try {
      await openUrl(dashboardUrl());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    }
  }

  async function handleSignIn() {
    if (isAccountBusy) return;

    accountAction = 'opening-browser';
    try {
      await signInWithMediaFlow();
      accountAction = 'waiting-callback';
      toast.info('Complete sign-in in your browser');
    } catch (error) {
      accountAction = 'idle';
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    }
  }

  async function handleSignOut() {
    if (!mediaflowUser || isAccountBusy) return;

    accountAction = 'signing-out';
    try {
      await signOutMediaFlow();
      toast.success('Signed out from MediaFlow');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    } finally {
      accountAction = 'idle';
    }
  }

  function handleCancelSignIn() {
    cancelPendingMediaFlowSignIn();
    accountAction = 'idle';
    toast.info('MediaFlow sign-in cancelled');
  }
  
</script>

<Sidebar.Root variant="floating"  {...restProps}>
  <Sidebar.Header>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton size="lg" class="pointer-events-none">
          {#snippet child({ props })}
            <div {...props} class="flex items-center gap-2" class:pt-8={isMacOS} data-tauri-drag-region={isMacOS}>
              <img
                src="/mediaflow-logo.svg"
                alt="MediaFlow logo"
                class="size-10 rounded-lg object-contain shrink-0"
                draggable="false"
              />
              <div class="flex flex-col gap-0.5 leading-none">
                <span class="font-semibold">MediaFlow</span>
                <span class="text-xs text-muted-foreground">{appVersionLabel}</span>
              </div>
            </div>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Header>

  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupLabel>Tools</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          {#each navItems as item (item.id)}
            {@const Icon = item.icon}
            {@const isActive = currentView === item.id}
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={isActive}
                onclick={() => onNavigate?.(item.id)}
              >
                <Icon class="size-4" />
                <span>{item.title}</span>
              </Sidebar.MenuButton>
              {#if item.badge}
                <Sidebar.MenuBadge>
                  <Badge variant="secondary" class="text-xs">{item.badge}</Badge>
                </Sidebar.MenuBadge>
              {/if}
            </Sidebar.MenuItem>
          {/each}
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>

  <Sidebar.Footer>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        {@const isSettingsActive = currentView === 'settings'}
        <Sidebar.MenuButton
          isActive={isSettingsActive}
          onclick={() => onNavigate?.('settings')}
        >
          <Settings class="size-4" />
          <span>Settings</span>
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
      <Sidebar.MenuItem>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Sidebar.MenuButton {...props} class={['transition-colors', isAccountBusy && 'text-primary']}>
                {#if isAccountBusy}
                  <Loader2 class="size-4 animate-spin" />
                {:else}
                  <UserRound class="size-4" />
                {/if}
                <span>{accountButtonLabel}</span>
                <ChevronsUpDown class={['ml-auto size-4 text-muted-foreground transition-transform duration-200', isAccountBusy && 'rotate-180']} />
              </Sidebar.MenuButton>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content side="right" align="end" class="w-56">
            <DropdownMenu.Label>
              <div class="flex items-center gap-2 py-1">
                <div class={['flex size-8 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-medium transition-colors', isAccountBusy && 'border-primary/40 bg-primary/10 text-primary']}>
                  {#if mediaflowUser}
                    {accountInitials}
                  {:else}
                    <UserRound class="size-4 text-muted-foreground" />
                  {/if}
                </div>
                <div class="min-w-0 leading-tight">
                  <p class="truncate text-sm font-medium">{accountDisplayName}</p>
                  <p class="truncate text-xs font-normal text-muted-foreground">{accountEmail}</p>
                </div>
              </div>
            </DropdownMenu.Label>
            <DropdownMenu.Separator />
            {#if mediaflowUser}
              <DropdownMenu.Item onclick={handleOpenDashboard} disabled={isAccountBusy}>
                <LayoutDashboard class="size-4" />
                <span>Dashboard</span>
              </DropdownMenu.Item>
            {:else if isWaitingForCallback}
              <DropdownMenu.Item onclick={handleCancelSignIn}>
                <XCircle class="size-4" />
                <span>Cancel sign-in</span>
              </DropdownMenu.Item>
            {:else}
              <DropdownMenu.Item onclick={handleSignIn} disabled={isAccountBusy}>
                {#if effectiveAccountAction === 'opening-browser'}
                  <LogIn class="size-4" />
                  <span>Opening browser...</span>
                {:else}
                  <LogIn class="size-4" />
                  <span>Sign in</span>
                {/if}
              </DropdownMenu.Item>
            {/if}
            <DropdownMenu.Separator />
            <DropdownMenu.Item
              onclick={handleSignOut}
              disabled={!mediaflowUser || isAccountBusy}
              variant="destructive"
            >
              {#if effectiveAccountAction === 'signing-out'}
                <LogOut class="size-4" />
                <span>Signing out...</span>
              {:else}
                <LogOut class="size-4" />
                <span>Log out</span>
              {/if}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Footer>

</Sidebar.Root>
