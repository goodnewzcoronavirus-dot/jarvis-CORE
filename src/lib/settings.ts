// All settings live in this browser's localStorage. Nothing is sent anywhere
// except the provider you choose (and Google, when you sign in).

export type Provider = 'local' | 'anthropic' | 'openai';

export interface Settings {
  provider: Provider;
  localModel: string;
  anthropicKey: string;
  anthropicModel: string;
  openaiKey: string;
  openaiModel: string;
  openaiBaseUrl: string;
  googleClientId: string;
}

export const LOCAL_MODELS: { id: string; label: string; note: string }[] = [
  { id: 'Qwen3.5-0.8B-q4f16_1-MLC', label: 'Qwen 3.5 0.8B', note: 'Lightest, ~1.6 GB, any laptop' },
  { id: 'Qwen3.5-2B-q4f16_1-MLC', label: 'Qwen 3.5 2B', note: 'Default, ~2.2 GB' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 3B', note: '~2.3 GB' },
  { id: 'Qwen3.5-4B-q4f16_1-MLC', label: 'Qwen 3.5 4B', note: 'Smartest, ~3.9 GB, needs a good GPU' },
];

const DEFAULTS: Settings = {
  provider: 'anthropic',
  localModel: 'Qwen3.5-2B-q4f16_1-MLC',
  anthropicKey: '',
  anthropicModel: 'claude-haiku-5-5',
  openaiKey: '',
  openaiModel: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  googleClientId: '',
};

const KEY = 'jarvis-settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable or corrupt: fall back to defaults */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
