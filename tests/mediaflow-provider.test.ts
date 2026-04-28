import { describe, expect, it, vi } from 'vitest';

const fetchMediaFlowApiMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/services/mediaflow-auth', () => ({
  fetchMediaFlowApi: fetchMediaFlowApiMock,
}));

vi.mock('$lib/stores/logs.svelte', () => ({
  logStore: {
    addLog: vi.fn(),
  },
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
}));

describe('MediaFlow provider adapters', () => {
  it('maps a MediaFlow chat completion response to the internal LLM shape', async () => {
    fetchMediaFlowApiMock.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    }), { status: 200 }));

    const { callLlm } = await import('../src/lib/services/llm-client');
    const result = await callLlm({
      provider: 'mediaflow',
      apiKey: '',
      model: 'Lite',
      systemPrompt: 'Return JSON.',
      userPrompt: 'Ping',
      responseMode: 'json',
    });

    expect(result).toEqual({
      content: '{"ok":true}',
      finishReason: 'stop',
      truncated: false,
      usage: {
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18,
      },
    });
    expect(fetchMediaFlowApiMock).toHaveBeenCalledWith('/api/v1/chat/completions', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('builds the MediaFlow audio payload without backend-rejected options', async () => {
    const { buildMediaFlowTranscriptionForm } = await import('../src/lib/services/mediaflow-transcription');
    const form = buildMediaFlowTranscriptionForm(new Blob(['audio'], { type: 'audio/opus' }), {
      model: 'nova-3',
      language: 'multi',
      punctuate: true,
      paragraphs: true,
      smartFormat: true,
      utterances: true,
      uttSplit: 0.8,
      diarize: false,
    });

    expect(form.get('file')).toBeInstanceOf(File);
    expect(form.get('detect_language')).toBe('true');
    expect(form.get('smart_format')).toBe('true');
    expect(form.has('model')).toBe(false);
    expect(form.has('utt_split')).toBe(false);
  });
});
