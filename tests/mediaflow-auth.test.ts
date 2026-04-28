import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());
const getCurrentMock = vi.hoisted(() => vi.fn<() => Promise<string[] | null>>(async () => null));
const onOpenUrlMock = vi.hoisted(() => vi.fn<() => Promise<() => void>>(async () => () => {}));
const openUrlMock = vi.hoisted(() => vi.fn<(url: string) => Promise<void>>(async () => undefined));
const listenMock = vi.hoisted(() => vi.fn<() => Promise<() => void>>(async () => () => {}));
const httpFetchMock = vi.hoisted(() => vi.fn<typeof fetch>());
const settingsStoreMock = vi.hoisted(() => ({
  settings: {
    mediaflowBaseUrl: 'http://localhost:5173',
    mediaflowUser: null,
  },
  setMediaFlowUser: vi.fn(async (user) => {
    settingsStoreMock.settings.mediaflowUser = user;
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}));

vi.mock('@tauri-apps/plugin-deep-link', () => ({
  getCurrent: getCurrentMock,
  onOpenUrl: onOpenUrlMock,
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: openUrlMock,
}));

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: httpFetchMock,
}));

vi.mock('$lib/stores/settings.svelte', () => ({
  settingsStore: settingsStoreMock,
}));

vi.mock('$lib/stores/logs.svelte', () => ({
  logStore: {
    addLog: vi.fn(),
  },
}));

describe('MediaFlow OAuth helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    settingsStoreMock.settings.mediaflowBaseUrl = 'http://localhost:5173';
    settingsStoreMock.settings.mediaflowUser = null;
    invokeMock.mockReset();
    getCurrentMock.mockReset();
    getCurrentMock.mockResolvedValue(null);
    onOpenUrlMock.mockReset();
    onOpenUrlMock.mockResolvedValue(() => {});
    openUrlMock.mockReset();
    openUrlMock.mockResolvedValue(undefined);
    listenMock.mockReset();
    listenMock.mockResolvedValue(() => {});
    httpFetchMock.mockReset();

    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key);
      }),
    });
  });

  it('creates the RFC 7636 S256 code challenge', async () => {
    const { createCodeChallenge } = await import('../src/lib/services/mediaflow-auth');

    await expect(
      createCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    ).resolves.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('parses and validates the custom scheme callback', async () => {
    const { parseOAuthCallbackUrl } = await import('../src/lib/services/mediaflow-auth');

    expect(parseOAuthCallbackUrl('mediaflow://oauth/callback?code=abc&state=xyz', 'xyz')).toEqual({
      code: 'abc',
      state: 'xyz',
    });
    expect(() => parseOAuthCallbackUrl('mediaflow://oauth/callback?code=abc&state=bad', 'xyz'))
      .toThrow(/state mismatch/i);
    expect(() => parseOAuthCallbackUrl('https://localhost/callback?code=abc&state=xyz', 'xyz'))
      .toThrow(/invalid/i);
  });

  it('persists pending PKCE state so a deep-link app restart can finish login', async () => {
    const { signInWithMediaFlow } = await import('../src/lib/services/mediaflow-auth');

    await signInWithMediaFlow();

    const authorizeUrl = new URL(openUrlMock.mock.calls[0]?.[0] as string);
    const callbackUrl = `mediaflow://oauth/callback?code=auth-code&state=${authorizeUrl.searchParams.get('state')}`;

    vi.resetModules();
    getCurrentMock.mockResolvedValue([callbackUrl]);
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'store_refresh_token') return undefined;
      if (command === 'get_refresh_token') return 'refresh-token';
      throw new Error(`Unexpected command: ${command}`);
    });

    httpFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        email: 'local@example.com',
        name: 'Local User',
      }), { status: 200 }));

    const { initMediaFlowAuth } = await import('../src/lib/services/mediaflow-auth');
    await initMediaFlowAuth();

    expect(httpFetchMock).toHaveBeenCalledTimes(2);
    expect(invokeMock).toHaveBeenCalledWith('store_refresh_token', { refreshToken: 'refresh-token' });
    expect(invokeMock).toHaveBeenCalledWith('get_refresh_token');
    const body = httpFetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('code_verifier')).toBeTruthy();
    expect(settingsStoreMock.settings.mediaflowUser).toEqual({
      email: 'local@example.com',
      name: 'Local User',
    });
  });

  it('rejects sign-in if the token response does not include a refresh token', async () => {
    const { signInWithMediaFlow } = await import('../src/lib/services/mediaflow-auth');

    await signInWithMediaFlow();

    const authorizeUrl = new URL(openUrlMock.mock.calls[0]?.[0] as string);
    const callbackUrl = `mediaflow://oauth/callback?code=auth-code&state=${authorizeUrl.searchParams.get('state')}`;

    vi.resetModules();
    getCurrentMock.mockResolvedValue([callbackUrl]);
    invokeMock.mockImplementation(async (command: string) => {
      throw new Error(`Unexpected command: ${command}`);
    });

    httpFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'access-token',
      expires_in: 3600,
    }), { status: 200 }));

    const { initMediaFlowAuth } = await import('../src/lib/services/mediaflow-auth');
    await expect(initMediaFlowAuth()).rejects.toThrow(/refresh token/i);

    expect(invokeMock).not.toHaveBeenCalled();
    expect(settingsStoreMock.settings.mediaflowUser).toBeNull();
  });

  it('ignores a stale current callback when no login is pending', async () => {
    getCurrentMock.mockResolvedValue(['mediaflow://oauth/callback?code=old&state=old']);

    const { initMediaFlowAuth } = await import('../src/lib/services/mediaflow-auth');

    await expect(initMediaFlowAuth()).resolves.toBeUndefined();
  });

  it('refreshes a token and retries once after an invalid bearer response', async () => {
    let storedRefreshToken = 'refresh-token';
    invokeMock.mockImplementation(async (command: string, args?: { refreshToken?: string }) => {
      if (command === 'get_refresh_token') return storedRefreshToken;
      if (command === 'store_refresh_token') {
        storedRefreshToken = args?.refreshToken ?? storedRefreshToken;
        return undefined;
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    httpFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_in: 3600,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        email: 'local@example.com',
        name: 'Local User',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 'invalid_token', message: 'Invalid or expired token.' },
      }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access-2',
        refresh_token: 'refresh-2',
        expires_in: 3600,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        email: 'local@example.com',
        name: 'Local User',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const { fetchMediaFlowApi } = await import('../src/lib/services/mediaflow-auth');
    const response = await fetchMediaFlowApi('/api/v1/models', { method: 'GET' });

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(httpFetchMock).toHaveBeenCalledTimes(6);
    const firstApiHeaders = new Headers(httpFetchMock.mock.calls[2]?.[1]?.headers);
    const retriedApiHeaders = new Headers(httpFetchMock.mock.calls[5]?.[1]?.headers);
    expect(firstApiHeaders.get('Authorization')).toBe('Bearer access-1');
    expect(retriedApiHeaders.get('Authorization')).toBe('Bearer access-2');
  });
});
