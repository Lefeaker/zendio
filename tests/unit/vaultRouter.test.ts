import { describe, it, expect } from 'vitest';
import { VaultRouter } from '../../src/background/vault-router';
import type { ClipContext, VaultRouterConfig } from '../../src/shared/types';

describe('VaultRouter', () => {
  const baseVaults = [
    {
      id: 'default',
      name: 'Default Vault',
      httpsUrl: 'https://default:27124/',
      httpUrl: 'http://default:27123/',
      vault: 'Default',
      apiKey: 'default',
      isDefault: true
    },
    {
      id: 'tech',
      name: 'Tech Vault',
      httpsUrl: 'https://tech:27124/',
      httpUrl: 'http://tech:27123/',
      vault: 'Tech',
      apiKey: 'tech'
    }
  ] as const;

  const context: ClipContext = {
    url: 'https://example.com/articles/1',
    domain: 'example.com',
    title: 'Test',
    content: 'content about coding',
    type: 'article'
  };

  it('matches domain rule before default', () => {
    const config: VaultRouterConfig = {
      vaults: [...baseVaults],
      rules: [
        {
          id: 'rule-1',
          vaultId: 'tech',
          type: 'domain',
          pattern: 'example.com',
          enabled: true,
          priority: 10
        }
      ],
      defaultVaultId: 'default'
    };

    const router = new VaultRouter(config);
    const vault = router.selectVault(context);
    expect(vault?.id).toBe('tech');
  });

  it('returns null when no rule matches', () => {
    const config: VaultRouterConfig = {
      vaults: [...baseVaults],
      rules: [],
      defaultVaultId: 'default'
    };

    const router = new VaultRouter(config);
    const vault = router.selectVault({ ...context, domain: 'unknown.com' });
    expect(vault).toBeNull();
  });

  it('ignores keyword rules with blank patterns', () => {
    const config: VaultRouterConfig = {
      vaults: [...baseVaults],
      rules: [
        {
          id: 'keyword-blank',
          vaultId: 'tech',
          type: 'keyword',
          pattern: '   ',
          enabled: true,
          priority: 20
        }
      ],
      defaultVaultId: 'default'
    };

    const router = new VaultRouter(config);
    const vault = router.selectVault({ ...context, domain: 'no-match.com' });
    expect(vault).toBeNull();
  });

  it('ignores url pattern rules with blank patterns', () => {
    const config: VaultRouterConfig = {
      vaults: [...baseVaults],
      rules: [
        {
          id: 'url-blank',
          vaultId: 'tech',
          type: 'url-pattern',
          pattern: '\t',
          enabled: true,
          priority: 20
        }
      ],
      defaultVaultId: 'default'
    };

    const router = new VaultRouter(config);
    const vault = router.selectVault({ ...context, domain: 'no-match.com' });
    expect(vault).toBeNull();
  });
});
