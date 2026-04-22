import { describe, expect, it } from 'vitest';

import { resolveOutputFolderDisplay } from '../src/lib/utils/output-folder';

describe('resolveOutputFolderDisplay', () => {
  it('returns the explicit path when one is set', () => {
    expect(resolveOutputFolderDisplay({
      explicitPath: '/exports/final',
      allowSourceFallback: false,
    })).toEqual({
      displayText: '/exports/final',
      state: 'explicit',
      showReset: false,
    });
  });

  it('falls back to the unique source directory when source fallback is enabled', () => {
    expect(resolveOutputFolderDisplay({
      sourcePaths: [
        '/media/show/episode01.mkv',
        '/media/show/episode02.mkv',
      ],
      allowSourceFallback: true,
    })).toEqual({
      displayText: '/media/show',
      state: 'fallback',
      showReset: false,
    });
  });

  it('uses the fallback label when multiple source directories are present', () => {
    expect(resolveOutputFolderDisplay({
      sourcePaths: [
        '/media/show-a/episode01.mkv',
        '/media/show-b/episode02.mkv',
      ],
      allowSourceFallback: true,
      fallbackLabel: 'Use each source folder',
    })).toEqual({
      displayText: 'Use each source folder',
      state: 'fallback',
      showReset: false,
    });
  });

  it('returns the empty placeholder state when no default is available', () => {
    expect(resolveOutputFolderDisplay({
      explicitPath: '',
      allowSourceFallback: false,
    })).toEqual({
      displayText: 'Select output folder...',
      state: 'empty',
      showReset: false,
    });
  });

  it('shows reset only when an explicit path replaces a source fallback', () => {
    expect(resolveOutputFolderDisplay({
      explicitPath: '/exports/final',
      sourcePaths: ['/media/show/episode01.mkv'],
      allowSourceFallback: true,
    })).toEqual({
      displayText: '/exports/final',
      state: 'explicit',
      showReset: true,
    });
  });

  it('keeps reset available when an explicit path is set without current source files', () => {
    expect(resolveOutputFolderDisplay({
      explicitPath: '/exports/final',
      sourcePaths: [],
      allowSourceFallback: true,
    })).toEqual({
      displayText: '/exports/final',
      state: 'explicit',
      showReset: true,
    });
  });
});
