export type FailureCategory = 'HTTP error' | 'network error' | 'config error';

const RESPONSE_SNIPPET_LIMIT = 120;
const NETWORK_FAILURE_DETAIL = 'request failed';
const HTTP_FAILURE_DETAIL = 'response unavailable';
const CONFIG_FAILURE_DETAIL = 'configuration invalid';

export async function testConnection(url: string, apiKey: string) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });
  const text = await readResponseTextSafely(response);
  return { response, text };
}

export function sanitizeSnippet(raw: string): string | undefined {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length <= RESPONSE_SNIPPET_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, RESPONSE_SNIPPET_LIMIT)}...`;
}

export function normalizeFailureDetail(
  category: FailureCategory,
  detail?: string
): string | undefined {
  const normalized = detail?.toLowerCase().trim();
  if (!normalized) {
    return defaultFailureDetail(category);
  }
  if (normalized.includes('body is unusable')) {
    return HTTP_FAILURE_DETAIL;
  }
  if (
    normalized.includes('cannot read properties of undefined') ||
    normalized.includes('illegal invocation') ||
    normalized.includes('missing response from rest endpoint')
  ) {
    return CONFIG_FAILURE_DETAIL;
  }
  if (category === 'network error' && isKnownNetworkFailure(normalized)) {
    return NETWORK_FAILURE_DETAIL;
  }
  return detail;
}

export function deriveExternalCategory(error: unknown): FailureCategory {
  if (error instanceof Error) {
    const normalized = error.message.toLowerCase();
    if (normalized.includes('failed to fetch') || normalized.includes('networkerror')) {
      return 'network error';
    }
    if (normalized.includes('http') || normalized.includes('status')) {
      return 'HTTP error';
    }
  }
  return 'config error';
}

export function formatCategoryMessage(category: FailureCategory, detail?: string): string {
  if (detail) {
    return `${category}: ${detail}`;
  }
  return category;
}

export function normalizeRootEndpoint(url: string): string {
  return url.trim().replace(/\/+$/, '') + '/';
}

async function readResponseTextSafely(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return response.statusText || '';
  }
}

function defaultFailureDetail(category: FailureCategory): string {
  if (category === 'HTTP error') {
    return HTTP_FAILURE_DETAIL;
  }
  if (category === 'network error') {
    return NETWORK_FAILURE_DETAIL;
  }
  return CONFIG_FAILURE_DETAIL;
}

function isKnownNetworkFailure(message: string): boolean {
  return message.includes('failed to fetch') || message.includes('networkerror');
}
