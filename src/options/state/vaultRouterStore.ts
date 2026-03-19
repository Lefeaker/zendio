import { deepClone } from '../utils/clone';
import type { VaultRouterConfig, VaultConfig, RoutingRule } from '../../shared/types';
import { generateId } from '../../background/vault-router';
import { STATE_KEYS, getStateStore } from '../../shared/state';
import { configProvider } from '../../shared/config';

interface VaultRouterState {
  vaults: VaultConfig[];
  defaultVaultId?: string;
}

const STORE_KEY = STATE_KEYS.vaultRouter;
const REST_DEFAULTS = configProvider.getRestDefaults();
const store = getStateStore<VaultRouterState>(STORE_KEY);

function createEmptyState(): VaultRouterState {
  return { vaults: [] };
}

function getDraftState(): VaultRouterState {
  const current = store.get();
  return current ? deepClone(current) : createEmptyState();
}

function setState(state: VaultRouterState): void {
  store.set(deepClone(state));
}

function updateState(mutator: (state: VaultRouterState) => void): VaultRouterState {
  const draft = getDraftState();
  mutator(draft);
  setState(draft);
  return draft;
}

function normalizeVault(vault: VaultConfig): VaultConfig {
  const cloned: VaultConfig = {
    ...vault,
    enabled: vault.enabled !== false,
    rules: (vault.rules ?? []).map(rule => ({
      ...rule,
      vaultId: rule.vaultId ?? vault.id
    }))
  };

  if (!cloned.rules) {
    cloned.rules = [];
  }

  return cloned;
}

function findVaultIndex(state: VaultRouterState, id: string): number {
  return state.vaults.findIndex(vault => vault.id === id);
}

function findRuleLocation(state: VaultRouterState, id: string):
  | { vaultIndex: number; ruleIndex: number }
  | undefined {
  for (let vaultIndex = 0; vaultIndex < state.vaults.length; vaultIndex += 1) {
    const rules = state.vaults[vaultIndex].rules ?? [];
    const ruleIndex = rules.findIndex(rule => rule.id === id);
    if (ruleIndex !== -1) {
      return { vaultIndex, ruleIndex };
    }
  }
  return undefined;
}

export function resetVaultRouterStore(): void {
  setState(createEmptyState());
}

export function initializeVaultRouterStore(config?: VaultRouterConfig | null): void {
  if (!config) {
    resetVaultRouterStore();
    return;
  }

  const configClone = deepClone(config);
  const normalizedVaults = (configClone.vaults ?? []).map(normalizeVault);

  if (configClone.rules?.length) {
    for (const legacyRule of configClone.rules) {
      const targetIndex = normalizedVaults.findIndex(vault => vault.id === legacyRule.vaultId);
      if (targetIndex === -1) {
        continue;
      }
      const vault = normalizedVaults[targetIndex];
      if (!vault.rules) {
        vault.rules = [];
      }
      const exists = vault.rules.find(rule => rule.id === legacyRule.id);
      if (!exists) {
        vault.rules.push({
          ...legacyRule,
          vaultId: vault.id
        });
      }
    }
  }

  setState({
    vaults: normalizedVaults,
    defaultVaultId:
      configClone.defaultVaultId ??
      normalizedVaults.find(vault => vault.isDefault)?.id ??
      normalizedVaults[0]?.id
  });
}

export function getVaultsSnapshot(): VaultConfig[] {
  const state = getDraftState();
  return state.vaults.map(vault => ({
    ...vault,
    rules: (vault.rules ?? []).map(rule => ({ ...rule }))
  }));
}

export function addAdditionalVault(initial?: Partial<VaultConfig>): VaultConfig {
  let created: VaultConfig | undefined;
  updateState(state => {
    const newVaultId = initial?.id ?? generateId();
    const newVault: VaultConfig = normalizeVault({
      id: newVaultId,
      name: initial?.name ?? '新仓库',
      httpsUrl: initial?.httpsUrl ?? REST_DEFAULTS.httpsUrl,
      httpUrl: initial?.httpUrl ?? REST_DEFAULTS.httpUrl,
      vault: initial?.vault ?? REST_DEFAULTS.vault,
      apiKey: initial?.apiKey ?? REST_DEFAULTS.apiKey,
      isDefault: initial?.isDefault ?? false,
      enabled: initial?.enabled ?? true,
      rules: (initial?.rules ?? []).map(rule => ({ ...rule, vaultId: rule.vaultId ?? newVaultId }))
    });

    state.vaults.push(newVault);

    if (newVault.isDefault || state.vaults.length === 1) {
      state.defaultVaultId = newVault.id;
    }

    created = {
      ...newVault,
      rules: (newVault.rules ?? []).map(rule => ({ ...rule }))
    };
  });

  if (!created) {
    throw new Error('Failed to create additional vault');
  }

  return created;
}

export function updateAdditionalVault(id: string, updates: Partial<VaultConfig>): void {
  updateState(state => {
    const index = findVaultIndex(state, id);
    if (index === -1) {
      return;
    }

    const current = state.vaults[index];
    const next: VaultConfig = normalizeVault({
      ...current,
      ...updates,
      rules: updates.rules
        ? updates.rules.map(rule => ({ ...rule, vaultId: rule.vaultId ?? id }))
        : current.rules ?? []
    });

    state.vaults[index] = next;

    if (updates.isDefault) {
      state.defaultVaultId = id;
    }
  });
}

export function removeAdditionalVault(id: string): void {
  updateState(state => {
    state.vaults = state.vaults.filter(vault => vault.id !== id);
    if (state.defaultVaultId === id) {
      state.defaultVaultId = state.vaults[0]?.id;
    }
  });
}

export function addRoutingRule(initial?: Partial<RoutingRule>): RoutingRule {
  let created: RoutingRule | undefined;
  updateState(state => {
    if (state.vaults.length === 0) {
      throw new Error('No additional vaults configured');
    }

    const requestedVault = initial?.vaultId
      ? state.vaults.find(vault => vault.id === initial.vaultId)
      : undefined;

    const targetVault = requestedVault ?? state.vaults[0];
    if (!targetVault.rules) {
      targetVault.rules = [];
    }

    const newRuleBase: RoutingRule = {
      id: initial?.id ?? generateId(),
      vaultId: targetVault.id,
      type: initial?.type ?? 'domain',
      pattern: initial?.pattern ?? '',
      enabled: initial?.enabled ?? false,
      priority: initial?.priority ?? 10
    };

    const newRule: RoutingRule = initial?.description !== undefined
      ? { ...newRuleBase, description: initial.description }
      : newRuleBase;

    targetVault.rules.push(newRule);
    created = { ...newRule };
  });

  if (!created) {
    throw new Error('Failed to create routing rule');
  }

  return created;
}

export function updateRoutingRule(id: string, updates: Partial<RoutingRule>): void {
  updateState(state => {
    const location = findRuleLocation(state, id);
    if (!location) {
      return;
    }

    const { vaultIndex, ruleIndex } = location;
    const sourceVault = state.vaults[vaultIndex];
    const currentRule = sourceVault.rules?.[ruleIndex];
    if (!currentRule) {
      return;
    }

    const desiredVaultId = updates.vaultId ?? currentRule.vaultId ?? sourceVault.id;
    let targetVault = state.vaults.find(vault => vault.id === desiredVaultId);
    if (!targetVault) {
      targetVault = sourceVault;
    }

    const updatedRule: RoutingRule = {
      ...currentRule,
      ...updates,
      vaultId: targetVault.id
    };

    if (!targetVault.rules) {
      targetVault.rules = [];
    }

    if (targetVault.id === sourceVault.id) {
      targetVault.rules[ruleIndex] = updatedRule;
      return;
    }

    sourceVault.rules?.splice(ruleIndex, 1);
    targetVault.rules.push(updatedRule);
  });
}

export function removeRoutingRule(id: string): void {
  updateState(state => {
    const location = findRuleLocation(state, id);
    if (!location) {
      return;
    }

    const { vaultIndex, ruleIndex } = location;
    const vault = state.vaults[vaultIndex];
    vault.rules?.splice(ruleIndex, 1);
  });
}

export function getVaultRouterConfig(): VaultRouterConfig | undefined {
  const state = store.get();
  if (!state || state.vaults.length === 0) {
    return undefined;
  }

  const cloned = deepClone(state);
  return {
    vaults: cloned.vaults,
    defaultVaultId:
      cloned.defaultVaultId ??
      cloned.vaults.find(vault => vault.isDefault)?.id ??
      cloned.vaults[0]?.id
  };
}

export function subscribeVaultRouter(listener: (state: VaultRouterState) => void): () => void {
  return store.subscribe(value => {
    const next = value ?? createEmptyState();
    listener(deepClone(next));
  });
}
