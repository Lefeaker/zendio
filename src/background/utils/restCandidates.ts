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

export function buildVaultUrl(baseUrl: string, vault: string, encodedPath: string): string {
  return `${baseUrl.replace(/\/$/, '')}/vault/${encodeURIComponent(vault)}/${encodedPath}`;
}

export function isLocalAddress(url: string): boolean {
  return LOCAL_HOST_PATTERN.test(url);
}

export function createRestCandidates(config: RestConfig, encodedPath: string): RestCandidate[] {
  const urlsToTry: RestCandidate[] = [];

  const pushCandidate = (targetUrl: string | undefined, protocol: string) => {
    if (!targetUrl) return;
    const trimmed = targetUrl.trim();
    if (!trimmed) return;
    urlsToTry.push({
      url: buildVaultUrl(trimmed, config.vault, encodedPath),
      protocol
    });
  };

  const { httpsUrl, httpUrl, baseUrl } = config;
  const hasExplicit = Boolean(httpsUrl || httpUrl);

  if (hasExplicit) {
    pushCandidate(httpsUrl, 'HTTPS (用户配置)');
    pushCandidate(httpUrl, 'HTTP (用户配置)');

    if (httpsUrl && httpUrl && isLocalAddress(httpsUrl)) {
      const httpAltPort = httpUrl.replace(':27123', ':27124');
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
    const httpAltPort = baseUrl.replace(/^https:/, 'http:').replace(':27124', ':27123');
    if (httpAltPort !== baseUrl.replace(/^https:/, 'http:')) {
      pushCandidate(httpAltPort, 'HTTP (port 27123)');
    }
    return urlsToTry;
  }

  pushCandidate(baseUrl, 'HTTP');
  pushCandidate(baseUrl.replace(/^http:/, 'https:'), 'HTTPS (same port)');
  const httpsAltPort = baseUrl.replace(/^http:/, 'https:').replace(':27123', ':27124');
  if (httpsAltPort !== baseUrl.replace(/^http:/, 'https:')) {
    pushCandidate(httpsAltPort, 'HTTPS (port 27124)');
  }

  return urlsToTry;
}

export function maskApiKey(target: string, apiKey: string): string {
  if (!apiKey) {
    return target;
  }
  return target.split(apiKey).join('***');
}
