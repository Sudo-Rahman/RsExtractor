/**
 * Subtitle Parser Module
 * Parses SRT, VTT, ASS/SSA files into a common Cue[] structure
 */

import type {
  AssEventType,
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
const ASS_KARAOKE_TAG_PATTERN = /\\(?:k|K|kf|ko)\d+/;

/**
 * Generate a placeholder token
 */
function makePlaceholder(type: string, index: number): string {
  return `${PLACEHOLDER_PREFIX}${type}_${index}${PLACEHOLDER_SUFFIX}`;
}

function getAssDrawingMode(tag: string): number | null {
  let mode: number | null = null;
  const pattern = /\\p(-?\d+)/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(tag)) !== null) {
    mode = parseInt(match[1], 10);
  }

  return mode;
}

function protectAssDrawingSpans(
  text: string,
  makeProtectedPlaceholder: (type: string, original: string) => string
): string {
  let result = '';
  let cursor = 0;
  let drawingSpanStart: number | null = null;
  const tagPattern = /\{[^}]*\}/g;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(text)) !== null) {
    const tag = match[0];
    const tagStart = match.index;
    const tagEnd = tagStart + tag.length;
    const drawingMode = getAssDrawingMode(tag);

    if (drawingSpanStart === null) {
      if (drawingMode !== null && drawingMode > 0) {
        result += text.slice(cursor, tagStart);
        drawingSpanStart = tagStart;
      }
      continue;
    }

    if (drawingMode === 0) {
      result += makeProtectedPlaceholder('DRAW', text.slice(drawingSpanStart, tagEnd));
      cursor = tagEnd;
      drawingSpanStart = null;
    }
  }

  if (drawingSpanStart !== null) {
    result += makeProtectedPlaceholder('DRAW', text.slice(drawingSpanStart));
    cursor = text.length;
  }

  result += text.slice(cursor);
  return result;
}

/**
 * Tokenize ASS/SSA text: replace override tags {...} and \N with placeholders
 */
function tokenizeASSText(text: string): { skeleton: string; placeholders: Placeholder[] } {
  const placeholders: Placeholder[] = [];
  let placeholderIndex = 0;

  const protect = (type: string, original: string): string => {
    const token = makePlaceholder(type, placeholderIndex);
    placeholders.push({
      index: placeholderIndex,
      token,
      original
    });
    placeholderIndex++;
    return token;
  };

  let skeleton = protectAssDrawingSpans(text, protect);

  // Replace override tags {...}
  skeleton = skeleton.replace(/\{[^}]*\}/g, (match) => protect('TAG', match));

  // Replace \N (hard line break in ASS) with placeholder
  skeleton = skeleton.replace(/\\N/g, (match) => protect('BR', match));

  // Replace \n (soft line break) with placeholder
  skeleton = skeleton.replace(/\\n/g, (match) => protect('SBR', match));

  // Replace \h (non-breaking space in ASS) with placeholder
  skeleton = skeleton.replace(/\\h/g, (match) => protect('HSP', match));

  return { skeleton, placeholders };
}

function extractReadableAssText(text: string): string {
  return text
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\h/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim();
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

interface ParsedAssEventLine {
  eventType: AssEventType;
  fields: string[];
  rawPrefix: string;
  textOriginal: string;
}

function getAssEventType(line: string): AssEventType | null {
  const match = line.match(/^\s*(Dialogue|Comment)\s*:/i);
  if (!match) {
    return null;
  }

  return match[1].toLowerCase() === 'comment' ? 'Comment' : 'Dialogue';
}

function findAssTextStart(line: string, eventBodyStart: number, textFieldIndex: number): number | null {
  if (textFieldIndex === 0) {
    return eventBodyStart;
  }

  let commaCount = 0;
  for (let i = eventBodyStart; i < line.length; i++) {
    if (line[i] === ',') {
      commaCount++;
      if (commaCount === textFieldIndex) {
        return i + 1;
      }
    }
  }

  return null;
}

function parseAssEventLine(
  line: string,
  textFieldIndex: number
): ParsedAssEventLine | null {
  const eventType = getAssEventType(line);
  if (!eventType) {
    return null;
  }

  const prefixMatch = line.match(/^\s*(Dialogue|Comment)\s*:\s*/i);
  if (!prefixMatch) {
    return null;
  }

  const eventBodyStart = prefixMatch[0].length;
  const textStart = findAssTextStart(line, eventBodyStart, textFieldIndex);
  if (textStart === null) {
    return null;
  }

  const fieldsBeforeText = line.slice(eventBodyStart, Math.max(eventBodyStart, textStart - 1));
  const fields = textFieldIndex > 0 ? fieldsBeforeText.split(',') : [];

  if (fields.length !== textFieldIndex) {
    return null;
  }

  return {
    eventType,
    fields,
    rawPrefix: line.slice(0, textStart),
    textOriginal: line.slice(textStart)
  };
}

function getAssField(fields: string[], fieldIndex: number): string {
  return fieldIndex >= 0 && fieldIndex < fields.length ? fields[fieldIndex] : '';
}

function isUsefulAssComment(eventType: AssEventType, effect: string, textOriginal: string): boolean {
  const normalizedEffect = effect.trim().toLowerCase();
  const isTimedKaraoke = normalizedEffect === 'karaoke'
    || (normalizedEffect === '' && ASS_KARAOKE_TAG_PATTERN.test(textOriginal));

  return eventType === 'Comment'
    && isTimedKaraoke
    && extractReadableAssText(textOriginal).length > 0;
}

/**
 * Parse ASS/SSA file content
 */
export function parseASS(content: string): ParsedSubtitle {
  const cues: Cue[] = [];
  const parseWarnings: string[] = [];
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
  const effectFieldIndex = formatFields.indexOf('effect');

  if (textFieldIndex === -1) {
    parseWarnings.push('ASS/SSA Events Format has no Text field. Event lines were preserved but not parsed for translation.');
  } else if (textFieldIndex !== formatFields.length - 1) {
    parseWarnings.push('ASS/SSA Events Format has Text before later fields. Event lines were preserved but not parsed to avoid corrupting comma-containing text.');
  }

  // Parse dialogue lines
  let cueIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const eventType = getAssEventType(line);

    // Process Dialogue lines and useful hidden karaoke Comment lines.
    if (!eventType || textFieldIndex === -1 || textFieldIndex !== formatFields.length - 1) continue;

    const event = parseAssEventLine(line, textFieldIndex);
    if (!event) {
      parseWarnings.push(`Could not parse ASS/SSA ${eventType} event at line ${i + 1}. The line was preserved unchanged.`);
      continue;
    }

    // Extract fields
    const start = getAssField(event.fields, startFieldIndex) || '0:00:00.00';
    const end = getAssField(event.fields, endFieldIndex) || '0:00:00.00';
    const style = getAssField(event.fields, styleFieldIndex);
    const speaker = getAssField(event.fields, nameFieldIndex);
    const effect = getAssField(event.fields, effectFieldIndex);
    const shouldParseComment = isUsefulAssComment(event.eventType, effect, event.textOriginal);

    if (event.eventType === 'Comment' && !shouldParseComment) {
      continue;
    }

    const startMs = parseASSTime(start);
    const endMs = parseASSTime(end);

    // Tokenize text
    const { skeleton, placeholders } = shouldParseComment
      ? { skeleton: extractReadableAssText(event.textOriginal), placeholders: [] }
      : tokenizeASSText(event.textOriginal);

    cues.push({
      id: `ASS_${cueIndex}_L${i}`,
      index: cueIndex,
      startMs,
      endMs,
      rawPrefix: event.rawPrefix,
      rawLine: line,
      sourceLineIndex: i,
      textOriginal: event.textOriginal,
      textSkeleton: skeleton,
      placeholders,
      speaker: speaker || undefined,
      style: style || undefined,
      effect: effect || undefined,
      assEventType: event.eventType,
      assTextMode: shouldParseComment ? 'plain' : 'ass',
      format
    });

    cueIndex++;
  }

  return {
    format,
    header: headerLines.join('\n'),
    stylesSection: stylesLines.join('\n'),
    eventsFormat: eventsFormatLine,
    cues,
    parseWarnings
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
