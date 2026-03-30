import type { RestClient, RestConnection } from '../shared/interfaces/restClient';
import type { AppError } from '../shared/errors/types';
import { createRestCandidates, maskApiKey, buildVaultUrl } from '../background/utils/restCandidates';
import { errorHandler, restErrors } from '../shared/errors';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function bindFetch(fetchImpl?: typeof fetch | FetchLike): FetchLike {
  const impl = fetchImpl ?? globalThis.fetch;
  if (!impl) {
    throw new Error('Fetch API is not available in the current environment.');
  }

  // 绑定到 globalThis，避免在 Service Worker 环境中出现 Illegal invocation
  const fetchFunction = impl as FetchLike;
  const boundFetch: FetchLike = (input, init) => {
    const result = fetchFunction.call(globalThis, input, init) as Promise<Response>;
    return result;
  };
  return boundFetch;
}

/**
 * REST 响应错误类
 */
class RestResponseError extends Error {
  status: number;
  protocol: string;

  constructor(status: number, protocol: string, message: string) {
    super(`REST write failed (${protocol}): ${status} ${message}`);
    this.status = status;
    this.protocol = protocol;
    this.name = 'RestResponseError';
  }
}

/**
 * 基于 fetch 的 REST 客户端实现
 * 
 * 这是 RestClient 接口的默认实现，使用全局 fetch API
 * 支持 HTTPS/HTTP 协议遍历和错误聚合
 */
export class FetchRestClient implements RestClient {
  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl: typeof fetch | FetchLike = fetch) {
    this.fetchImpl = bindFetch(fetchImpl);
  }

  async writeFile(config: RestConnection, filePath: string, content: string): Promise<void> {
    const [encodedPath] = this.buildCandidatePaths(filePath, config.vault);

    console.log('Writing to Obsidian:', {
      filePath,
      baseUrl: config.baseUrl,
      httpsUrl: config.httpsUrl,
      httpUrl: config.httpUrl,
      vault: config.vault,
      hasApiKey: Boolean(config.apiKey)
    });

    const candidates = createRestCandidates(config, encodedPath);
    if (candidates.length === 0) {
      candidates.push({
        url: buildVaultUrl(config.baseUrl, config.vault, encodedPath),
        protocol: config.baseUrl.startsWith('https://') ? 'HTTPS' : 'HTTP'
      });
    }

    const errors: AppError[] = [];

    for (const candidate of candidates) {
      try {
        await this.doPut(candidate.url, candidate.protocol, config.apiKey, content);
        console.log(`✅ Write successful (${candidate.protocol}):`, maskApiKey(candidate.url, config.apiKey));
        return;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.warn(`❌ ${candidate.protocol} failed:`, err.message);

        const context: Record<string, unknown> = {
          endpoint: candidate.url,
          method: 'PUT',
          vault: config.vault,
          protocol: candidate.protocol
        };

        if (err instanceof RestResponseError && err.status !== undefined) {
          context.statusCode = err.status;
        }

        const appError = restErrors.requestFailed(
          err.message,
          context,
          { cause: error }
        );
        errors.push(appError);
        await errorHandler.handle(appError, { suppressNotifications: true });

        if (err instanceof RestResponseError) {
          continue;
        }

        if (!err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
          throw appError;
        }
      }
    }

    const aggregatedError = restErrors.vaultUnavailable({
      endpoint: config.baseUrl,
      vault: config.vault,
      retryCount: errors.length,
      attempts: errors.map((attempt) => ({
        protocol: attempt.context?.protocol,
        endpoint: attempt.context?.endpoint,
        message: attempt.message,
        statusCode: attempt.context?.statusCode
      }))
    });

    throw aggregatedError;
  }

  private async doPut(url: string, protocol: string, apiKey: string, content: string): Promise<Response> {
    const maskedUrl = maskApiKey(url, apiKey);
    console.log(`Trying ${protocol}:`, maskedUrl);

    const res = await this.fetchImpl(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'text/markdown; charset=utf-8'
      },
      body: content
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      throw new RestResponseError(res.status, protocol, errorText);
    }

    return res;
  }

  private buildCandidatePaths(filePath: string, vaultName: string): [string, string] {
    const normalized = this.normalizeVaultRelativePath(filePath, vaultName);
    const encoded = normalized.split('/').map(encodeURIComponent).join('/');
    return [encoded, encoded];
  }

  private normalizeVaultRelativePath(input: string, vaultName: string): string {
    let path = input.replace(/^[\\/]+/, '');

    if (!path) {
      return '';
    }

    const escapedVault = vaultName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefixRegex = new RegExp(`^${escapedVault}[\\/]+`, 'i');
    path = path.replace(prefixRegex, '');

    path = path.replace(/[\\/]+/g, '/');

    return path;
  }
}

/**
 * 创建基于 fetch 的 REST 客户端实例
 * 
 * @param fetchImpl fetch 实现，默认使用全局 fetch，测试时可传入 mock
 * @returns RestClient 实例
 */
export function createFetchRestClient(fetchImpl: typeof fetch | FetchLike = fetch): RestClient {
  return new FetchRestClient(fetchImpl);
}
