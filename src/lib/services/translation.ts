import { fetch as ft } from '@tauri-apps/plugin-http';
import type {
  LLMProvider,
  SubtitleFile,
  TranslationResult,
  LanguageCode
} from '$lib/types';
import { SUPPORTED_LANGUAGES } from '$lib/types';
import { settingsStore } from '$lib/stores';

// System prompt optimized for subtitle translation
const TRANSLATION_SYSTEM_PROMPT = `You are an expert subtitle translator and localization specialist. Your primary goal is to produce natural, fluid translations that feel native to the target language while preserving the original meaning and emotional tone.

CRITICAL PRIORITIES:
1. NATURALNESS: Prioritize how native speakers actually talk over literal word-for-word translation
2. FLUIDITY: Create smooth, flowing dialogue that sounds authentic when read aloud
3. TONE PRESERVATION: Maintain the emotional nuance, formality level, and character personality
4. CONTEXT AWARENESS: Consider relationships between characters and situational context

TRANSLATION APPROACH:

Language Registers:
- Adapt formal/informal speech patterns appropriately for the target language
- Preserve respectful/casual dynamics between characters
- Use natural interjections and fillers native to the target language

Dialogue vs. Internal Monologue:
- Dialogue: Should sound like authentic spoken conversation
- Internal thoughts: Can be slightly more literal but must remain natural
- Narration: Clear, descriptive, appropriate narrative voice

Idiomatic Expressions:
- Replace source idioms with equivalent target language expressions
- Avoid awkward literal translations of phrases
- Use culturally appropriate metaphors and sayings

Sentence Structure:
- Reorganize sentences to follow natural target language syntax
- Vary sentence length for better flow
- Break or combine sentences if it improves readability

TECHNICAL REQUIREMENTS:

Subtitle Constraints:
- Respect maximum line length (typically ~40 characters per line)
- Ensure text fits comfortable reading speed (~21 characters/second)
- Break lines at natural pause points

Formatting Preservation:
- Maintain ALL timing codes exactly as given
- Preserve formatting tags (italics, positioning, colors, etc.)
- Keep line breaks (\N) and style markers intact
- Do NOT modify technical markup like {\\fs15\\c&H...}

QUALITY CHECKLIST:
✓ Does this sound natural when read aloud?
✓ Would a native speaker say it this way?
✓ Is the emotional tone preserved?
✓ Are relationships and formality levels appropriate?
✓ Is the meaning clear and accurate?
✓ Does it fit subtitle reading constraints?

IMPORTANT: Return ONLY the translated subtitle file content with all original formatting intact. Do NOT add explanations, markdown formatting, or commentary.`;

function getLanguageName(code: LanguageCode): string {
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
  return lang?.name || code;
}

function buildUserPrompt(content: string, sourceLang: LanguageCode, targetLang: LanguageCode): string {
  const sourceText = sourceLang === 'auto'
    ? 'the detected source language'
    : getLanguageName(sourceLang);
  const targetText = getLanguageName(targetLang);

  return `Translate the following subtitle file from ${sourceText} to ${targetText}.

TRANSLATION GUIDELINES FOR THIS REQUEST:
- Prioritize natural, idiomatic ${targetText} over literal translation
- Adapt dialogue to sound like authentic conversation in ${targetText}
- Preserve character relationships and speaking styles
- Maintain emotional tone and context from the original
- Keep all technical formatting and timing codes unchanged

Subtitle file to translate:

${content}

Remember: Your translation should feel native to ${targetText} speakers while staying true to the original meaning and tone.`;
}

interface LLMResponse {
  content: string;
  error?: string;
}

// OpenAI API call
async function callOpenAI(apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
  try {
    const response = await ft('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 128000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { content: '', error: `OpenAI API error: ${response.status} - ${error}` };
    }

    const data = await response.json();
    return { content: data.choices[0]?.message?.content || '' };
  } catch (error) {
    return { content: '', error: `OpenAI request failed: ${error}` };
  }
}

// Anthropic API call
async function callAnthropic(apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 128000,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { content: '', error: `Anthropic API error: ${response.status} - ${error}` };
    }

    const data = await response.json();
    return { content: data.content[0]?.text || '' };
  } catch (error) {
    return { content: '', error: `Anthropic request failed: ${error}` };
  }
}

// Google AI (Gemini) API call
async function callGoogle(apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            parts: [{ text: userPrompt }]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 128000
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { content: '', error: `Google AI API error: ${response.status} - ${error}` };
    }

    const data = await response.json();
    return { content: data.candidates[0]?.content?.parts[0]?.text || '' };
  } catch (error) {
    return { content: '', error: `Google AI request failed: ${error}` };
  }
}

// OpenRouter API call
async function callOpenRouter(apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://rsextractor.app',
        'X-Title': 'RsExtractor'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 128000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { content: '', error: `OpenRouter API error: ${response.status} - ${error}` };
    }

    const data = await response.json();
    return { content: data.choices[0]?.message?.content || '' };
  } catch (error) {
    return { content: '', error: `OpenRouter request failed: ${error}` };
  }
}

// Main translation function
export async function translateSubtitle(
  file: SubtitleFile,
  provider: LLMProvider,
  model: string,
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
  onProgress?: (progress: number) => void
): Promise<TranslationResult> {
  const apiKey = settingsStore.getLLMApiKey(provider);

  if (!apiKey) {
    return {
      originalFile: file,
      translatedContent: '',
      success: false,
      error: `No API key configured for ${provider}. Please add it in Settings.`
    };
  }

  if (!model) {
    return {
      originalFile: file,
      translatedContent: '',
      success: false,
      error: 'No model selected. Please select a model.'
    };
  }

  onProgress?.(10);

  const userPrompt = buildUserPrompt(file.content, sourceLang, targetLang);

  onProgress?.(20);

  let response: LLMResponse;

  switch (provider) {
    case 'openai':
      response = await callOpenAI(apiKey, model, TRANSLATION_SYSTEM_PROMPT, userPrompt);
      break;
    case 'anthropic':
      response = await callAnthropic(apiKey, model, TRANSLATION_SYSTEM_PROMPT, userPrompt);
      break;
    case 'google':
      response = await callGoogle(apiKey, model, TRANSLATION_SYSTEM_PROMPT, userPrompt);
      break;
    case 'openrouter':
      response = await callOpenRouter(apiKey, model, TRANSLATION_SYSTEM_PROMPT, userPrompt);
      break;
    default:
      return {
        originalFile: file,
        translatedContent: '',
        success: false,
        error: `Unknown provider: ${provider}`
      };
  }

  onProgress?.(90);

  if (response.error) {
    return {
      originalFile: file,
      translatedContent: '',
      success: false,
      error: response.error
    };
  }

  onProgress?.(100);

  return {
    originalFile: file,
    translatedContent: response.content,
    success: true
  };
}

// Validate API key by making a simple test request
export async function validateApiKey(provider: LLMProvider, apiKey: string): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey || apiKey.trim() === '') {
    return { valid: false, error: 'API key is empty' };
  }

  // Basic format validation
  switch (provider) {
    case 'openai':
      if (!apiKey.startsWith('sk-')) {
        return { valid: false, error: 'OpenAI API keys should start with "sk-"' };
      }
      break;
    case 'anthropic':
      if (!apiKey.startsWith('sk-ant-')) {
        return { valid: false, error: 'Anthropic API keys should start with "sk-ant-"' };
      }
      break;
  }

  return { valid: true };
}

// Parse subtitle file content to detect format
export function detectSubtitleFormat(content: string): 'srt' | 'ass' | 'vtt' | null {
  const trimmed = content.trim();

  if (trimmed.startsWith('WEBVTT')) {
    return 'vtt';
  }

  if (trimmed.startsWith('[Script Info]') || trimmed.includes('[V4+ Styles]')) {
    return 'ass';
  }

  // SRT: starts with a number followed by timing
  if (/^\d+\s*\n\d{2}:\d{2}:\d{2}[,.:]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.:]\d{3}/.test(trimmed)) {
    return 'srt';
  }

  return null;
}

// Get file extension for format
export function getSubtitleExtension(format: 'srt' | 'ass' | 'vtt'): string {
  const extensions: Record<string, string> = {
    srt: '.srt',
    ass: '.ass',
    vtt: '.vtt'
  };
  return extensions[format] || '.txt';
}

