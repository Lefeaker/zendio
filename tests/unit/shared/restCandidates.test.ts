import { describe, expect, it } from 'vitest';
import { buildVaultUrl, createRestCandidates, maskApiKey } from '../../../src/background/utils/restCandidates';
import { getRestDefaults } from '../../utils/restDefaults';

const REST_DEFAULTS = getRestDefaults();

const BASE_CONFIG = {
  baseUrl: REST_DEFAULTS.baseUrl,
  httpsUrl: undefined,
  httpUrl: undefined,
  vault: REST_DEFAULTS.vault,
  apiKey: 'secret'
};

describe('restCandidates utilities', () => {
  it('builds vault url without duplicate slashes', () => {
    const url = buildVaultUrl('https://host/', 'Vault', 'path/to/file');
    expect(url).toBe('https://host/vault/Vault/path/to/file');
  });

  it('does not append vault segment when base already ends with it', () => {
    const url = buildVaultUrl('https://host/vault/Vault/', 'Vault', 'path/to/file');
    expect(url).toBe('https://host/vault/Vault/path/to/file');
  });

  it('creates candidates from explicit https/http config', () => {
    const config = {
      ...BASE_CONFIG,
      httpsUrl: `https://localhost:${REST_DEFAULTS.httpsPort}`,
      httpUrl: `http://localhost:${REST_DEFAULTS.httpPort}`
    };
    const candidates = createRestCandidates(config, 'encoded.md');
    const protocols = candidates.map(c => c.protocol);
    expect(protocols.filter(p => p === 'HTTPS (用户配置)')).toHaveLength(1);
    expect(protocols).toContain('HTTPS (用户配置) (vault)');
    expect(protocols.filter(p => p === 'HTTP (用户配置)')).toHaveLength(1);
    expect(protocols).toContain('HTTP (用户配置) (vault)');
  });

  it('honors custom endpoints that already contain vault segment', () => {
    const config = {
      ...BASE_CONFIG,
      vault: 'Custom',
      httpsUrl: `https://localhost:${REST_DEFAULTS.httpsPort}/vault/Custom`
    };
    const candidates = createRestCandidates(config, 'encoded.md');
    expect(candidates[0]?.url).toBe(`https://localhost:${REST_DEFAULTS.httpsPort}/vault/Custom/encoded.md`);
    const urls = candidates.map(c => c.url);
    expect(urls).not.toContain(`https://localhost:${REST_DEFAULTS.httpsPort}/encoded.md`);
  });

  it('adds alternative ports for local https base url', () => {
    const config = { ...BASE_CONFIG };
    const candidates = createRestCandidates(config, 'encoded.md');
    expect(candidates.length).toBeGreaterThan(1);
  });

  it('masks api key within urls', () => {
    const url = 'https://host/vault/Vault/file?token=secret';
    expect(maskApiKey(url, 'secret')).toBe('https://host/vault/Vault/file?token=***');
  });
});
