/**
 * Formatage du bitrate pour affichage
 */
export function formatBitrate(bitrate?: number): string {
  if (!bitrate) return 'N/A';

  if (bitrate >= 1_000_000) {
    return `${(bitrate / 1_000_000).toFixed(1)} Mbps`;
  }
  if (bitrate >= 1_000) {
    return `${(bitrate / 1_000).toFixed(0)} kbps`;
  }
  return `${bitrate} bps`;
}

/**
 * Formatage de la taille de fichier
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Formatage de la durée en hh:mm:ss
 */
export function formatDuration(seconds?: number): string {
  if (!seconds) return 'N/A';

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Obtenir le nom de la langue à partir du code ISO 639-2/B
 */
const languageNames: Record<string, string> = {
  fra: 'Français',
  fre: 'Français',
  eng: 'English',
  spa: 'Español',
  ger: 'Deutsch',
  deu: 'Deutsch',
  ita: 'Italiano',
  por: 'Português',
  jpn: '日本語',
  kor: '한국어',
  chi: '中文',
  zho: '中文',
  rus: 'Русский',
  ara: 'العربية',
  hin: 'हिन्दी',
  und: 'Undefined',
};

export function formatLanguage(code?: string): string {
  if (!code) return 'Unknown';
  return languageNames[code.toLowerCase()] || code.toUpperCase();
}

/**
 * Formatage du nombre de canaux audio
 */
export function formatChannels(channels?: number): string {
  if (!channels) return 'N/A';

  switch (channels) {
    case 1: return 'Mono';
    case 2: return 'Stereo';
    case 6: return '5.1';
    case 8: return '7.1';
    default: return `${channels}ch`;
  }
}

/**
 * Formatage de la résolution vidéo
 */
export function formatResolution(width?: number, height?: number): string {
  if (!width || !height) return 'N/A';

  // Common resolution names
  if (width >= 3840 && height >= 2160) return `4K (${width}×${height})`;
  if (width >= 2560 && height >= 1440) return `1440p (${width}×${height})`;
  if (width >= 1920 && height >= 1080) return `1080p (${width}×${height})`;
  if (width >= 1280 && height >= 720) return `720p (${width}×${height})`;
  if (width >= 854 && height >= 480) return `480p (${width}×${height})`;

  return `${width}×${height}`;
}

/**
 * Obtenir l'icône appropriée pour le type de piste
 */
export function getTrackTypeIcon(type: string): string {
  switch (type) {
    case 'video': return '🎬';
    case 'audio': return '🔊';
    case 'subtitle': return '💬';
    case 'data': return '📊';
    default: return '📄';
  }
}

/**
 * Extraire le nom de fichier d'un chemin
 */
export function getFileName(path: string): string {
  return path.split('/').pop() || path.split('\\').pop() || path;
}

/**
 * Extraire l'extension d'un fichier
 */
export function getFileExtension(path: string): string {
  const name = getFileName(path);
  const lastDot = name.lastIndexOf('.');
  return lastDot > 0 ? name.substring(lastDot) : '';
}

/**
 * Construire le nom de fichier de sortie pour l'extraction
 */
export function buildOutputFileName(
  inputPath: string,
  trackId: number,
  trackType: string,
  codec: string,
  language?: string
): string {
  const baseName = getFileName(inputPath).replace(/\.[^/.]+$/, '');
  const langSuffix = language ? `.${language}` : '';
  const trackSuffix = `.track${trackId}`;

  // Import dynamique de getExtensionForCodec
  const codecExtensions: Record<string, string> = {
    ass: '.ass',
    ssa: '.ssa',
    subrip: '.srt',
    srt: '.srt',
    webvtt: '.vtt',
    mov_text: '.srt',
    dvd_subtitle: '.sub',
    hdmv_pgs_subtitle: '.sup',
    pgs: '.sup',
    aac: '.aac',
    ac3: '.ac3',
    eac3: '.eac3',
    dts: '.dts',
    mp3: '.mp3',
    flac: '.flac',
    opus: '.opus',
    vorbis: '.ogg',
    truehd: '.thd',
    h264: '.mp4',
    hevc: '.mp4',
    h265: '.mp4',
    vp9: '.webm',
    av1: '.mp4',
  };

  const extension = codecExtensions[codec.toLowerCase()] || `.${codec}`;

  return `${baseName}${langSuffix}${trackSuffix}${extension}`;
}

