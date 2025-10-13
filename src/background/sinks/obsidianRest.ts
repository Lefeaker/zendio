import { createRestCandidates, maskApiKey, buildVaultUrl } from '../utils/restCandidates';

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

interface RestConfig {
  baseUrl: string;
  httpsUrl?: string;
  httpUrl?: string;
  vault: string;
  apiKey: string;
}

export async function writeFile(rest: RestConfig, filePath: string, content: string) {
  const [encodedPath, directEncodedPath] = buildCandidatePaths(filePath, rest.vault);

  console.log('Writing to Obsidian:', {
    filePath,
    baseUrl: rest.baseUrl,
    httpsUrl: rest.httpsUrl,
    httpUrl: rest.httpUrl,
    vault: rest.vault,
    hasApiKey: Boolean(rest.apiKey)
  });

  const candidates = createRestCandidates(rest, encodedPath, directEncodedPath);
  if (candidates.length === 0) {
    candidates.push({
      url: buildVaultUrl(rest.baseUrl, rest.vault, encodedPath),
      protocol: rest.baseUrl.startsWith('https://') ? 'HTTPS' : 'HTTP'
    });
  }

  const errors: Array<{ protocol: string; error: Error }> = [];

  for (const candidate of candidates) {
    try {
      await doPut(candidate.url, candidate.protocol, rest.apiKey, content);
      console.log(`✅ Write successful (${candidate.protocol}):`, maskApiKey(candidate.url, rest.apiKey));
      return;
    } catch (error) {
      const err = error as Error;
      console.warn(`❌ ${candidate.protocol} failed:`, err.message);
      errors.push({ protocol: candidate.protocol, error: err });

      if (err instanceof RestResponseError) {
        continue;
      }

      if (!err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
        throw err;
      }
    }
  }

  const errorDetails = errors.map(e => `  - ${e.protocol}: ${e.error.message}`).join('\n');
  const configInfo = rest.httpsUrl || rest.httpUrl
    ? `HTTPS: ${rest.httpsUrl || '未配置'}, HTTP: ${rest.httpUrl || '未配置'}`
    : `baseUrl: ${rest.baseUrl}`;

  throw new Error(
    `无法连接到 Obsidian Local REST API。\n` +
    `配置：${configInfo}\n` +
    `已尝试的协议：\n${errorDetails}\n\n` +
    `请检查：\n` +
    `1. Obsidian 是否正在运行\n` +
    `2. Local REST API 插件是否已启用\n` +
    `3. 在扩展选项中配置正确的 HTTPS 和 HTTP URL\n` +
    `4. 检查防火墙设置是否阻止了连接`
  );
}

async function doPut(url: string, protocol: string, apiKey: string, content: string) {
  const maskedUrl = maskApiKey(url, apiKey);
  console.log(`Trying ${protocol}:`, maskedUrl);

  const res = await fetch(url, {
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

function buildCandidatePaths(filePath: string, vaultName: string): [string, string] {
  const normalized = normalizeVaultRelativePath(filePath, vaultName);
  const encoded = normalized.split('/').map(encodeURIComponent).join('/');
  return [encoded, encoded];
}

function normalizeVaultRelativePath(input: string, vaultName: string): string {
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
