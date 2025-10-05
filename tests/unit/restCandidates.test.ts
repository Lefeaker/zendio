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
    expect(url).toBe('https://host/vault/Vault/path/to/file');
  });

  it('creates candidates from explicit https/http config', () => {
    const config = {
      ...BASE_CONFIG,
      httpsUrl: 'https://localhost:27124',
      httpUrl: 'http://localhost:27123'
    };
    const candidates = createRestCandidates(config, 'encoded.md');
    expect(candidates.map(c => c.protocol)).toContain('HTTPS (用户配置)');
    expect(candidates.map(c => c.protocol)).toContain('HTTP (用户配置)');
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
