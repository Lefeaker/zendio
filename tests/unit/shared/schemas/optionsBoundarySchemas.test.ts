import { describe, expect, it } from 'vitest';
import {
  StoredOptionsSchema,
  VaultRouterConfigSchema,
  YamlConfigOverridesSchema
} from '@shared/schemas';

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

  it('documents StoredOptions root unknown-field policy as strip while preserving known settings', () => {
    const result = StoredOptionsSchema.parse({
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
    });

    expect(result.rest?.apiKey).toBe('REST_SECRET_TOKEN');
    expect(result.aiChat?.userName).toBe('Researcher');
    expect((result as Record<string, unknown>).customKey).toBeUndefined();
  });
});
