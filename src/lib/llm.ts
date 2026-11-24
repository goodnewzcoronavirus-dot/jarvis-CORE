// One streaming chat interface over three backends:
//  - local: WebLLM, runs the model on this device's GPU via WebGPU
//  - anthropic: Claude API, called directly from the browser
//  - openai: any OpenAI-compatible endpoint
// WebLLM is ~6 MB, so it's loaded only when an on-device model is first used.
import type { MLCEngine, InitProgressReport } from '@mlc-ai/web-llm';
import type { Settings } from './settings';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

type OnToken = (text: string) => void;
type OnProgress = (p: InitProgressReport) => void;

let engine: MLCEngine | null = null;
let engineModel = '';

export function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export async function loadLocalModel(model: string, onProgress: OnProgress): Promise<void> {
  if (engine && engineModel === model) return;
  if (!hasWebGPU()) {
    throw new Error('This browser has no WebGPU. Use Chrome or Edge on a laptop, or switch to a cloud model in Settings.');
  }
  if (engine) {
    await engine.unload();
    engine = null;
  }
  onProgress({ progress: 0, timeElapsed: 0, text: 'Loading model engine…' });
  const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
  engine = await CreateMLCEngine(model, { initProgressCallback: onProgress });
  engineModel = model;
}

export function localModelLoaded(model: string): boolean {
  return engine !== null && engineModel === model;
}

export async function streamChat(
  settings: Settings,
  messages: ChatMessage[],
  onToken: OnToken,
  onProgress: OnProgress,
  signal?: AbortSignal,
): Promise<void> {
  if (settings.provider === 'local') return streamLocal(settings.localModel, messages, onToken, onProgress, signal);
  if (settings.provider === 'anthropic') return streamAnthropic(settings, messages, onToken, signal);
  return streamOpenAI(settings, messages, onToken, signal);
}

async function streamLocal(
  model: string,
  messages: ChatMessage[],
  onToken: OnToken,
  onProgress: OnProgress,
  signal?: AbortSignal,
) {
  await loadLocalModel(model, onProgress);
  // Small models ramble when "thinking" is on, so answer directly.
  const isQwen = model.startsWith('Qwen3');
  const chunks = await engine!.chat.completions.create({
    messages,
    stream: true,
    temperature: 0.3,
    ...(isQwen ? { extra_body: { enable_thinking: false } } : {}),
  });
  for await (const c of chunks) {
    if (signal?.aborted) {
      engine!.interruptGenerate();
      break;
    }
    const t = c.choices[0]?.delta?.content;
    if (t) onToken(t);
  }
}

// Reads a server-sent-events stream and hands each `data:` payload to `handle`.
async function readSSE(res: Response, handle: (data: string) => void) {
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('data:')) handle(line.slice(5).trim());
    }
  }
}

async function streamAnthropic(s: Settings, messages: ChatMessage[], onToken: OnToken, signal?: AbortSignal) {
  if (!s.anthropicKey) throw new Error('Add your Anthropic API key in Settings.');
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': s.anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: s.anthropicModel,
      max_tokens: 4096,
      stream: true,
      system: system || undefined,
      messages: messages.filter((m) => m.role !== 'system'),
    }),
  });
  await readSSE(res, (data) => {
    try {
      const ev = JSON.parse(data);
      if (ev.type === 'content_block_delta' && ev.delta?.text) onToken(ev.delta.text);
      if (ev.type === 'error') throw new Error(ev.error?.message ?? 'Anthropic error');
    } catch (e) {
      if (e instanceof SyntaxError) return;
      throw e;
    }
  });
}

async function streamOpenAI(s: Settings, messages: ChatMessage[], onToken: OnToken, signal?: AbortSignal) {
  if (!s.openaiKey) throw new Error('Add your OpenAI-compatible API key in Settings.');
  if (!s.openaiModel) throw new Error('Set an OpenAI-compatible model name in Settings.');
  const res = await fetch(`${s.openaiBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${s.openaiKey}` },
    body: JSON.stringify({ model: s.openaiModel, messages, stream: true }),
  });
  await readSSE(res, (data) => {
    if (data === '[DONE]') return;
    try {
      const t = JSON.parse(data).choices?.[0]?.delta?.content;
      if (t) onToken(t);
    } catch {
      /* partial line */
    }
  });
}
