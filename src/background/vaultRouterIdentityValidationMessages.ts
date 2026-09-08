import type { UserVisibleMessageDescriptor } from '../shared/i18n/userVisibleMessageDescriptor';
import type { VaultRouterIdentityIssue } from '../shared/config/vaultRouterIdentity';

export type VaultRouterIdentityValidationCode =
  | 'invalid_vault_id'
  | 'duplicate_vault_ids'
  | 'missing_rule_vault'
  | 'missing_default_vault';

export interface MappedVaultRouterIdentityIssue {
  readonly code: VaultRouterIdentityValidationCode;
  readonly identityDetail: VaultRouterIdentityIssue;
  readonly message: string;
  readonly messageDescriptor: UserVisibleMessageDescriptor<'errorOptionsVaultConfigInvalid'>;
}

export function mapVaultRouterIdentityIssue(
  issue: VaultRouterIdentityIssue
): MappedVaultRouterIdentityIssue {
  switch (issue.code) {
    case 'empty-vault-id':
      return {
        code: 'invalid_vault_id',
        identityDetail: issue,
        message: 'Vault identity must not be empty.',
        messageDescriptor: { key: 'errorOptionsVaultConfigInvalid' }
      };
    case 'duplicate-vault-id':
      return {
        code: 'duplicate_vault_ids',
        identityDetail: issue,
        message: `Duplicate vault ID(s): ${issue.values.vaultIds.join(', ')}`,
        messageDescriptor: { key: 'errorOptionsVaultConfigInvalid' }
      };
    case 'unresolved-rule-vault':
      return {
        code: 'missing_rule_vault',
        identityDetail: issue,
        message:
          issue.values.matchCount === 0
            ? `Rule "${issue.values.ruleId}" references a missing vault: ${issue.values.vaultId}`
            : `Rule "${issue.values.ruleId}" does not resolve to exactly one vault: ${issue.values.vaultId}`,
        messageDescriptor: { key: 'errorOptionsVaultConfigInvalid' }
      };
    case 'unresolved-default-vault':
      return {
        code: 'missing_default_vault',
        identityDetail: issue,
        message:
          issue.values.matchCount === 0
            ? `Default vault not found: ${issue.values.vaultId}`
            : `Default vault does not resolve to exactly one vault: ${issue.values.vaultId}`,
        messageDescriptor: { key: 'errorOptionsVaultConfigInvalid' }
      };
    default: {
      const exhaustive: never = issue;
      return exhaustive;
    }
  }
}
