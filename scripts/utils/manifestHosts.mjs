import { resolveManifestRestDefaults } from './restDefaults.mjs';

export { resolveManifestRestDefaults } from './restDefaults.mjs';

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
  const defaults = resolveManifestRestDefaults();
  const httpsHost = normalizeHost(process.env.AIIINOB_REST_HTTPS_HOST) || defaults.httpsHost;
  const httpHost = normalizeHost(process.env.AIIINOB_REST_HTTP_HOST)
    || normalizeHost(process.env.AIIINOB_REST_HTTPS_HOST)
    || defaults.httpHost;

  const httpsPort = parsePort(process.env.AIIINOB_REST_HTTPS_PORT, defaults.httpsPort);
  const httpPort = parsePort(process.env.AIIINOB_REST_HTTP_PORT, defaults.httpPort);

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
