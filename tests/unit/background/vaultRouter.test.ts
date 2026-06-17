import { describe, it, expect } from 'vitest';
import {
  VaultRouter,
  createDefaultVaultRouterConfig,
  migrateFromLegacyConfig
} from '../../../src/background/vault-router';
import type { ClipContext, VaultRouterConfig, RoutingRule } from '@shared/types';
import { configProvider } from '@shared/config';

describe('VaultRouter', () => {
  const restDefaults = configProvider.getRestDefaults();
  const baseVaults = [
    {
      id: 'default',
      name: 'Default Vault',
      httpsUrl: `https://default:${restDefaults.httpsPort}/`,
      httpUrl: `http://default:${restDefaults.httpPort}/`,
      vault: 'Default',
      apiKey: 'default',
      isDefault: true,
      rules: []
    },
    {
      id: 'tech',
      name: 'Tech Vault',
      httpsUrl: `https://tech:${restDefaults.httpsPort}/`,
      httpUrl: `http://tech:${restDefaults.httpPort}/`,
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
      { ...baseVaults[1], rules: rulesForTech.map((rule) => ({ ...rule, vaultId: 'tech' })) }
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

  it('prefers higher priority rules when multiple rules match', () => {
    const config = createConfig([
      {
        id: 'keyword-low',
        vaultId: 'tech',
        type: 'keyword',
        pattern: 'coding',
        enabled: true,
        priority: 5
      },
      {
        id: 'domain-high',
        vaultId: 'tech',
        type: 'domain',
        pattern: ' example.com ',
        enabled: true,
        priority: 50
      }
    ]);

    const router = new VaultRouter(config);
    const vault = router.selectVault({ ...context, domain: 'WWW.EXAMPLE.COM' });
    expect(vault?.id).toBe('tech');
  });

  it('ignores disabled matching rules', () => {
    const config = createConfig([
      {
        id: 'disabled-domain',
        vaultId: 'tech',
        type: 'domain',
        pattern: 'example.com',
        enabled: false,
        priority: 50
      }
    ]);

    const router = new VaultRouter(config);
    expect(router.selectVault(context)).toBeNull();
  });

  it('matches keyword and url-pattern rules', () => {
    const keywordConfig = createConfig([
      {
        id: 'keyword-rule',
        vaultId: 'tech',
        type: 'keyword',
        pattern: 'coding, research',
        enabled: true,
        priority: 10
      }
    ]);
    const keywordRouter = new VaultRouter(keywordConfig);
    expect(
      keywordRouter.selectVault({ ...context, title: 'Research Log', content: 'misc' })?.id
    ).toBe('tech');

    const urlConfig = createConfig([
      {
        id: 'url-rule',
        vaultId: 'tech',
        type: 'url-pattern',
        pattern: 'articles/\\d+$',
        enabled: true,
        priority: 10
      }
    ]);
    const urlRouter = new VaultRouter(urlConfig);
    expect(urlRouter.selectVault(context)?.id).toBe('tech');
  });

  it('returns enabled fallback default vault when configured default is disabled', () => {
    const config: VaultRouterConfig = {
      vaults: [
        { ...baseVaults[0], enabled: false, isDefault: true, rules: [] },
        { ...baseVaults[1], enabled: true, rules: [] }
      ],
      defaultVaultId: 'default'
    };

    const router = new VaultRouter(config);
    expect(router.getDefaultVault()?.id).toBe('tech');
    expect(router.getVaultById('default')).toBeNull();
    expect(router.getAllVaults().map((vault) => vault.id)).toEqual(['tech']);
  });

  it('supports legacy top-level rules and dedupes rule ids', () => {
    const config: VaultRouterConfig = {
      vaults: [
        { ...baseVaults[0], rules: [] },
        {
          ...baseVaults[1],
          rules: [
            {
              id: 'shared-rule',
              vaultId: 'tech',
              type: 'domain',
              pattern: 'ignored.example.com',
              enabled: true,
              priority: 5
            }
          ]
        }
      ],
      defaultVaultId: 'default',
      rules: [
        {
          id: 'shared-rule',
          vaultId: 'tech',
          type: 'domain',
          pattern: 'example.com',
          enabled: true,
          priority: 100
        }
      ]
    };

    const router = new VaultRouter(config);
    expect(router.getAllRules()).toHaveLength(1);
    expect(router.selectVault(context)?.id).toBe('tech');
  });

  it('does not route through a rule declared under a disabled vault', () => {
    const config: VaultRouterConfig = {
      vaults: [
        { ...baseVaults[0], rules: [] },
        {
          ...baseVaults[1],
          enabled: true,
          rules: []
        },
        {
          id: 'disabled-parent',
          name: 'Disabled Parent',
          httpsUrl: `https://disabled:${restDefaults.httpsPort}/`,
          httpUrl: `http://disabled:${restDefaults.httpPort}/`,
          vault: 'DisabledParent',
          apiKey: 'disabled-key',
          enabled: false,
          rules: [
            {
              id: 'disabled-parent-rule',
              vaultId: 'tech',
              type: 'domain',
              pattern: 'example.com',
              enabled: true,
              priority: 100
            }
          ]
        }
      ],
      defaultVaultId: 'default'
    };

    const router = new VaultRouter(config);
    expect(router.selectVault(context)).toBeNull();
    expect(router.getAllRules()).toEqual([]);
  });

  it('returns English compatibility errors plus typed issues from validate()', () => {
    const router = new VaultRouter({
      vaults: [
        {
          id: 'default',
          name: 'Default Vault',
          httpsUrl: 'https://default.example.com/',
          httpUrl: 'http://default.example.com/',
          vault: 'Default',
          apiKey: 'default-key',
          enabled: false
        },
        {
          id: 'default',
          name: 'Duplicate Vault',
          httpsUrl: 'https://duplicate.example.com/',
          httpUrl: 'http://duplicate.example.com/',
          vault: 'Duplicate',
          apiKey: 'duplicate-key',
          enabled: true
        }
      ],
      defaultVaultId: 'missing-default',
      rules: [
        {
          id: 'missing-target-rule',
          vaultId: 'missing-target',
          type: 'domain',
          pattern: 'example.com',
          enabled: true,
          priority: 1
        }
      ]
    });

    const result = router.validate();

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'Duplicate vault ID(s): default',
      'Rule "missing-target-rule" references a missing vault: missing-target',
      'Default vault not found: missing-default'
    ]);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'duplicate_vault_ids',
      'missing_rule_vault',
      'missing_default_vault'
    ]);
    expect(result.issues.every((issue) => /[\u4e00-\u9fff]/u.test(issue.message) === false)).toBe(
      true
    );
  });

  it('uses English default vault names without overwriting provided legacy vault names', () => {
    expect(createDefaultVaultRouterConfig().vaults[0]?.name).toBe('New Vault');
    expect(migrateFromLegacyConfig(null).vaults[0]?.name).toBe('New Vault');
    expect(
      migrateFromLegacyConfig({
        vault: 'Research Vault',
        httpsUrl: 'https://research.example.com/',
        httpUrl: 'http://research.example.com/',
        apiKey: 'research-token'
      }).vaults[0]?.name
    ).toBe('Research Vault');
  });
});
