import { open } from '@tauri-apps/plugin-dialog';

export async function pickOutputDirectory(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select output folder',
  });

  return typeof selected === 'string' ? selected : null;
}
