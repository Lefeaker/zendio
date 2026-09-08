import type { PlainStructuredObject, PlainStructuredValue } from './losslessObjectBoundaryTypes';

const MAX_VAULT_ID_ALLOCATION_ATTEMPTS = 8;
const COMPATIBILITY_MARKER = '~legacy-duplicate-';

type IdentityRule = { readonly id: string; readonly vaultId: string };
type IdentityVault = {
  readonly id: string;
  readonly rules?: readonly IdentityRule[] | undefined;
};
type IdentityRouter = {
  readonly vaults: readonly IdentityVault[];
  readonly rules?: readonly IdentityRule[] | undefined;
  readonly defaultVaultId?: string | undefined;
};
type DefaultIdentityVault = IdentityVault & { readonly isDefault?: boolean | undefined };
type DefaultIdentityRouter = {
  readonly vaults: readonly DefaultIdentityVault[];
  readonly defaultVaultId?: string | undefined;
};

export type VaultRouterIdentityIssueCode =
  | 'empty-vault-id'
  | 'duplicate-vault-id'
  | 'unresolved-default-vault'
  | 'unresolved-rule-vault';

export interface VaultRouterIdentityIssue {
  readonly code: VaultRouterIdentityIssueCode;
  readonly message: string;
  readonly path: readonly (number | string)[];
}

export interface VaultRouterIdentityValidation {
  readonly valid: boolean;
  readonly issues: readonly VaultRouterIdentityIssue[];
}

export interface VaultRouterIdentityRowNormalization {
  readonly canonicalIndex: number;
  readonly index: number;
  readonly newId: string;
  readonly oldId: string;
}

export interface LegacyVaultRouterIdentityNormalization {
  readonly changed: boolean;
  readonly router: PlainStructuredObject;
  readonly rows: readonly VaultRouterIdentityRowNormalization[];
}

export class VaultRouterIdentityError extends Error {
  constructor(
    readonly code:
      | 'VAULT_ID_ALLOCATION_EXHAUSTED'
      | 'VAULT_ID_ENTROPY_INVALID'
      | 'VAULT_ID_ENTROPY_UNAVAILABLE'
  ) {
    super(code);
    this.name = 'VaultRouterIdentityError';
  }
}

const record = (value: PlainStructuredValue | undefined): value is PlainStructuredObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const secureEntropy = (): string => {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new VaultRouterIdentityError('VAULT_ID_ENTROPY_UNAVAILABLE');
  }
  return globalThis.crypto.randomUUID();
};

export function allocateVaultId(
  existingIds: Iterable<string>,
  createEntropy: () => string = secureEntropy
): string {
  const occupied = new Set(existingIds);
  for (let attempt = 0; attempt < MAX_VAULT_ID_ALLOCATION_ATTEMPTS; attempt += 1) {
    const entropy = createEntropy();
    if (!entropy || entropy.trim() !== entropy) {
      throw new VaultRouterIdentityError('VAULT_ID_ENTROPY_INVALID');
    }
    const candidate = `vault-${entropy}`;
    if (!occupied.has(candidate)) return candidate;
  }
  throw new VaultRouterIdentityError('VAULT_ID_ALLOCATION_EXHAUSTED');
}

export function validateVaultRouterIdentity(router: IdentityRouter): VaultRouterIdentityValidation {
  const issues: VaultRouterIdentityIssue[] = [];
  const counts = new Map<string, number>();
  for (const vault of router.vaults) counts.set(vault.id, (counts.get(vault.id) ?? 0) + 1);

  const duplicateIds = [...counts].filter(([, count]) => count > 1).map(([id]) => id);
  router.vaults.forEach((vault, index) => {
    if (!vault.id.trim()) {
      issues.push({
        code: 'empty-vault-id',
        message: 'Vault identity must not be empty.',
        path: ['vaults', index, 'id']
      });
    }
  });
  if (duplicateIds.length) {
    issues.push({
      code: 'duplicate-vault-id',
      message: `Duplicate vault ID(s): ${duplicateIds.join(', ')}`,
      path: ['vaults']
    });
  }

  const checkRule = (rule: IdentityRule, path: readonly (number | string)[]) => {
    const count = counts.get(rule.vaultId) ?? 0;
    if (count === 1) return;
    issues.push({
      code: 'unresolved-rule-vault',
      message:
        count === 0
          ? `Rule "${rule.id}" references a missing vault: ${rule.vaultId}`
          : `Rule "${rule.id}" does not resolve to exactly one vault: ${rule.vaultId}`,
      path
    });
  };
  router.rules?.forEach((rule, index) => checkRule(rule, ['rules', index, 'vaultId']));
  router.vaults.forEach((vault, vaultIndex) =>
    vault.rules?.forEach((rule, ruleIndex) =>
      checkRule(rule, ['vaults', vaultIndex, 'rules', ruleIndex, 'vaultId'])
    )
  );

  if (router.defaultVaultId !== undefined) {
    const count = counts.get(router.defaultVaultId) ?? 0;
    if (count !== 1) {
      issues.push({
        code: 'unresolved-default-vault',
        message:
          count === 0
            ? `Default vault not found: ${router.defaultVaultId}`
            : `Default vault does not resolve to exactly one vault: ${router.defaultVaultId}`,
        path: ['defaultVaultId']
      });
    }
  }
  return { valid: issues.length === 0, issues };
}

export function assertVaultRouterIdentity(router: IdentityRouter): void {
  const validation = validateVaultRouterIdentity(router);
  if (!validation.valid) {
    throw new Error(`Vault identity rejected: ${validation.issues[0]?.message}`);
  }
}

export function resolveCanonicalVaultId(
  router: DefaultIdentityRouter | null | undefined,
  fallback = 'default'
): string {
  return (
    router?.vaults.find(({ id }) => id === router.defaultVaultId)?.id ??
    router?.vaults.find(({ isDefault }) => isDefault)?.id ??
    router?.vaults[0]?.id ??
    fallback
  );
}

function compatibilityId(oldId: string, ordinal: number, occupied: Set<string>): string {
  const base = `${oldId}${COMPATIBILITY_MARKER}${ordinal}`;
  let candidate = base;
  let probe = 1;
  while (occupied.has(candidate)) candidate = `${base}-${++probe}`;
  return candidate;
}

export function normalizeLegacyVaultRouterIdentity(
  router: PlainStructuredObject
): LegacyVaultRouterIdentityNormalization | null {
  if (!Array.isArray(router.vaults)) return null;
  const originals = router.vaults;
  const ids: string[] = [];
  for (const value of originals) {
    if (!record(value) || typeof value.id !== 'string' || !value.id.trim()) return null;
    ids.push(value.id);
  }

  const occupied = new Set(ids);
  const occurrence = new Map<string, number>();
  const canonicalIndex = new Map<string, number>();
  const rows: VaultRouterIdentityRowNormalization[] = [];
  const vaults: PlainStructuredValue[] = [];
  let changed = false;

  for (let index = 0; index < originals.length; index += 1) {
    const vault = originals[index];
    if (!record(vault)) return null;
    const oldId = ids[index];
    const ordinal = (occurrence.get(oldId) ?? 0) + 1;
    occurrence.set(oldId, ordinal);
    canonicalIndex.set(oldId, canonicalIndex.get(oldId) ?? index);
    const newId = ordinal === 1 ? oldId : compatibilityId(oldId, ordinal, occupied);
    occupied.add(newId);
    const next = { ...vault };
    if (newId !== oldId) {
      changed = true;
      next.id = newId;
      if (next.rules !== undefined) {
        if (!Array.isArray(next.rules)) return null;
        const rules: PlainStructuredValue[] = [];
        for (const value of next.rules) {
          if (!record(value) || typeof value.vaultId !== 'string') return null;
          rules.push({ ...value, vaultId: newId });
        }
        next.rules = rules;
      }
    }
    vaults.push(next);
    rows.push({ canonicalIndex: canonicalIndex.get(oldId) ?? index, index, newId, oldId });
  }
  return { changed, router: { ...router, vaults }, rows };
}
