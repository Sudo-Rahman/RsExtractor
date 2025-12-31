/**
 * Subtitle Parser Module
 * Parses SRT, VTT, ASS/SSA files into a common Cue[] structure
 */

import type {
  Cue,
  ParsedSubtitle,
  SubtitleFormat,
  Placeholder
} from '$lib/types/subtitle';

// ============================================================================
// PLACEHOLDER GENERATION
// ============================================================================

const PLACEHOLDER_PREFIX = '⟦';
const PLACEHOLDER_SUFFIX = '⟧';

/**
 * Generate a placeholder token
 */
function makePlaceholder(type: string, index: number): string {
  return `${PLACEHOLDER_PREFIX}${type}_${index}${PLACEHOLDER_SUFFIX}`;
}

/**
 * Tokenize ASS/SSA text: replace override tags {...} and \N with placeholders
 */
function tokenizeASSText(text: string): { skeleton: string; placeholders: Placeholder[] } {
  const placeholders: Placeholder[] = [];
  let placeholderIndex = 0;

  // Replace override tags {...}
  let skeleton = text.replace(/\{[^}]*\}/g, (match) => {
    const token = makePlaceholder('TAG', placeholderIndex);
    placeholders.push({
      index: placeholderIndex,
      token,
      original: match
    });
    placeholderIndex++;
    return token;
  });

  // Replace \N (hard line break in ASS) with placeholder
  skeleton = skeleton.replace(/\\N/g, (match) => {
    const token = makePlaceholder('BR', placeholderIndex);
    placeholders.push({
      index: placeholderIndex,
      token,
      original: match
    });
    placeholderIndex++;
    return token;
  });

  // Replace \n (soft line break) with placeholder
  skeleton = skeleton.replace(/\\n/g, (match) => {
    const token = makePlaceholder('SBR', placeholderIndex);
    placeholders.push({
      index: placeholderIndex,
      token,
      original: match
    });
    placeholderIndex++;
    return token;
  });

  return { skeleton, placeholders };
}

/**
 * Tokenize SRT/VTT text: replace HTML tags and \N with placeholders
 */
function tokenizeSRTVTTText(text: string): { skeleton: string; placeholders: Placeholder[] } {
  const placeholders: Placeholder[] = [];
  let placeholderIndex = 0;

  // Replace HTML-like tags <tag>...</tag> or <tag/>
  let skeleton = text.replace(/<\/?[^>]+>/g, (match) => {
    const token = makePlaceholder('HTML', placeholderIndex);
    placeholders.push({
      index: placeholderIndex,
      token,
      original: match
    });
    placeholderIndex++;
    return token;
  });

  // Replace HTML entities like &amp; &lt; etc.
  skeleton = skeleton.replace(/&[a-zA-Z]+;/g, (match) => {
    const token = makePlaceholder('ENT', placeholderIndex);
    placeholders.push({
      index: placeholderIndex,
      token,
      original: match
    });
    placeholderIndex++;
    return token;
  });

  return { skeleton, placeholders };
}

// ============================================================================
// TIME PARSING
// ============================================================================

/**
 * Parse SRT timestamp (HH:MM:SS,mmm) to milliseconds
 */
function parseSRTTime(time: string): number {
  const match = time.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) return 0;

  const [, hours, minutes, seconds, ms] = match;
  return (
    parseInt(hours) * 3600000 +
    parseInt(minutes) * 60000 +
    parseInt(seconds) * 1000 +
    parseInt(ms)
  );
}

/**
 * Parse VTT timestamp (mm:ss.ttt or hh:mm:ss.ttt) to milliseconds
 */
function parseVTTTime(time: string): number {
  // Try hh:mm:ss.ttt format
  let match = time.match(/(\d{2,}):(\d{2}):(\d{2})\.(\d{3})/);
  if (match) {
    const [, hours, minutes, seconds, ms] = match;
    return (
      parseInt(hours) * 3600000 +
      parseInt(minutes) * 60000 +
      parseInt(seconds) * 1000 +
      parseInt(ms)
    );
  }

  // Try mm:ss.ttt format
  match = time.match(/(\d{2}):(\d{2})\.(\d{3})/);
  if (match) {
    const [, minutes, seconds, ms] = match;
    return (
      parseInt(minutes) * 60000 +
      parseInt(seconds) * 1000 +
      parseInt(ms)
    );
  }

  return 0;
}

/**
 * Parse ASS timestamp (h:mm:ss.cc) to milliseconds
 */
function parseASSTime(time: string): number {
  const match = time.match(/(\d+):(\d{2}):(\d{2})\.(\d{2})/);
  if (!match) return 0;

  const [, hours, minutes, seconds, cs] = match;
  return (
    parseInt(hours) * 3600000 +
    parseInt(minutes) * 60000 +
    parseInt(seconds) * 1000 +
    parseInt(cs) * 10  // centiseconds to ms
  );
}

// ============================================================================
// FORMAT DETECTION
// ============================================================================

/**
 * Detect subtitle format from content
 */
export function detectFormat(content: string): SubtitleFormat | null {
  const trimmed = content.trim();

  if (trimmed.startsWith('WEBVTT')) {
    return 'vtt';
  }

  if (trimmed.startsWith('[Script Info]') || trimmed.includes('[V4+ Styles]') || trimmed.includes('[V4 Styles]')) {
    // Detect SSA vs ASS
    if (trimmed.includes('[V4+ Styles]')) {
      return 'ass';
    }
    return 'ssa';
  }

  // SRT: starts with a number followed by timing
  if (/^\d+\s*\r?\n\d{2}:\d{2}:\d{2}[,.:]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.:]\d{3}/.test(trimmed)) {
    return 'srt';
  }

  // Also check for SRT with BOM
  if (/^\uFEFF?\d+\s*\r?\n/.test(trimmed)) {
    return 'srt';
  }

  return null;
}

// ============================================================================
// SRT PARSER
// ============================================================================

/**
 * Parse SRT file content
 */
export function parseSRT(content: string): ParsedSubtitle {
  const cues: Cue[] = [];

  // Normalize line endings and split by double newline
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\n+/).filter(block => block.trim());

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 2) continue;

    // First line: index
    const indexLine = lines[0].trim();
    const index = parseInt(indexLine);
    if (isNaN(index)) continue;

    // Second line: timing
    const timingLine = lines[1].trim();
    const timingMatch = timingLine.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!timingMatch) continue;

    const startMs = parseSRTTime(timingMatch[1]);
    const endMs = parseSRTTime(timingMatch[2]);

    // Remaining lines: text
    const textLines = lines.slice(2);
    const textOriginal = textLines.join('\n');

    // Tokenize text
    const { skeleton, placeholders } = tokenizeSRTVTTText(textOriginal);

    cues.push({
      id: `SRT_${index}`,
      index,
      startMs,
      endMs,
      rawPrefix: `${indexLine}\n${timingLine}\n`,
      textOriginal,
      textSkeleton: skeleton,
      placeholders,
      format: 'srt'
    });
  }

  return {
    format: 'srt',
    header: '',
    cues
  };
}

// ============================================================================
// VTT PARSER
// ============================================================================

/**
 * Parse WebVTT file content
 */
export function parseVTT(content: string): ParsedSubtitle {
  const cues: Cue[] = [];

  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  // Extract header (WEBVTT line and any metadata)
  let headerEnd = 0;
  let header = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('-->')) {
      headerEnd = i;
      break;
    }
    // Check for cue identifier (line before timing that's not empty)
    if (i > 0 && lines[i + 1]?.includes('-->')) {
      headerEnd = i;
      break;
    }
  }

  header = lines.slice(0, headerEnd).join('\n');

  // Parse cues
  let cueIndex = 0;
  let i = headerEnd;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) {
      i++;
      continue;
    }

    // Check if this is a cue identifier (optional in VTT)
    let cueId = '';
    let timingLineIndex = i;

    if (!line.includes('-->')) {
      cueId = line;
      timingLineIndex = i + 1;
    }

    // Parse timing line
    const timingLine = lines[timingLineIndex]?.trim() || '';
    const timingMatch = timingLine.match(/(\d{2}:)?(\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:)?(\d{2}:\d{2}\.\d{3})(.*)$/);

    if (!timingMatch) {
      i++;
      continue;
    }

    const startTime = (timingMatch[1] || '') + timingMatch[2];
    const endTime = (timingMatch[3] || '') + timingMatch[4];
    const cueSettings = timingMatch[5] || '';

    const startMs = parseVTTTime(startTime);
    const endMs = parseVTTTime(endTime);

    // Collect text lines until empty line or end
    const textLines: string[] = [];
    let j = timingLineIndex + 1;

    while (j < lines.length && lines[j].trim() !== '') {
      textLines.push(lines[j]);
      j++;
    }

    const textOriginal = textLines.join('\n');
    const { skeleton, placeholders } = tokenizeSRTVTTText(textOriginal);

    cues.push({
      id: cueId || `VTT_${cueIndex}`,
      index: cueIndex,
      startMs,
      endMs,
      rawPrefix: cueId ? `${cueId}\n${timingLine}\n` : `${timingLine}\n`,
      rawSuffix: cueSettings.trim(),
      textOriginal,
      textSkeleton: skeleton,
      placeholders,
      format: 'vtt'
    });

    cueIndex++;
    i = j + 1;
  }

  return {
    format: 'vtt',
    header: header + '\n\n',
    cues
  };
}

// ============================================================================
// ASS/SSA PARSER
// ============================================================================

/**
 * Parse ASS/SSA file content
 */
export function parseASS(content: string): ParsedSubtitle {
  const cues: Cue[] = [];
  const format: SubtitleFormat = content.includes('[V4+ Styles]') ? 'ass' : 'ssa';

  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  // Find sections
  let headerLines: string[] = [];
  let stylesLines: string[] = [];
  let eventsFormatLine = '';
  let eventsStartIndex = -1;
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect section headers
    if (trimmed.startsWith('[')) {
      currentSection = trimmed.toLowerCase();

      if (currentSection.includes('events')) {
        eventsStartIndex = i;
      } else if (currentSection.includes('styles')) {
        stylesLines.push(line);
      } else {
        headerLines.push(line);
      }
      continue;
    }

    // Add to appropriate section
    if (currentSection.includes('events')) {
      if (trimmed.startsWith('Format:')) {
        eventsFormatLine = line;
      }
    } else if (currentSection.includes('styles')) {
      stylesLines.push(line);
    } else {
      headerLines.push(line);
    }
  }

  // Parse Events format to know field order
  const formatFields = eventsFormatLine
    .replace(/^Format:\s*/i, '')
    .split(',')
    .map(f => f.trim().toLowerCase());

  const textFieldIndex = formatFields.indexOf('text');
  const styleFieldIndex = formatFields.indexOf('style');
  const nameFieldIndex = formatFields.indexOf('name');
  const startFieldIndex = formatFields.indexOf('start');
  const endFieldIndex = formatFields.indexOf('end');

  // Parse dialogue lines
  let cueIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Only process Dialogue lines (skip Comment, etc.)
    if (!trimmed.startsWith('Dialogue:')) continue;

    // Remove "Dialogue: " prefix
    const afterDialogue = trimmed.substring('Dialogue:'.length).trim();

    // Split by comma, but maxsplit = (numFields - 1) because Text can contain commas
    const parts: string[] = [];
    let current = '';
    let fieldCount = 0;

    for (let j = 0; j < afterDialogue.length; j++) {
      const char = afterDialogue[j];

      if (char === ',' && fieldCount < formatFields.length - 1) {
        parts.push(current);
        current = '';
        fieldCount++;
      } else {
        current += char;
      }
    }
    parts.push(current); // Last field (Text)

    // Extract fields
    const start = parts[startFieldIndex] || '0:00:00.00';
    const end = parts[endFieldIndex] || '0:00:00.00';
    const style = parts[styleFieldIndex] || '';
    const speaker = parts[nameFieldIndex] || '';
    const textOriginal = parts[textFieldIndex] || '';

    const startMs = parseASSTime(start);
    const endMs = parseASSTime(end);

    // Build raw prefix (everything before Text field)
    const prefixParts = parts.slice(0, textFieldIndex);
    const rawPrefix = `Dialogue: ${prefixParts.join(',')},`;

    // Tokenize text
    const { skeleton, placeholders } = tokenizeASSText(textOriginal);

    cues.push({
      id: `ASS_${cueIndex}_L${i}`,
      index: cueIndex,
      startMs,
      endMs,
      rawPrefix,
      textOriginal,
      textSkeleton: skeleton,
      placeholders,
      speaker: speaker || undefined,
      style: style || undefined,
      format
    });

    cueIndex++;
  }

  return {
    format,
    header: headerLines.join('\n'),
    stylesSection: stylesLines.join('\n'),
    eventsFormat: eventsFormatLine,
    cues
  };
}

// ============================================================================
// MAIN PARSER
// ============================================================================

/**
 * Parse any supported subtitle format
 */
export function parseSubtitle(content: string): ParsedSubtitle | null {
  const format = detectFormat(content);

  if (!format) {
    return null;
  }

  switch (format) {
    case 'srt':
      return parseSRT(content);
    case 'vtt':
      return parseVTT(content);
    case 'ass':
    case 'ssa':
      return parseASS(content);
    default:
      return null;
  }
}
