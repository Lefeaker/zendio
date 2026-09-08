import type { PlainStructuredObject, PlainStructuredValue } from './losslessObjectBoundaryTypes';
import { normalizeLegacyVaultRouterIdentity } from './vaultRouterIdentity';

export interface LegacyVaultRouterMigration {
  readonly foldedRules: boolean;
  readonly identityChanged: boolean;
  readonly router: PlainStructuredObject;
}

const record = (value: PlainStructuredValue | undefined): value is PlainStructuredObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function prepareLegacyVaultRouterMigration(
  router: PlainStructuredObject
): LegacyVaultRouterMigration | null {
  const normalized = normalizeLegacyVaultRouterIdentity(router);
  if (!normalized) return null;
  const next: PlainStructuredObject = { ...normalized.router };
  let foldedRules = false;
  if (next.rules !== undefined) {
    if (!Array.isArray(next.rules) || !Array.isArray(next.vaults)) return null;
    const vaults = next.vaults.map((vault) => (record(vault) ? { ...vault } : vault));
    const folds: Array<{ rule: PlainStructuredObject; target: PlainStructuredObject }> = [];
    const claimedIds = new Map<PlainStructuredObject, Set<string>>();
    for (const rule of next.rules) {
      if (!record(rule) || typeof rule.vaultId !== 'string' || typeof rule.id !== 'string') {
        return null;
      }
      const target = vaults.find((vault) => record(vault) && vault.id === rule.vaultId);
      if (!record(target)) return null;
      const rules = target.rules === undefined ? [] : target.rules;
      if (!Array.isArray(rules)) return null;
      let ids = claimedIds.get(target);
      if (!ids) {
        ids = new Set(
          rules.flatMap((entry) =>
            record(entry) && typeof entry.id === 'string' ? [entry.id] : []
          )
        );
        claimedIds.set(target, ids);
      }
      if (ids.has(rule.id)) {
        return {
          foldedRules: false,
          identityChanged: normalized.changed,
          router: next
        };
      }
      ids.add(rule.id);
      folds.push({ rule, target });
    }
    for (const { rule, target } of folds) {
      const rules = Array.isArray(target.rules) ? target.rules : [];
      target.rules = [...rules, rule];
    }
    next.vaults = vaults;
    delete next.rules;
    foldedRules = true;
  }
  return {
    foldedRules,
    identityChanged: normalized.changed,
    router: next
  };
}
