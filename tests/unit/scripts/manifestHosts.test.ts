import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyRestHostPermissions,
  resolveRestHostPermissions
} from '../../../scripts/utils/manifestHosts.mjs';

const resolveHostPermissions = resolveRestHostPermissions as () => string[];
const applyHostPermissions = applyRestHostPermissions as (manifest: {
  host_permissions?: string[];
}) => {
  host_permissions?: string[];
};

const ENV_KEYS = [
  'AIIINOB_REST_HTTPS_HOST',
  'AIIINOB_REST_HTTPS_PORT',
  'AIIINOB_REST_HTTP_HOST',
  'AIIINOB_REST_HTTP_PORT'
] as const;

const originalEnv: Record<string, string | undefined> = {};

function snapshotEnv() {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (typeof value === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('manifestHosts utilities', () => {
  beforeEach(() => {
    snapshotEnv();
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    restoreEnv();
  });

  it('provides default localhost permissions when no overrides are set', () => {
    const permissions = resolveHostPermissions();
    expect(permissions).toContain('https://127.0.0.1:27124/*');
    expect(permissions).toContain('http://127.0.0.1:27123/*');
  });

  it('applies environment overrides and merges into manifest host permissions', () => {
    process.env.AIIINOB_REST_HTTPS_HOST = 'clipper.example.com';
    process.env.AIIINOB_REST_HTTP_HOST = 'clipper.example.com';
    process.env.AIIINOB_REST_HTTPS_PORT = '443';
    process.env.AIIINOB_REST_HTTP_PORT = '8080';

    const permissions = resolveHostPermissions();
    expect(permissions).toContain('https://clipper.example.com:443/*');
    expect(permissions).toContain('http://clipper.example.com:8080/*');

    const manifest = applyHostPermissions({
      host_permissions: ['https://existing.example.com/*']
    });

    expect(manifest.host_permissions).toEqual(
      expect.arrayContaining([
        'https://existing.example.com/*',
        'https://clipper.example.com:443/*',
        'http://clipper.example.com:8080/*'
      ])
    );
  });
});
