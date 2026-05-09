import { configProvider } from '../../shared/config';

export interface RestConfig {
  baseUrl: string;
  httpsUrl?: string;
  httpUrl?: string;
  vault: string;
  apiKey: string;
}

export interface RestCandidate {
  url: string;
  protocol: string;
}

const LOCAL_HOST_PATTERN = /^https?:\/\/(127\.0\.0\.1|localhost)/;
const REST_DEFAULTS = configProvider.getRestDefaults();

export function buildVaultUrl(baseUrl: string, vault: string, encodedPath: string): string {
  const trimmed = baseUrl.trim();
  const normalizedBase = normalizeVaultEndpointBase(stripTrailingSlash(trimmed), vault);
  const endsWithVaultOnly = /\/vault$/i.test(normalizedBase);

  let baseWithVault: string;
  if (endsWithVaultOnly) {
    baseWithVault = normalizedBase;
  } else {
    baseWithVault = joinUrl(normalizedBase, 'vault');
  }

  const safePath = encodedPath.trim();
  if (!safePath) {
    return `${baseWithVault}/`;
  }

  return joinUrl(baseWithVault, safePath);
}

export function isLocalAddress(url: string): boolean {
  return LOCAL_HOST_PATTERN.test(url);
}

export function createRestCandidates(
  config: RestConfig,
  encodedPath: string,
  vaultNameOrNull?: string | null // null 表示连接测试,跳过 vault 路径
): RestCandidate[] {
  const urlsToTry: RestCandidate[] = [];
  const resolvedHttpsUrl = coerceUrl(config.httpsUrl, REST_DEFAULTS.httpsUrl);
  const resolvedHttpUrl = coerceUrl(config.httpUrl, REST_DEFAULTS.httpUrl);
  const resolvedBaseUrl = coerceUrl(config.baseUrl, REST_DEFAULTS.baseUrl) ?? config.baseUrl;
  const resolvedConfig = {
    vault: config.vault || REST_DEFAULTS.vault,
    httpsUrl: resolvedHttpsUrl,
    httpUrl: resolvedHttpUrl,
    baseUrl: resolvedBaseUrl
  };

  const vaultName = resolvedConfig.vault;

  const pushCandidate = (targetUrl: string | undefined, protocol: string) => {
    if (!targetUrl) return;
    const trimmed = targetUrl.trim();
    if (!trimmed) return;

    const normalizedBase = stripTrailingSlash(trimmed);

    // ===== 修复:连接测试时不拼接 vault 路径 =====
    if (vaultNameOrNull === null) {
      // 连接测试模式:直接使用根 URL,不拼接 vault
      const rootUrl = normalizedBase + '/';
      addUniqueCandidate(urlsToTry, rootUrl, protocol);
      return;
    }

    // 正常模式:拼接 vault 路径(用于 clipper 写入)
    const effectiveVault = vaultNameOrNull ?? vaultName;

    const hasVaultInBase = /\/vault(\/|$)/i.test(normalizedBase);
    const vaultUrl = buildVaultUrl(trimmed, effectiveVault, encodedPath);
    const protocolLabel = hasVaultInBase ? protocol : `${protocol} (vault)`;
    addUniqueCandidate(urlsToTry, vaultUrl, protocolLabel);
  };

  const { httpsUrl, httpUrl, baseUrl } = resolvedConfig;
  const hasExplicit = Boolean(config.httpsUrl?.trim() || config.httpUrl?.trim());

  if (hasExplicit) {
    pushCandidate(httpsUrl, 'HTTPS (用户配置)');
    pushCandidate(httpUrl, 'HTTP (用户配置)');

    if (httpsUrl && httpUrl && isLocalAddress(httpsUrl)) {
      const httpAltPort = httpUrl.replace(
        `:${REST_DEFAULTS.httpPort}`,
        `:${REST_DEFAULTS.httpsPort}`
      );
      if (httpAltPort !== httpUrl) {
        pushCandidate(httpAltPort, 'HTTP (备用端口)');
      }
    }
    return urlsToTry;
  }

  if (!isLocalAddress(baseUrl)) {
    pushCandidate(baseUrl, baseUrl.startsWith('https://') ? 'HTTPS' : 'HTTP');
    return urlsToTry;
  }

  if (baseUrl.startsWith('https://')) {
    pushCandidate(baseUrl, 'HTTPS');
    pushCandidate(baseUrl.replace(/^https:/, 'http:'), 'HTTP (same port)');
    const httpAltPort = baseUrl
      .replace(/^https:/, 'http:')
      .replace(`:${REST_DEFAULTS.httpsPort}`, `:${REST_DEFAULTS.httpPort}`);
    if (httpAltPort !== baseUrl.replace(/^https:/, 'http:')) {
      pushCandidate(httpAltPort, `HTTP (port ${REST_DEFAULTS.httpPort})`);
    }
    return urlsToTry;
  }

  pushCandidate(baseUrl, 'HTTP');
  pushCandidate(baseUrl.replace(/^http:/, 'https:'), 'HTTPS (same port)');
  const httpsAltPort = baseUrl
    .replace(/^http:/, 'https:')
    .replace(`:${REST_DEFAULTS.httpPort}`, `:${REST_DEFAULTS.httpsPort}`);
  if (httpsAltPort !== baseUrl.replace(/^http:/, 'https:')) {
    pushCandidate(httpsAltPort, `HTTPS (port ${REST_DEFAULTS.httpsPort})`);
  }

  return urlsToTry;
}

export function maskApiKey(target: string, apiKey: string): string {
  if (!apiKey) {
    return target;
  }
  return target.split(apiKey).join('***');
}

function coerceUrl(value: string | undefined, fallback: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed) {
    return trimmed;
  }
  return fallback;
}

function addUniqueCandidate(list: RestCandidate[], url: string, protocol: string): void {
  if (list.some((candidate) => candidate.url === url)) {
    return;
  }
  list.push({ url, protocol });
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function normalizeVaultEndpointBase(baseUrl: string, vault: string): string {
  const safeVault = vault.trim();
  if (!safeVault) {
    return baseUrl;
  }
  const escapedVault = safeVault.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return baseUrl.replace(new RegExp(`/vault/${escapedVault}$`, 'i'), '/vault');
}

function joinUrl(base: string, segment: string): string {
  const normalizedBase = stripTrailingSlash(base);
  const normalizedSegment = segment.replace(/^[/]+/, '');
  if (!normalizedSegment) {
    return normalizedBase;
  }
  return `${normalizedBase}/${normalizedSegment}`;
}
