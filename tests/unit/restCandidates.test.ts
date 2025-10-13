import { describe, expect, it } from 'vitest';
import { buildVaultUrl, createRestCandidates, maskApiKey } from '../../src/background/utils/restCandidates';

const BASE_CONFIG = {
  baseUrl: 'https://127.0.0.1:27124',
  httpsUrl: undefined,
  httpUrl: undefined,
  vault: 'MyVault',
  apiKey: 'secret'
};

describe('restCandidates utilities', () => {
  it('builds vault url without duplicate slashes', () => {
    const url = buildVaultUrl('https://host/', 'Vault', 'path/to/file');
    expect(url).toBe('https://host/vault/path/to/file');
  });

  it('removes trailing vault segment from base url before appending', () => {
    const url = buildVaultUrl('https://host/vault/Blog/', 'Vault', 'path/to/file');
    expect(url).toBe('https://host/vault/Blog/path/to/file');
  });

  it('creates candidates from explicit https/http config', () => {
    const config = {
      ...BASE_CONFIG,
      httpsUrl: 'https://localhost:27124',
      httpUrl: 'http://localhost:27123'
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
      httpsUrl: 'https://localhost:27124/vault/Custom'
    };
    const candidates = createRestCandidates(config, 'encoded.md');
    expect(candidates[0]?.url).toBe('https://localhost:27124/vault/Custom/encoded.md');
    const urls = candidates.map(c => c.url);
    expect(urls).not.toContain('https://localhost:27124/encoded.md');
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
