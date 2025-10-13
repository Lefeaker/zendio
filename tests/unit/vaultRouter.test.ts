import { describe, it, expect } from 'vitest';
import { VaultRouter } from '../../src/background/vault-router';
import type { ClipContext, VaultRouterConfig, RoutingRule } from '../../src/shared/types';

describe('VaultRouter', () => {
  const baseVaults = [
    {
      id: 'default',
      name: 'Default Vault',
      httpsUrl: 'https://default:27124/',
      httpUrl: 'http://default:27123/',
      vault: 'Default',
      apiKey: 'default',
      isDefault: true,
      rules: []
    },
    {
      id: 'tech',
      name: 'Tech Vault',
      httpsUrl: 'https://tech:27124/',
      httpUrl: 'http://tech:27123/',
      vault: 'Tech',
      apiKey: 'tech',
      rules: []
    }
  ] as const;

  const context: ClipContext = {
    url: 'https://example.com/articles/1',
    domain: 'example.com',
    title: 'Test',
    content: 'content about coding',
    type: 'article'
  };

  const createConfig = (rulesForTech: RoutingRule[]): VaultRouterConfig => ({
    vaults: [
      { ...baseVaults[0], rules: [] },
      { ...baseVaults[1], rules: rulesForTech.map(rule => ({ ...rule, vaultId: 'tech' })) }
    ],
    defaultVaultId: 'default'
  });

  it('matches domain rule before default', () => {
    const config = createConfig([
      {
        id: 'rule-1',
        vaultId: 'tech',
        type: 'domain',
        pattern: 'example.com',
        enabled: true,
        priority: 10
      }
    ]);

    const router = new VaultRouter(config);
    const vault = router.selectVault(context);
    expect(vault?.id).toBe('tech');
  });

  it('matches subdomains when rule omits wildcard', () => {
    const config = createConfig([
      {
        id: 'rule-1',
        vaultId: 'tech',
        type: 'domain',
        pattern: 'example.com',
        enabled: true,
        priority: 10
      }
    ]);

    const router = new VaultRouter(config);
    const vault = router.selectVault({ ...context, domain: 'www.example.com' });
    expect(vault?.id).toBe('tech');
  });

  it('matches semicolon separated domain patterns', () => {
    const config = createConfig([
      {
        id: 'rule-many',
        vaultId: 'tech',
        type: 'domain',
        pattern: 'news.example.com;blog.example.com',
        enabled: true,
        priority: 15
      }
    ]);

    const router = new VaultRouter(config);
    const vault = router.selectVault({ ...context, domain: 'blog.example.com' });
    expect(vault?.id).toBe('tech');
  });

  it('returns null when no rule matches', () => {
    const config = createConfig([]);

    const router = new VaultRouter(config);
    const vault = router.selectVault({ ...context, domain: 'unknown.com' });
    expect(vault).toBeNull();
  });

  it('ignores keyword rules with blank patterns', () => {
    const config = createConfig([
      {
        id: 'keyword-blank',
        vaultId: 'tech',
        type: 'keyword',
        pattern: '   ',
        enabled: true,
        priority: 20
      }
    ]);

    const router = new VaultRouter(config);
    const vault = router.selectVault({ ...context, domain: 'no-match.com' });
    expect(vault).toBeNull();
  });

  it('ignores url pattern rules with blank patterns', () => {
    const config = createConfig([
      {
        id: 'url-blank',
        vaultId: 'tech',
        type: 'url-pattern',
        pattern: '\t',
        enabled: true,
        priority: 20
      }
    ]);

    const router = new VaultRouter(config);
    const vault = router.selectVault({ ...context, domain: 'no-match.com' });
    expect(vault).toBeNull();
  });
});
