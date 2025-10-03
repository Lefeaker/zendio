import { getOptions } from '../store';
import type { ConnectionTestResult } from '../../shared/types/connection';

interface UrlCandidate {
  url: string;
  protocol: string;
}

export async function handleConnectionTest(): Promise<ConnectionTestResult> {
  try {
    const options = await getOptions();
    const rest = options.rest;

    const urlsToTry = buildUrlCandidates(rest.baseUrl, rest.httpsUrl, rest.httpUrl);
    const errors: string[] = [];

    for (const candidate of urlsToTry) {
      try {
        const { response, text } = await testConnection(candidate.url, rest.apiKey);
        return {
          success: true,
          status: response.status,
          message: `✅ 通过 ${candidate.protocol} 连接成功！状态码: ${response.status}`,
          response: text.slice(0, 200)
        };
      } catch (error) {
        const errorMsg = `${candidate.protocol}: ${error instanceof Error ? error.message : String(error)}`;
        console.warn('[connectionTest] candidate failed:', errorMsg);
        errors.push(errorMsg);

        if (!(error instanceof Error) || (!error.message.includes('Failed to fetch') && !error.message.includes('NetworkError'))) {
          throw error;
        }
      }
    }

    return {
      success: false,
      error: errors.join('\n'),
      message: `连接失败，已尝试：\n${errors.join('\n')}`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[connectionTest] unexpected error:', error);
    return {
      success: false,
      error: message,
      message: `连接失败: ${message}`
    };
  }
}

async function testConnection(url: string, apiKey: string) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });
  const text = await response.text();
  return { response, text };
}

function buildUrlCandidates(baseUrl: string, httpsUrl?: string, httpUrl?: string): UrlCandidate[] {
  const candidates: UrlCandidate[] = [];
  const trimmedHttps = httpsUrl?.trim();
  const trimmedHttp = httpUrl?.trim();
  const isLocalAddress = (url: string) => /^https?:\/\/(127\.0\.0\.1|localhost)/.test(url);
  const addCandidate = (url: string, protocol: string) => {
    const normalized = ensureTrailingSlash(url);
    if (!candidates.some(candidate => candidate.url === normalized)) {
      candidates.push({ url: normalized, protocol });
    }
  };

  if (trimmedHttps || trimmedHttp) {
    if (trimmedHttps) {
      addCandidate(trimmedHttps, 'HTTPS (用户配置)');
    }
    if (trimmedHttp) {
      addCandidate(trimmedHttp, 'HTTP (用户配置)');
    }

    if (trimmedHttps && trimmedHttp && isLocalAddress(trimmedHttps)) {
      const httpAltPort = trimmedHttp.replace(':27123', ':27124');
      if (httpAltPort !== trimmedHttp) {
        addCandidate(httpAltPort, 'HTTP (备用端口)');
      }
    }
  } else {
    const normalizedBase = removeTrailingSlash(baseUrl);
    if (isLocalAddress(normalizedBase)) {
      const isHttps = normalizedBase.startsWith('https://');
      if (isHttps) {
        addCandidate(normalizedBase, 'HTTPS');
        addCandidate(normalizedBase.replace(/^https:/, 'http:'), 'HTTP (same port)');
        const httpAltPort = normalizedBase.replace(/^https:/, 'http:').replace(':27124', ':27123');
        if (httpAltPort !== normalizedBase.replace(/^https:/, 'http:')) {
          addCandidate(httpAltPort, 'HTTP (port 27123)');
        }
      } else {
        addCandidate(normalizedBase, 'HTTP');
        addCandidate(normalizedBase.replace(/^http:/, 'https:'), 'HTTPS (same port)');
        const httpsAltPort = normalizedBase.replace(/^http:/, 'https:').replace(':27123', ':27124');
        if (httpsAltPort !== normalizedBase.replace(/^http:/, 'https:')) {
          addCandidate(httpsAltPort, 'HTTPS (port 27124)');
        }
      }
    } else {
      const protocol = normalizedBase.startsWith('https://') ? 'HTTPS' : 'HTTP';
      addCandidate(normalizedBase, protocol);
    }
  }

  return candidates;
}

function ensureTrailingSlash(url: string): string {
  return url.replace(/\/$/, '') + '/';
}

function removeTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}
