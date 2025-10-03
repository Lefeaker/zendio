import type { Options } from '../store';

type ClassifierConfig = NonNullable<Options['classifier']>;

declare const fetch: typeof globalThis.fetch;

interface ClassificationMeta {
  typeHint: string;
  platform: string;
  url: string;
  title: string;
}

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
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model || 'llama3.1',
        stream: false,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user }
        ]
      })
    });
    const json = await response.json();
    return safeJson(json?.message?.content);
  }

  const endpoint = cfg.endpoint || 'https://api.openai.com/v1/chat/completions';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey || ''}`
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user }
      ],
      temperature: 0
    })
  });
  const json = await response.json();
  return safeJson(json?.choices?.[0]?.message?.content);
}

function safeJson(payload: string | undefined): unknown {
  if (!payload) {
    return { type: 'article', topics: [], tags: [] };
  }

  try {
    return JSON.parse(payload);
  } catch {
    return { type: 'article', topics: [], tags: [] };
  }
}
