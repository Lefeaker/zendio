// Import configuration defaults from the main config
// Note: This is a build-time script, so we need to use the same values as in appConfig.ts
const DEFAULT_REST_HTTPS_HOST = '127.0.0.1';
const DEFAULT_REST_HTTPS_PORT = 27124;
const DEFAULT_REST_HTTP_HOST = '127.0.0.1';
const DEFAULT_REST_HTTP_PORT = 27123;

function parsePort(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeHost(host) {
  if (!host) {
    return '';
  }
  return host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function buildHostPermission(protocol, host, port) {
  if (!host) {
    return null;
  }
  const normalizedHost = normalizeHost(host);
  const hasPort = normalizedHost.includes(':');
  const suffix = hasPort ? normalizedHost : (typeof port === 'number' ? `${normalizedHost}:${port}` : normalizedHost);
  return `${protocol}://${suffix}/*`;
}

export function resolveRestHostPermissions() {
  const httpsHost = normalizeHost(process.env.AIIINOB_REST_HTTPS_HOST) || DEFAULT_REST_HTTPS_HOST;
  const httpHost = normalizeHost(process.env.AIIINOB_REST_HTTP_HOST)
    || normalizeHost(process.env.AIIINOB_REST_HTTPS_HOST)
    || DEFAULT_REST_HTTP_HOST;

  const httpsPort = parsePort(process.env.AIIINOB_REST_HTTPS_PORT, DEFAULT_REST_HTTPS_PORT);
  const httpPort = parsePort(process.env.AIIINOB_REST_HTTP_PORT, DEFAULT_REST_HTTP_PORT);

  const permissions = [];
  const httpsEntry = buildHostPermission('https', httpsHost, httpsPort);
  if (httpsEntry) {
    permissions.push(httpsEntry);
  }

  const httpEntry = buildHostPermission('http', httpHost, httpPort);
  if (httpEntry) {
    permissions.push(httpEntry);
  }

  return permissions;
}

export function applyRestHostPermissions(manifest) {
  const restPermissions = resolveRestHostPermissions();
  if (!restPermissions.length) {
    return manifest;
  }

  const existing = Array.isArray(manifest.host_permissions)
    ? manifest.host_permissions
    : [];

  const merged = new Set(existing);
  for (const permission of restPermissions) {
    merged.add(permission);
  }

  return {
    ...manifest,
    host_permissions: Array.from(merged)
  };
}
