import type { Options } from '../store';
import type { OllamaChatResponse, OpenAIChatCompletionResponse } from '../../shared/types';
import { AppError, classifierErrors } from '../../shared/errors';
import { ClassificationRequestSchema } from '../../shared/schemas';

type ClassifierConfig = NonNullable<Options['classifier']>;
type ClassifierProvider = ClassifierConfig['provider'];

declare const fetch: typeof globalThis.fetch;

interface ClassificationMeta {
  typeHint: string;
  platform: string;
  url: string;
  title: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export type ClassifierError = AppError;
export type ClassifierErrorCode = ClassifierError['code'];

export interface ClassifierSuccess {
  ok: true;
  payload: Record<string, unknown>;
}

export interface ClassifierFailure {
  ok: false;
  error: ClassifierError;
}

export type ClassifierResponse = ClassifierSuccess | ClassifierFailure;

type PostJsonSuccess<T> = {
  ok: true;
  data: T;
};

type PostJsonFailure = {
  ok: false;
  error: ClassifierError;
};

type PostJsonResult<T> = PostJsonSuccess<T> | PostJsonFailure;

export async function classify(
  cfg: ClassifierConfig,
  meta: ClassificationMeta,
  preview: string
): Promise<ClassifierResponse> {
  const request = ClassificationRequestSchema.parse({
    ...meta,
    preview
  });
  const taxonomy = cfg.taxonomy ?? {};
  const sys = `你是一个严格的JSON分类器。taxonomy=${JSON.stringify(taxonomy)}。输出JSON: {type, topics, ai_platform, tags}`;
  const user = `meta=${JSON.stringify({
    typeHint: request.typeHint,
    platform: request.platform,
    url: request.url,
    title: request.title
  })}\npreview:\n${request.preview}`;

  if (cfg.provider === 'ollama') {
    const endpoint = cfg.endpoint || 'http://localhost:11434/api/chat';
    const response = await postJson<OllamaChatResponse>(
      endpoint,
      {
        model: cfg.model || 'llama3.1',
        stream: false,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user }
        ]
      },
      {},
      'ollama'
    );

    if (response.ok) {
      const content = response.data?.message?.content;
      return parseClassifierPayload(content, cfg.provider, endpoint);
    }

    const { error } = response as PostJsonFailure;
    return {
      ok: false,
      error
    };
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
    },
    cfg.provider
  );

  if (response.ok) {
    const content = response.data?.choices?.[0]?.message?.content;
    return parseClassifierPayload(content, cfg.provider, endpoint);
  }

  const { error } = response as PostJsonFailure;
  return {
    ok: false,
    error
  };
}

async function postJson<T>(
  endpoint: string,
  body: unknown,
  headers: Record<string, string> = {},
  provider: ClassifierProvider
): Promise<PostJsonResult<T>> {
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
      return {
        ok: false,
        error: classifierErrors.transportFailure(
          text || `HTTP ${response.status}`,
          {
            provider,
            endpoint,
            status: response.status,
            method: 'POST'
          }
        )
      };
    }

    try {
      const json = (await response.json()) as T;
      return {
        ok: true,
        data: json
      };
    } catch (error) {
      return {
        ok: false,
        error: classifierErrors.invalidPayload(
          'Classifier response is not valid JSON',
          {
            provider,
            endpoint
          },
          { cause: error }
        )
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        ok: false,
        error: classifierErrors.timeout(
          {
            provider,
            endpoint
          },
          { cause: error }
        )
      };
    }
    return {
      ok: false,
      error: classifierErrors.transportFailure(
        error instanceof Error ? error.message : String(error),
        {
          provider,
          endpoint
        },
        { cause: error }
      )
    };
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

function parseClassifierPayload(
  payload: string | undefined,
  provider: ClassifierProvider,
  endpoint: string
): ClassifierResponse {
  if (!payload) {
    return {
      ok: false,
      error: classifierErrors.invalidPayload(
        `Classifier response from ${provider} did not include content`,
        {
          provider,
          endpoint
        }
      )
    };
  }

  try {
    const parsed: unknown = JSON.parse(payload);
    if (!isRecord(parsed)) {
      return {
        ok: false,
        error: classifierErrors.invalidPayload(
          `Classifier response from ${provider} is not a JSON object`,
          {
            provider,
            endpoint,
            payloadSample: payload
          }
        )
      };
    }
    return {
      ok: true,
      payload: parsed
    };
  } catch (error) {
    return {
      ok: false,
      error: classifierErrors.invalidPayload(
        `Classifier response from ${provider} is not valid JSON`,
        {
          provider,
          endpoint,
          payloadSample: payload
        },
        { cause: error }
      )
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
