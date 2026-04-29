import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMediaFlowApiMock = vi.hoisted(() => vi.fn());
const fetchMediaFlowBillableApiMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const addLogMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/services/mediaflow-auth', () => ({
  fetchMediaFlowApi: fetchMediaFlowApiMock,
}));

vi.mock('$lib/services/mediaflow-billing', () => ({
  fetchMediaFlowBillableApi: fetchMediaFlowBillableApiMock,
}));

vi.mock('$lib/stores/logs.svelte', () => ({
  logStore: {
    addLog: addLogMock,
  },
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: readFileMock,
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

describe('MediaFlow provider adapters', () => {
  beforeEach(() => {
    fetchMediaFlowApiMock.mockReset();
    fetchMediaFlowBillableApiMock.mockReset();
    readFileMock.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
    addLogMock.mockReset();
  });

  it('maps a MediaFlow chat completion response to the internal LLM shape', async () => {
    fetchMediaFlowBillableApiMock.mockResolvedValueOnce(new Response(JSON.stringify({
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
    expect(fetchMediaFlowBillableApiMock).toHaveBeenCalledWith('/api/v1/chat/completions', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('builds the MediaFlow audio payload using the same Deepgram options', async () => {
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
    expect(form.get('model')).toBe('nova-3');
    expect(form.get('language')).toBe('multi');
    expect(form.get('punctuate')).toBe('true');
    expect(form.get('paragraphs')).toBe('true');
    expect(form.get('smart_format')).toBe('true');
    expect(form.get('utterances')).toBe('true');
    expect(form.get('utt_split')).toBe('0.8');
    expect(form.get('diarize')).toBe('false');
    expect(form.has('detect_language')).toBe(false);
  });

  it('maps a MediaFlow transcription response to the internal transcription result', async () => {
    fetchMediaFlowBillableApiMock.mockResolvedValueOnce(new Response(JSON.stringify({
      transcript: 'hello world',
      words: [
        { word: 'hello', punctuated_word: 'hello', start: 0, end: 0.4, confidence: 0.99 },
        { word: 'world', punctuated_word: 'world', start: 0.5, end: 0.9, confidence: 0.98 },
      ],
      metadata: { request_id: 'dg_1', duration: 1.2 },
    }), { status: 200 }));

    const { transcribeWithMediaFlow } = await import('../src/lib/services/mediaflow-transcription');
    const result = await transcribeWithMediaFlow({
      audioPath: '/tmp/audio.opus',
      config: {
        model: 'nova-3',
        language: 'multi',
        punctuate: true,
        paragraphs: true,
        smartFormat: true,
        utterances: true,
        uttSplit: 0.8,
        diarize: false,
      },
    });

    expect(result.success).toBe(true);
    expect(result.result?.transcript).toBe('hello world');
    expect(fetchMediaFlowBillableApiMock).toHaveBeenCalledWith(
      '/api/v1/audio/transcriptions',
      expect.any(Function),
    );
  });

  it('rejects empty MediaFlow transcription responses instead of creating blank versions', async () => {
    fetchMediaFlowBillableApiMock.mockResolvedValueOnce(new Response(JSON.stringify({
      transcript: '',
      words: [],
      metadata: { request_id: 'dg_empty', duration: 840 },
    }), { status: 200 }));

    const { transcribeWithMediaFlow } = await import('../src/lib/services/mediaflow-transcription');
    const result = await transcribeWithMediaFlow({
      audioPath: '/tmp/audio.opus',
      config: {
        model: 'nova-3',
        language: 'multi',
        punctuate: true,
        paragraphs: true,
        smartFormat: true,
        utterances: true,
        uttSplit: 0.8,
        diarize: false,
      },
    });

    expect(result).toEqual({
      success: false,
      error: 'MediaFlow returned an empty transcription. Check server Deepgram response logs.',
    });
    expect(addLogMock).toHaveBeenCalledWith(expect.objectContaining({
      level: 'error',
      source: 'mediaflow',
      title: 'MediaFlow transcription returned no text',
    }));
  });
});
