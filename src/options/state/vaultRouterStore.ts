import { deepClone } from '../utils/clone';
import type { VaultRouterConfig, VaultConfig, RoutingRule } from '../../shared/types';
import { generateId } from '../../background/vault-router';

let additionalVaults: VaultConfig[] = [];
let defaultVaultId: string | undefined;

export function resetVaultRouterStore(): void {
  additionalVaults = [];
  defaultVaultId = undefined;
}

export function initializeVaultRouterStore(config?: VaultRouterConfig | null): void {
  if (!config) {
    resetVaultRouterStore();
    return;
  }

  additionalVaults = (config.vaults ?? []).map(vault => ({
    ...vault,
    rules: (vault.rules ?? []).map(rule => ({ ...rule, vaultId: rule.vaultId ?? vault.id }))
  }));

  if (config.rules?.length) {
    for (const legacyRule of config.rules) {
      const targetVault = additionalVaults.find(vault => vault.id === legacyRule.vaultId);
      if (!targetVault) {
        continue;
      }

      if (!targetVault.rules) {
        targetVault.rules = [];
      }

      const exists = targetVault.rules.find(rule => rule.id === legacyRule.id);
      if (!exists) {
        targetVault.rules.push({ ...legacyRule, vaultId: targetVault.id });
      }
    }
  }

  additionalVaults.forEach(vault => {
    if (!vault.rules) {
      vault.rules = [];
    }
  });

  defaultVaultId = config.defaultVaultId ?? additionalVaults.find(vault => vault.isDefault)?.id;
}

export function getVaultsSnapshot(): VaultConfig[] {
  return additionalVaults.map(vault => ({
    ...vault,
    rules: (vault.rules ?? []).map(rule => ({ ...rule }))
  }));
}

export function addAdditionalVault(initial?: Partial<VaultConfig>): VaultConfig {
  const newVaultId = initial?.id ?? generateId();

  const newVault: VaultConfig = {
    id: newVaultId,
    name: initial?.name ?? '新仓库',
    httpsUrl: initial?.httpsUrl ?? 'https://127.0.0.1:27124/',
    httpUrl: initial?.httpUrl ?? 'http://127.0.0.1:27123/',
    vault: initial?.vault ?? 'YourVault',
    apiKey: initial?.apiKey ?? '',
    isDefault: initial?.isDefault ?? false,
    rules: (initial?.rules ?? []).map(rule => ({ ...rule, vaultId: rule.vaultId ?? newVaultId }))
  };

  additionalVaults.push(newVault);

  if (newVault.isDefault || additionalVaults.length === 1) {
    defaultVaultId = newVault.id;
  }

  return {
    ...newVault,
    rules: newVault.rules.map(rule => ({ ...rule }))
  };
}

export function updateAdditionalVault(id: string, updates: Partial<VaultConfig>): void {
  const index = additionalVaults.findIndex(vault => vault.id === id);
  if (index === -1) return;

  const current = additionalVaults[index];
  const next: VaultConfig = {
    ...current,
    ...updates,
    rules: updates.rules
      ? updates.rules.map(rule => ({ ...rule, vaultId: rule.vaultId ?? id }))
      : current.rules ?? []
  };
  additionalVaults[index] = next;

  if (updates.isDefault) {
    defaultVaultId = id;
  }
}

export function removeAdditionalVault(id: string): void {
  additionalVaults = additionalVaults.filter(vault => vault.id !== id);

  if (defaultVaultId === id) {
    defaultVaultId = additionalVaults[0]?.id;
  }
}

export function addRoutingRule(initial?: Partial<RoutingRule>): RoutingRule {
  if (additionalVaults.length === 0) {
    throw new Error('No additional vaults configured');
  }

  const requestedVault = initial?.vaultId
    ? additionalVaults.find(vault => vault.id === initial.vaultId)
    : undefined;

  const targetVault = requestedVault ?? additionalVaults[0];

  if (!targetVault.rules) {
    targetVault.rules = [];
  }

  const newRule: RoutingRule = {
    id: initial?.id ?? generateId(),
    vaultId: targetVault.id,
    type: initial?.type ?? 'domain',
    pattern: initial?.pattern ?? '',
    enabled: initial?.enabled ?? false,
    priority: initial?.priority ?? 10,
    description: initial?.description
  };

  targetVault.rules.push(newRule);
  return { ...newRule };
}

export function updateRoutingRule(id: string, updates: Partial<RoutingRule>): void {
  const location = findRuleLocation(id);
  if (!location) return;

  const { vault, index } = location;
  const currentRule = vault.rules![index];
  const desiredVaultId = updates.vaultId ?? currentRule.vaultId ?? vault.id;
  let targetVault = additionalVaults.find(v => v.id === desiredVaultId);

  if (!targetVault) {
    targetVault = vault;
  }

  const updatedRule: RoutingRule = {
    ...currentRule,
    ...updates,
    vaultId: targetVault.id
  };

  if (!targetVault.rules) {
    targetVault.rules = [];
  }

  if (targetVault.id === vault.id) {
    targetVault.rules[index] = updatedRule;
    return;
  }

  vault.rules!.splice(index, 1);
  targetVault.rules.push(updatedRule);
}

export function removeRoutingRule(id: string): void {
  const location = findRuleLocation(id);
  if (!location) return;

  const { vault, index } = location;
  vault.rules!.splice(index, 1);
}

export function getVaultRouterConfig(): VaultRouterConfig | undefined {
  if (additionalVaults.length === 0) {
    return undefined;
  }

  const config: VaultRouterConfig = {
    vaults: additionalVaults.map(vault => {
      const clone = deepClone(vault);
      clone.rules = (vault.rules ?? []).map(rule => deepClone(rule));
      return clone;
    }),
    defaultVaultId: defaultVaultId ?? additionalVaults.find(vault => vault.isDefault)?.id ?? additionalVaults[0]?.id
  };

  return config;
}

function findRuleLocation(id: string): { vault: VaultConfig; index: number } | undefined {
  for (const vault of additionalVaults) {
    const rules = vault.rules ?? [];
    const index = rules.findIndex(rule => rule.id === id);
    if (index !== -1) {
      return { vault, index };
    }
  }

  return undefined;
}
