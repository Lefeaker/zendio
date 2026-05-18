export interface ParsedUrl {
  href: string;
  hostname: string;
  protocol: string;
  source: string;
}

export const ALLOWED_URL_PROTOCOLS = Object.freeze(
  new Set(['http:', 'https:', 'file:', 'about:', 'chrome-extension:', 'data:'])
);

export const DISALLOWED_URL_PROTOCOLS = Object.freeze(new Set(['javascript:', 'vbscript:']));

export function tryParseUrl(
  rawUrl: string | undefined,
  fallback?: string,
  allowedProtocols: ReadonlySet<string> = ALLOWED_URL_PROTOCOLS
): ParsedUrl | undefined {
  const candidates = [rawUrl, fallback].filter((candidate): candidate is string =>
    Boolean(candidate)
  );
  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      if (!allowedProtocols.has(parsed.protocol)) {
        continue;
      }
      return {
        href: parsed.href,
        hostname: parsed.hostname,
        protocol: parsed.protocol,
        source: candidate
      };
    } catch {
      // ignore and continue trying
    }
  }
  return undefined;
}

export function hasDisallowedProtocol(
  input: string,
  base?: string,
  disallowedProtocols: ReadonlySet<string> = DISALLOWED_URL_PROTOCOLS
): boolean {
  if (!input) {
    return false;
  }

  const value = input.trim();
  const lower = value.toLowerCase();

  try {
    const resolved = base ? new URL(value, base) : new URL(value);
    return disallowedProtocols.has(resolved.protocol);
  } catch {
    const protocolIndex = lower.indexOf(':');
    if (protocolIndex > -1) {
      const protocol = `${lower.slice(0, protocolIndex + 1)}`;
      return disallowedProtocols.has(protocol);
    }
  }

  return false;
}
