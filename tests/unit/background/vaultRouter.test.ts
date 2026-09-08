import { describe, it, expect } from 'vitest';
import {
  VaultRouter,
  createDefaultVaultRouterConfig,
  migrateFromLegacyConfig
} from '../../../src/background/vault-router';
import type { ClipContext, VaultRouterConfig, RoutingRule } from '@shared/types';
import { configProvider } from '@shared/config';
import { allocateVaultId, VaultRouterIdentityError } from '@shared/config/vaultRouterIdentity';

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
          id: '   ',
          name: 'Empty Identity',
          httpsUrl: 'https://empty.example.com/',
          httpUrl: 'http://empty.example.com/',
          vault: 'Empty',
          apiKey: '',
          enabled: true
        },
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
      'Vault identity must not be empty.',
      'Duplicate vault ID(s): default',
      'Rule "missing-target-rule" references a missing vault: missing-target',
      'Default vault not found: missing-default'
    ]);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'invalid_vault_id',
      'duplicate_vault_ids',
      'missing_rule_vault',
      'missing_default_vault'
    ]);
    expect(result.issues.map(({ messageDescriptor }) => messageDescriptor)).toEqual([
      { key: 'errorOptionsVaultConfigInvalid' },
      { key: 'errorOptionsVaultConfigInvalid' },
      { key: 'errorOptionsVaultConfigInvalid' },
      { key: 'errorOptionsVaultConfigInvalid' }
    ]);
    expect(result.issues.map(({ identityDetail }) => identityDetail)).toEqual([
      {
        code: 'empty-vault-id',
        path: ['vaults', 0, 'id'],
        values: { vaultId: '   ' }
      },
      {
        code: 'duplicate-vault-id',
        path: ['vaults'],
        values: { vaultIds: ['default'] }
      },
      {
        code: 'unresolved-rule-vault',
        path: ['rules', 0, 'vaultId'],
        values: { matchCount: 0, ruleId: 'missing-target-rule', vaultId: 'missing-target' }
      },
      {
        code: 'unresolved-default-vault',
        path: ['defaultVaultId'],
        values: { matchCount: 0, vaultId: 'missing-default' }
      }
    ]);
  });

  it('preserves multiply-resolved rule and default compatibility details', () => {
    const router = new VaultRouter({
      vaults: [
        { ...baseVaults[0], id: 'shared', rules: [] },
        { ...baseVaults[1], id: 'shared', rules: [] }
      ],
      defaultVaultId: 'shared',
      rules: [
        {
          id: 'multiple-target-rule',
          vaultId: 'shared',
          type: 'domain',
          pattern: 'example.com',
          enabled: true,
          priority: 1
        }
      ]
    });

    const result = router.validate();

    expect(result.errors).toEqual([
      'Duplicate vault ID(s): shared',
      'Rule "multiple-target-rule" does not resolve to exactly one vault: shared',
      'Default vault does not resolve to exactly one vault: shared'
    ]);
    expect(result.issues.map(({ identityDetail }) => identityDetail)).toEqual([
      {
        code: 'duplicate-vault-id',
        path: ['vaults'],
        values: { vaultIds: ['shared'] }
      },
      {
        code: 'unresolved-rule-vault',
        path: ['rules', 0, 'vaultId'],
        values: { matchCount: 2, ruleId: 'multiple-target-rule', vaultId: 'shared' }
      },
      {
        code: 'unresolved-default-vault',
        path: ['defaultVaultId'],
        values: { matchCount: 2, vaultId: 'shared' }
      }
    ]);
    expect(
      result.issues.every(({ messageDescriptor }) => {
        return JSON.stringify(messageDescriptor) === '{"key":"errorOptionsVaultConfigInvalid"}';
      })
    ).toBe(true);
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

  it('F04 allocates opaque stable Vault IDs without wall-clock identity', () => {
    const generated = [createDefaultVaultRouterConfig(), migrateFromLegacyConfig(null)].map(
      (config) => config.vaults[0]?.id
    );

    expect(generated).toHaveLength(2);
    expect(new Set(generated).size).toBe(2);
    for (const id of generated) {
      expect(id).toMatch(
        /^vault-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
      );
    }
  });

  it('F04 retries only colliding Vault entropy and fails at the fixed bound', () => {
    const entropy = ['collision', 'fresh'];
    expect(allocateVaultId(['vault-collision'], () => entropy.shift() ?? 'unexpected')).toBe(
      'vault-fresh'
    );

    let attempts = 0;
    expect(() =>
      allocateVaultId(['vault-collision'], () => {
        attempts += 1;
        return 'collision';
      })
    ).toThrow(VaultRouterIdentityError);
    expect(attempts).toBe(8);

    attempts = 0;
    expect(() =>
      allocateVaultId([], () => {
        attempts += 1;
        return '';
      })
    ).toThrow('VAULT_ID_ENTROPY_INVALID');
    expect(attempts).toBe(1);
  });
});
