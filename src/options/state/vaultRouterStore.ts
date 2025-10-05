import { deepClone } from '../utils/clone';
import type { VaultRouterConfig, VaultConfig, RoutingRule } from '../../shared/types';
import { generateId } from '../../background/vault-router';

let additionalVaults: VaultConfig[] = [];
let routingRules: RoutingRule[] = [];
let defaultVaultId: string | undefined;

export function resetVaultRouterStore(): void {
  additionalVaults = [];
  routingRules = [];
  defaultVaultId = undefined;
}

export function initializeVaultRouterStore(config?: VaultRouterConfig | null): void {
  if (!config) {
    resetVaultRouterStore();
    return;
  }

  additionalVaults = config.vaults ? config.vaults.map(vault => ({ ...vault })) : [];
  routingRules = config.rules ? config.rules.map(rule => ({ ...rule })) : [];
  defaultVaultId = config.defaultVaultId ?? additionalVaults.find(vault => vault.isDefault)?.id;
}

export function getVaultsSnapshot(): VaultConfig[] {
  return additionalVaults.map(vault => ({ ...vault }));
}

export function getRulesSnapshot(): RoutingRule[] {
  return routingRules.map(rule => ({ ...rule }));
}

export function addAdditionalVault(initial?: Partial<VaultConfig>): VaultConfig {
  const newVault: VaultConfig = {
    id: initial?.id ?? generateId(),
    name: initial?.name ?? '新仓库',
    httpsUrl: initial?.httpsUrl ?? 'https://127.0.0.1:27124/',
    httpUrl: initial?.httpUrl ?? 'http://127.0.0.1:27123/',
    vault: initial?.vault ?? 'YourVault',
    apiKey: initial?.apiKey ?? '',
    isDefault: initial?.isDefault ?? false
  };

  additionalVaults.push(newVault);

  if (newVault.isDefault || additionalVaults.length === 1) {
    defaultVaultId = newVault.id;
  }

  return { ...newVault };
}

export function updateAdditionalVault(id: string, updates: Partial<VaultConfig>): void {
  const index = additionalVaults.findIndex(vault => vault.id === id);
  if (index === -1) return;

  const current = additionalVaults[index];
  const next = { ...current, ...updates };
  additionalVaults[index] = next;

  if (updates.isDefault) {
    defaultVaultId = id;
  }
}

export function removeAdditionalVault(id: string): void {
  additionalVaults = additionalVaults.filter(vault => vault.id !== id);
  routingRules = routingRules.filter(rule => rule.vaultId !== id);

  if (defaultVaultId === id) {
    defaultVaultId = additionalVaults[0]?.id;
  }
}

export function addRoutingRule(initial?: Partial<RoutingRule>): RoutingRule {
  const fallbackVaultId = initial?.vaultId ?? additionalVaults[0]?.id ?? '';

  const newRule: RoutingRule = {
    id: initial?.id ?? generateId(),
    vaultId: fallbackVaultId,
    type: initial?.type ?? 'domain',
    pattern: initial?.pattern ?? '',
    enabled: initial?.enabled ?? false,
    priority: initial?.priority ?? 10,
    description: initial?.description
  };

  routingRules.push(newRule);
  return { ...newRule };
}

export function updateRoutingRule(id: string, updates: Partial<RoutingRule>): void {
  const index = routingRules.findIndex(rule => rule.id === id);
  if (index === -1) return;

  routingRules[index] = { ...routingRules[index], ...updates };
}

export function removeRoutingRule(id: string): void {
  routingRules = routingRules.filter(rule => rule.id !== id);
}

export function getVaultRouterConfig(): VaultRouterConfig | undefined {
  if (additionalVaults.length === 0 && routingRules.length === 0) {
    return undefined;
  }

  const config: VaultRouterConfig = {
    vaults: additionalVaults.map(vault => deepClone(vault)),
    rules: routingRules.map(rule => deepClone(rule)),
    defaultVaultId: defaultVaultId ?? additionalVaults.find(vault => vault.isDefault)?.id ?? additionalVaults[0]?.id
  };

  return config;
}
