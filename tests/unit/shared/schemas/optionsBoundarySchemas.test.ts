import { describe, expect, it } from 'vitest';
import {
  StoredOptionsSchema,
  VaultRouterConfigSchema,
  YamlConfigOverridesSchema
} from '@shared/schemas';
import { decodeStoredOptions } from '@shared/config/storedOptionsCodec';

describe('options boundary schemas', () => {
  it('accepts legacy-compatible vaultRouter config', () => {
    const result = VaultRouterConfigSchema.safeParse({
      vaults: [
        {
          id: 'vault-1',
          name: 'Main',
          httpsUrl: 'https://vault.example',
          httpUrl: 'http://vault.example',
          vault: 'Main',
          apiKey: 'secret-key',
          rules: [
            {
              id: 'rule-1',
              vaultId: 'vault-1',
              type: 'domain',
              pattern: 'example.com',
              enabled: true,
              priority: 10
            }
          ]
        }
      ],
      rules: [
        {
          id: 'legacy-1',
          vaultId: 'vault-1',
          type: 'keyword',
          pattern: 'research',
          enabled: true,
          priority: 20
        }
      ],
      defaultVaultId: 'vault-1'
    });

    expect(result.success).toBe(true);
  });

  it('rejects malformed vaultRouter config', () => {
    const result = VaultRouterConfigSchema.safeParse({
      vaults: [{ id: 'vault-1', name: 'Main' }]
    });

    expect(result.success).toBe(false);
  });

  it('reports Vault identity failures with technical codes and exact paths', () => {
    const vault = (id: string, rules: object[] = []) => ({
      id,
      name: 'Vault',
      httpsUrl: 'https://vault.example/',
      httpUrl: 'http://vault.example/',
      vault: 'Vault',
      apiKey: '',
      rules
    });
    const result = VaultRouterConfigSchema.safeParse({
      defaultVaultId: 'duplicate-secret',
      rules: [
        {
          id: 'missing-rule-secret',
          vaultId: 'missing-target-secret',
          type: 'domain',
          pattern: 'example.com',
          enabled: true,
          priority: 1
        }
      ],
      vaults: [
        vault('   '),
        vault('duplicate-secret', [
          {
            id: 'multiple-rule-secret',
            vaultId: 'duplicate-secret',
            type: 'domain',
            pattern: 'example.net',
            enabled: true,
            priority: 2
          }
        ]),
        vault('duplicate-secret')
      ]
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('Expected Vault Router identity rejection.');
    const issues = result.error.issues.filter(({ message }) =>
      message.startsWith('vault-router-identity:')
    );
    expect(issues.map(({ message, path }) => ({ message, path }))).toEqual([
      {
        message: 'vault-router-identity:empty-vault-id',
        path: ['vaults', 0, 'id']
      },
      {
        message: 'vault-router-identity:duplicate-vault-id',
        path: ['vaults']
      },
      {
        message: 'vault-router-identity:unresolved-rule-vault',
        path: ['rules', 0, 'vaultId']
      },
      {
        message: 'vault-router-identity:unresolved-rule-vault',
        path: ['vaults', 1, 'rules', 0, 'vaultId']
      },
      {
        message: 'vault-router-identity:unresolved-default-vault',
        path: ['defaultVaultId']
      }
    ]);
    expect(issues.map(({ message }) => message).join(' ')).not.toMatch(
      /duplicate-secret|missing-rule-secret|missing-target-secret|Vault identity must/u
    );
  });

  it('accepts yamlConfig overrides with nested default values', () => {
    const result = YamlConfigOverridesSchema.safeParse({
      contentTypes: {
        article: {
          fields: [
            {
              name: 'tags',
              type: 'array',
              enabled: true,
              defaultValue: ['design', { source: 'user' }]
            }
          ],
          domainOverrides: {
            'example.com': [
              {
                name: 'published',
                type: 'boolean',
                enabled: true,
                defaultValue: true
              }
            ]
          }
        }
      },
      globalFields: [
        {
          name: 'rating',
          type: 'number',
          enabled: true,
          defaultValue: 5
        }
      ]
    });

    expect(result.success).toBe(true);
  });

  it('rejects yamlConfig with unsupported content type keys', () => {
    const result = StoredOptionsSchema.safeParse({
      yamlConfig: {
        contentTypes: {
          invalid: {
            fields: []
          }
        }
      }
    });

    expect(result.success).toBe(false);
  });

  it('rejects unknown StoredOptions roots while the loss-aware codec preserves opaque data', () => {
    const raw = {
      rest: {
        baseUrl: 'https://example.com',
        apiKey: 'REST_SECRET_TOKEN'
      },
      aiChat: {
        userName: 'Researcher'
      },
      customKey: {
        hello: 'world'
      }
    };
    const result = StoredOptionsSchema.safeParse(raw);
    const decoded = decodeStoredOptions(raw);

    expect(result.success).toBe(false);
    expect(decoded.canonical.rest?.apiKey).toBe('REST_SECRET_TOKEN');
    expect(decoded.canonical.aiChat?.userName).toBe('Researcher');
    expect(decoded.preserved.unknownRoots.customKey).toEqual({ hello: 'world' });
    expect(decoded.automaticWritebackIsLossless).toBe(false);
  });

  it('rejects unknown privacy keys while the loss-aware codec preserves the invalid section', () => {
    const raw = {
      privacyPreferences: {
        analytics: true,
        errorReporting: true,
        debugMode: false,
        extraConsentKey: true
      }
    };
    const result = StoredOptionsSchema.safeParse(raw);
    const decoded = decodeStoredOptions(raw);

    expect(result.success).toBe(false);
    expect(decoded.canonical).not.toHaveProperty('privacyPreferences');
    expect(decoded.preserved.invalidSections.privacyPreferences).toEqual({
      analytics: true,
      errorReporting: true,
      debugMode: false,
      extraConsentKey: true
    });
    expect(decoded.automaticWritebackIsLossless).toBe(false);
  });
});
