import type {
  LLMProvider,
  SubtitleFile,
  TranslationResult,
  LanguageCode
} from '$lib/types';
import type {
  Cue,
  ParsedSubtitle,
  TranslationRequest,
  TranslationCue,
  TranslationResponse,
  TranslatedCue,
  ValidationResult
} from '$lib/types/subtitle';
import { SUPPORTED_LANGUAGES } from '$lib/types';
import { settingsStore } from '$lib/stores';
import { parseSubtitle, detectFormat } from './subtitle-parser';
import { reconstructSubtitle, validateTranslation } from './subtitle-reconstructor';

// ============================================================================
// SYSTEM PROMPT (for JSON-based translation)
// ============================================================================

const TRANSLATION_SYSTEM_PROMPT = `You are an expert subtitle translator. You will receive a JSON object containing subtitle cues to translate.

CRITICAL RULES:
1. Return ONLY a valid JSON object with the translated cues
2. NEVER add, remove, or reorder cues - translate exactly what you receive
3. PRESERVE ALL PLACEHOLDERS EXACTLY (⟦TAG_0⟧, ⟦BR_0⟧, etc.) - they represent formatting that must not be changed
4. Do NOT merge or split cues
5. Do NOT add explanations, markdown, or any text outside the JSON

TRANSLATION QUALITY:
- Prioritize natural, idiomatic expressions over literal translation
- Adapt dialogue to sound like authentic conversation
- Preserve emotional tone and character speaking styles
- Respect subtitle reading constraints (~40 chars/line, ~21 chars/second)

SELF-CHECK before responding:
- Are all cue IDs preserved?
- Are all placeholders identical and in the right positions?
- Is the JSON valid?

OUTPUT FORMAT:
{
  "cues": [
    { "id": "original_id", "translatedText": "translated text with ⟦placeholders⟧ preserved" }
  ]
}`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getLanguageName(code: LanguageCode): string {
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
  return lang?.name || code;
}

/**
 * Build translation request from parsed subtitle
 */
function buildTranslationRequest(
  cues: Cue[],
  sourceLang: LanguageCode,
  targetLang: LanguageCode
): TranslationRequest {
  const translationCues: TranslationCue[] = cues.map(cue => ({
    id: cue.id,
    speaker: cue.speaker,
    style: cue.style,
    text: cue.textSkeleton
  }));

  return {
    sourceLang: sourceLang === 'auto' ? 'auto-detect' : getLanguageName(sourceLang),
    targetLang: getLanguageName(targetLang),
    rules: {
      placeholders: 'MUST_PRESERVE_EXACTLY',
      noReordering: true,
      noMerging: true,
      noSplitting: true
    },
    cues: translationCues
  };
}

/**
 * Build user prompt with translation request
 */
function buildUserPrompt(request: TranslationRequest): string {
  return `Translate the following subtitle cues from ${request.sourceLang} to ${request.targetLang}.

${JSON.stringify(request, null, 2)}`;
}

/**
 * Parse LLM response to extract translated cues
 */
function parseTranslationResponse(responseText: string): TranslationResponse | null {
  try {
    // Try to extract JSON from response (in case LLM adds extra text)
    let jsonStr = responseText.trim();

    // Find JSON object boundaries
    const startIndex = jsonStr.indexOf('{');
    const endIndex = jsonStr.lastIndexOf('}');

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      jsonStr = jsonStr.substring(startIndex, endIndex + 1);
    }

    const parsed = JSON.parse(jsonStr);

    // Validate structure
    if (!parsed.cues || !Array.isArray(parsed.cues)) {
      console.error('Invalid response structure: missing cues array');
      return null;
    }

    // Normalize the response
    const cues: TranslatedCue[] = parsed.cues.map((cue: any) => ({
      id: cue.id || cue.ID || '',
      translatedText: cue.translatedText || cue.translated_text || cue.text || ''
    }));

    return { cues };
  } catch (error) {
    console.error('Failed to parse translation response:', error);
    console.error('Response text:', responseText);
    return null;
  }
}

// ============================================================================
// LLM API CALLS
// ============================================================================

interface LLMResponse {
  content: string;
  error?: string;
}

async function callOpenAI(apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
        response_format: { type: 'json_object' }
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
          responseMimeType: 'application/json'
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

/**
 * Call the appropriate LLM API
 */
async function callLLM(
  provider: LLMProvider,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResponse> {
  switch (provider) {
    case 'openai':
      return callOpenAI(apiKey, model, systemPrompt, userPrompt);
    case 'anthropic':
      return callAnthropic(apiKey, model, systemPrompt, userPrompt);
    case 'google':
      return callGoogle(apiKey, model, systemPrompt, userPrompt);
    case 'openrouter':
      return callOpenRouter(apiKey, model, systemPrompt, userPrompt);
    default:
      return { content: '', error: `Unknown provider: ${provider}` };
  }
}

// ============================================================================
// MAIN TRANSLATION FUNCTION
// ============================================================================

/**
 * Translate subtitle file using the robust parsing/reconstruction pipeline
 */
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

  onProgress?.(5);

  // Step 1: Parse the subtitle file
  const parsed = parseSubtitle(file.content);

  if (!parsed) {
    return {
      originalFile: file,
      translatedContent: '',
      success: false,
      error: 'Could not parse subtitle file. Unsupported format.'
    };
  }

  if (parsed.cues.length === 0) {
    return {
      originalFile: file,
      translatedContent: '',
      success: false,
      error: 'No subtitle cues found in file.'
    };
  }

  onProgress?.(10);

  // Step 2: Build translation request (only text, no timestamps)
  const translationRequest = buildTranslationRequest(parsed.cues, sourceLang, targetLang);
  const userPrompt = buildUserPrompt(translationRequest);

  onProgress?.(15);

  // Step 3: Call LLM for translation
  const llmResponse = await callLLM(provider, apiKey, model, TRANSLATION_SYSTEM_PROMPT, userPrompt);

  onProgress?.(70);

  if (llmResponse.error) {
    return {
      originalFile: file,
      translatedContent: '',
      success: false,
      error: llmResponse.error
    };
  }

  // Step 4: Parse LLM response
  const translationResponse = parseTranslationResponse(llmResponse.content);

  if (!translationResponse) {
    return {
      originalFile: file,
      translatedContent: '',
      success: false,
      error: 'Failed to parse translation response. The LLM may have returned invalid JSON.'
    };
  }

  onProgress?.(80);

  // Step 5: Validate translation
  const validation = validateTranslation(parsed.cues, translationResponse.cues);

  if (!validation.valid) {
    // Log validation errors for debugging
    console.warn('Translation validation errors:', validation.errors);

    // For now, proceed but warn user
    // In future: implement retry logic
  }

  onProgress?.(85);

  // Step 6: Reconstruct subtitle file
  const { content: translatedContent } = reconstructSubtitle(
    parsed,
    translationResponse.cues,
    file.content
  );

  onProgress?.(100);

  return {
    originalFile: file,
    translatedContent,
    success: true,
    // Include validation warnings if any
    error: validation.valid ? undefined : `Warning: ${validation.errors.length} validation issue(s) detected`
  };
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export { detectFormat as detectSubtitleFormat };

export function getSubtitleExtension(format: 'srt' | 'ass' | 'vtt' | 'ssa'): string {
  const extensions: Record<string, string> = {
    srt: '.srt',
    ass: '.ass',
    ssa: '.ssa',
    vtt: '.vtt'
  };
  return extensions[format] || '.txt';
}

export async function validateApiKey(provider: LLMProvider, apiKey: string): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey || apiKey.trim() === '') {
    return { valid: false, error: 'API key is empty' };
  }

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


