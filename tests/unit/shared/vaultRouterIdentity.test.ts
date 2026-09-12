import { describe, expect, it } from 'vitest';
import {
  assertVaultRouterIdentity,
  validateVaultRouterIdentity
} from '@shared/config/vaultRouterIdentity';

describe('Vault Router identity issues', () => {
  it('returns exhaustive codes, paths, and typed values without product prose', () => {
    const result = validateVaultRouterIdentity({
      defaultVaultId: 'beta',
      rules: [{ id: 'missing-rule', vaultId: 'missing' }],
      vaults: [
        { id: '   ' },
        {
          id: 'beta',
          rules: [{ id: 'multiple-rule', vaultId: 'beta' }]
        },
        { id: 'beta' },
        { id: 'alpha' },
        { id: 'alpha' }
      ]
    });

    expect(result).toEqual({
      valid: false,
      issues: [
        {
          code: 'empty-vault-id',
          path: ['vaults', 0, 'id'],
          values: { vaultId: '   ' }
        },
        {
          code: 'duplicate-vault-id',
          path: ['vaults'],
          values: { vaultIds: ['beta', 'alpha'] }
        },
        {
          code: 'unresolved-rule-vault',
          path: ['rules', 0, 'vaultId'],
          values: { matchCount: 0, ruleId: 'missing-rule', vaultId: 'missing' }
        },
        {
          code: 'unresolved-rule-vault',
          path: ['vaults', 1, 'rules', 0, 'vaultId'],
          values: { matchCount: 2, ruleId: 'multiple-rule', vaultId: 'beta' }
        },
        {
          code: 'unresolved-default-vault',
          path: ['defaultVaultId'],
          values: { matchCount: 2, vaultId: 'beta' }
        }
      ]
    });
    expect(result.issues.every((issue) => !('message' in issue))).toBe(true);

    const missingDefault = validateVaultRouterIdentity({
      defaultVaultId: 'missing-default',
      vaults: [{ id: 'only' }]
    });
    expect(missingDefault.issues).toEqual([
      {
        code: 'unresolved-default-vault',
        path: ['defaultVaultId'],
        values: { matchCount: 0, vaultId: 'missing-default' }
      }
    ]);
  });

  it('throws a stable value-free technical code for assertion failures', () => {
    expect(() => assertVaultRouterIdentity({ vaults: [{ id: 'same' }, { id: 'same' }] })).toThrow(
      'VAULT_ROUTER_IDENTITY_DUPLICATE_VAULT_ID'
    );
    expect(() =>
      assertVaultRouterIdentity({ vaults: [{ id: 'secret-vault' }, { id: '' }] })
    ).toThrow('VAULT_ROUTER_IDENTITY_EMPTY_VAULT_ID');
  });
});
