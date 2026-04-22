import { getDirectoryFromPath } from '$lib/services/rename';

export type OutputFolderFieldState = 'empty' | 'fallback' | 'explicit';

export interface ResolveOutputFolderDisplayOptions {
  explicitPath?: string;
  sourcePaths?: string[];
  placeholder?: string;
  fallbackLabel?: string;
  allowSourceFallback?: boolean;
}

export interface ResolvedOutputFolderDisplay {
  displayText: string;
  state: OutputFolderFieldState;
  showReset: boolean;
}

function getUniqueSourceDirectories(sourcePaths: string[]): string[] {
  const uniqueDirectories = new Set<string>();

  for (const sourcePath of sourcePaths) {
    const normalizedPath = sourcePath.trim();
    if (!normalizedPath) {
      continue;
    }

    const directory = getDirectoryFromPath(normalizedPath);
    if (directory) {
      uniqueDirectories.add(directory);
    }
  }

  return Array.from(uniqueDirectories);
}

export function resolveOutputFolderDisplay(
  options: ResolveOutputFolderDisplayOptions = {},
): ResolvedOutputFolderDisplay {
  const {
    explicitPath = '',
    sourcePaths = [],
    placeholder = 'Select output folder...',
    fallbackLabel = 'Use each source folder',
    allowSourceFallback = false,
  } = options;

  const normalizedExplicitPath = explicitPath.trim();
  const normalizedPlaceholder = placeholder.trim() || 'Select output folder...';
  const normalizedFallbackLabel = fallbackLabel.trim() || 'Use each source folder';

  const sourceDirectories = allowSourceFallback ? getUniqueSourceDirectories(sourcePaths) : [];

  let fallbackDisplayText = '';
  if (sourceDirectories.length === 1) {
    fallbackDisplayText = sourceDirectories[0] ?? '';
  } else if (sourceDirectories.length > 1) {
    fallbackDisplayText = normalizedFallbackLabel;
  }

  if (normalizedExplicitPath) {
    return {
      displayText: normalizedExplicitPath,
      state: 'explicit',
      showReset: allowSourceFallback,
    };
  }

  if (fallbackDisplayText) {
    return {
      displayText: fallbackDisplayText,
      state: 'fallback',
      showReset: false,
    };
  }

  return {
    displayText: normalizedPlaceholder,
    state: 'empty',
    showReset: false,
  };
}
