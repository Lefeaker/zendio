import type { Options } from '../store';
import type { OllamaChatResponse, OpenAIChatCompletionResponse } from '../../shared/types';

type ClassifierConfig = NonNullable<Options['classifier']>;

declare const fetch: typeof globalThis.fetch;

interface ClassificationMeta {
  typeHint: string;
  platform: string;
  url: string;
  title: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export async function classify(
  cfg: ClassifierConfig,
  meta: ClassificationMeta,
  preview: string
): Promise<unknown> {
  const taxonomy = cfg.taxonomy ?? {};
  const sys = `你是一个严格的JSON分类器。taxonomy=${JSON.stringify(taxonomy)}。输出JSON: {type, topics, ai_platform, tags}`;
  const user = `meta=${JSON.stringify(meta)}\npreview:\n${preview}`;

  if (cfg.provider === 'ollama') {
    const endpoint = cfg.endpoint || 'http://localhost:11434/api/chat';
    const response = await postJson<OllamaChatResponse>(endpoint, {
      model: cfg.model || 'llama3.1',
      stream: false,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user }
      ]
    });

    const content = response?.message?.content;
    return parseClassifierPayload(content, 'ollama');
  }

  const endpoint = cfg.endpoint || 'https://api.openai.com/v1/chat/completions';
  const response = await postJson<OpenAIChatCompletionResponse>(
    endpoint,
    {
      model: cfg.model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user }
      ],
      temperature: 0
    },
    {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey || ''}`
    }
  );

  const content = response?.choices?.[0]?.message?.content;
  return parseClassifierPayload(content, 'openai');
}

async function postJson<T>(
  endpoint: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await safeReadText(response);
      throw new Error(`Classifier request failed (${response.status}): ${text || response.statusText}`);
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      console.error('[classifier] Failed to parse JSON response', error);
      throw new Error('Classifier response is not valid JSON');
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Classifier request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function parseClassifierPayload(payload: string | undefined, provider: string): unknown {
  if (!payload) {
    throw new Error(`Classifier response from ${provider} did not include content`);
  }

  try {
    return JSON.parse(payload);
  } catch (error) {
    console.error('[classifier] Invalid payload', { provider, payload, error });
    throw new Error(`Classifier response from ${provider} is not valid JSON`);
  }
}
