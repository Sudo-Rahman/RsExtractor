import { DEEPGRAM_LANGUAGES } from '$lib/types';

import { formatLanguage } from './format';

const INVALID_AUDIO_LANGUAGE_TAGS = new Set([
  '',
  'null',
  'n/a',
  'none',
  'und',
  'undefined',
  'unknown',
]);

const TRACK_LANGUAGE_ALIASES: Record<string, string> = {
  ara: 'ar',
  arabic: 'ar',
  ben: 'bn',
  bengali: 'bn',
  bul: 'bg',
  bulgarian: 'bg',
  cat: 'ca',
  catalan: 'ca',
  ces: 'cs',
  cze: 'cs',
  czech: 'cs',
  dan: 'da',
  danish: 'da',
  deu: 'de',
  dut: 'nl',
  dutch: 'nl',
  ell: 'el',
  eng: 'en',
  english: 'en',
  fa: 'fa',
  fas: 'fa',
  finnish: 'fi',
  fin: 'fi',
  fra: 'fr',
  fre: 'fr',
  french: 'fr',
  ger: 'de',
  german: 'de',
  gre: 'el',
  greek: 'el',
  heb: 'he',
  hebrew: 'he',
  hin: 'hi',
  hindi: 'hi',
  hun: 'hu',
  hungarian: 'hu',
  ind: 'id',
  indonesian: 'id',
  ita: 'it',
  italian: 'it',
  jap: 'ja',
  japanese: 'ja',
  jpn: 'ja',
  kor: 'ko',
  korean: 'ko',
  malay: 'ms',
  msa: 'ms',
  nld: 'nl',
  norwegian: 'no',
  nor: 'no',
  per: 'fa',
  persian: 'fa',
  pol: 'pl',
  polish: 'pl',
  por: 'pt',
  portuguese: 'pt',
  romanian: 'ro',
  ron: 'ro',
  rum: 'ro',
  rus: 'ru',
  russian: 'ru',
  slo: 'sk',
  slovak: 'sk',
  slk: 'sk',
  spa: 'es',
  spanish: 'es',
  swe: 'sv',
  swedish: 'sv',
  tam: 'ta',
  tamil: 'ta',
  tel: 'te',
  telugu: 'te',
  tha: 'th',
  thai: 'th',
  tur: 'tr',
  turkish: 'tr',
  ukr: 'uk',
  ukrainian: 'uk',
  vie: 'vi',
  vietnamese: 'vi',
  zho: 'zh',
  chi: 'zh',
  chinese: 'zh',
};

const SUPPORTED_DEEPGRAM_LANGUAGE_CODES = new Set(
  DEEPGRAM_LANGUAGES
    .map((language) => language.code)
    .filter((code) => code !== 'multi'),
);

export function normalizeAudioTrackLanguageTag(rawLanguage?: string): string | null {
  const normalized = rawLanguage?.trim().toLowerCase();
  if (!normalized || INVALID_AUDIO_LANGUAGE_TAGS.has(normalized)) {
    return null;
  }

  return normalized;
}

export function resolveDeepgramTrackLanguage(rawLanguage?: string): string | null {
  const normalized = normalizeAudioTrackLanguageTag(rawLanguage);
  if (!normalized) {
    return null;
  }

  const mapped = TRACK_LANGUAGE_ALIASES[normalized] ?? normalized;
  return SUPPORTED_DEEPGRAM_LANGUAGE_CODES.has(mapped) ? mapped : null;
}

export function getAudioTrackLanguageLabel(rawLanguage?: string): string | null {
  const resolved = resolveDeepgramTrackLanguage(rawLanguage);
  if (resolved) {
    return DEEPGRAM_LANGUAGES.find((language) => language.code === resolved)?.name ?? resolved.toUpperCase();
  }

  const normalized = normalizeAudioTrackLanguageTag(rawLanguage);
  if (!normalized) {
    return null;
  }

  return formatLanguage(normalized);
}
