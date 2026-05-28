export const MANIFEST_REST_DEFAULTS = Object.freeze({
  httpsHost: '127.0.0.1',
  httpsPort: 27124,
  httpHost: '127.0.0.1',
  httpPort: 27123
});

export function resolveManifestRestDefaults() {
  return { ...MANIFEST_REST_DEFAULTS };
}
