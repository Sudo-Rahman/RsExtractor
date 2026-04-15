import { getVersion } from '@tauri-apps/api/app';

let cachedAppVersion: string | null = null;
let appVersionPromise: Promise<string> | null = null;

function normalizeVersion(version: string): string {
  const trimmed = version.trim();
  if (trimmed.length === 0) {
    throw new Error('Application version is empty');
  }

  return trimmed;
}

export function formatAppVersion(version: string): string {
  return `v${normalizeVersion(version)}`;
}

export async function loadAppVersion(): Promise<string> {
  if (cachedAppVersion !== null) {
    return cachedAppVersion;
  }

  appVersionPromise ??= getVersion().then((version) => {
    cachedAppVersion = normalizeVersion(version);
    return cachedAppVersion;
  });

  return appVersionPromise;
}
