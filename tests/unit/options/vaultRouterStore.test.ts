import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateStore } from '@shared/state';

const stateStores = vi.hoisted(() => new Map<string, StateStore<unknown>>());

vi.mock('../../../src/shared/state', async () => {
  const actual = await vi.importActual<typeof import('../../../src/shared/state')>('../../../src/shared/state');

  return {
    ...actual,
    STATE_KEYS: {
      ...actual.STATE_KEYS,
      vaultRouter: 'vaultRouter'
    },
    getStateStore: <T,>(key: string): StateStore<T> => {
      const existing = stateStores.get(key);
      if (existing) {
        return existing as StateStore<T>;
      }

      let value: T | undefined;
      const listeners = new Set<(next: T | undefined) => void>();
      const store: StateStore<T> = {
        key,
        get: () => value,
        set: (next) => {
          value = next;
          listeners.forEach((listener) => listener(next));
        },
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        clear: () => {
          value = undefined;
          listeners.clear();
        }
      };

      stateStores.set(key, store as StateStore<unknown>);
      return store;
    }
  };
});

import {
  addAdditionalVault,
  addRoutingRule,
  getVaultRouterConfig,
  initializeVaultRouterStore,
  removeAdditionalVault,
  removeRoutingRule,
  resetVaultRouterStore,
  subscribeVaultRouter,
  updateAdditionalVault,
  updateRoutingRule
} from '@options/state/vaultRouterStore';

describe('vaultRouterStore', () => {
  beforeEach(() => {
    stateStores.clear();
    resetVaultRouterStore();
    initializeVaultRouterStore(null);
  });

  it('returns undefined config when no vaults or rules are registered', () => {
    expect(getVaultRouterConfig()).toBeUndefined();
  });

  it('creates vault and routing rule and exposes them via config snapshot', () => {
    const vault = addAdditionalVault({ name: 'Secondary Vault' });
    const rule = addRoutingRule({
      vaultId: vault.id,
      pattern: 'example.com',
      priority: 50,
      type: 'domain',
      enabled: true
    });

    // Update rule to ensure mutations are persisted
    updateRoutingRule(rule.id, { description: 'Example domain', enabled: false });

    const config = getVaultRouterConfig();
    expect(config).toBeDefined();
    expect(config?.vaults).toHaveLength(1);
    expect(config?.vaults[0].name).toBe('Secondary Vault');
    expect(config?.vaults[0].rules).toHaveLength(1);
    expect(config?.vaults[0].rules?.[0].description).toBe('Example domain');
    expect(config?.vaults[0].rules?.[0].enabled).toBe(false);
    expect(config?.rules).toBeUndefined();
    expect(config?.defaultVaultId).toBe(vault.id);
  });

  it('removes associated rules when a vault is deleted', () => {
    const vault = addAdditionalVault({ name: 'To Remove' });
    addRoutingRule({ vaultId: vault.id, pattern: 'remove.me', type: 'keyword' });

    removeAdditionalVault(vault.id);

    const config = getVaultRouterConfig();
    expect(config).toBeUndefined();
  });


  it('resets state and applies fallback default vault resolution', () => {
    addAdditionalVault({ id: 'a', name: 'A', isDefault: true });
    resetVaultRouterStore();
    expect(getVaultRouterConfig()).toBeUndefined();

    initializeVaultRouterStore({
      vaults: [
        {
          id: 'first',
          name: 'First',
          httpsUrl: 'https://first.example.com/',
          httpUrl: 'http://first.example.com/',
          vault: 'First',
          apiKey: 'first-key',
          enabled: true
        },
        {
          id: 'second',
          name: 'Second',
          httpsUrl: 'https://second.example.com/',
          httpUrl: 'http://second.example.com/',
          vault: 'Second',
          apiKey: 'second-key',
          enabled: true,
          isDefault: true
        }
      ]
    });
    expect(getVaultRouterConfig()?.defaultVaultId).toBe('second');

    initializeVaultRouterStore({
      vaults: [{
        id: 'fallback',
        name: 'Fallback',
        httpsUrl: 'https://fallback.example.com/',
        httpUrl: 'http://fallback.example.com/',
        vault: 'Fallback',
        apiKey: 'fallback-key',
        enabled: true
      }]
    });
    expect(getVaultRouterConfig()?.defaultVaultId).toBe('fallback');
  });

  it('keeps custom vault fields, updates default vault, and normalizes moved rules', () => {
    const first = addAdditionalVault({ id: 'first', name: 'First', vault: 'Main' });
    const second = addAdditionalVault({ id: 'second', name: 'Second', vault: 'Side' });
    const rule = addRoutingRule({ vaultId: first.id, pattern: 'example.com', type: 'domain' });

    updateAdditionalVault('missing', { name: 'ignored' });
    updateAdditionalVault(second.id, { isDefault: true, rules: [{ ...rule, id: 'moved', vaultId: '' }] });

    const config = getVaultRouterConfig();
    expect(config?.defaultVaultId).toBe('second');
    expect(config?.vaults.find(v => v.id === 'second')?.rules?.[0].vaultId).toBe('');
    expect(config?.vaults.find(v => v.id === 'first')?.name).toBe('First');
  });

  it('falls back to first vault, supports missing-rule no-op, and notifies subscribers', () => {
    const first = addAdditionalVault({ id: 'first', name: 'First' });
    addAdditionalVault({ id: 'second', name: 'Second' });
    const updates: Array<{ vaults: Array<{ id: string }>; defaultVaultId?: string }> = [];
    const unsubscribe = subscribeVaultRouter((state) => { updates.push({ vaults: state.vaults.map(v => ({ id: v.id })), defaultVaultId: state.defaultVaultId }); });

    const fallbackRule = addRoutingRule({ vaultId: 'missing', pattern: 'fallback.me' });
    expect(fallbackRule.vaultId).toBe(first.id);

    updateRoutingRule('missing', { enabled: true });
    removeRoutingRule('missing');
    updateRoutingRule(fallbackRule.id, { vaultId: 'second', enabled: true });
    removeRoutingRule(fallbackRule.id);
    removeAdditionalVault('missing');
    removeAdditionalVault(first.id);

    expect(getVaultRouterConfig()?.defaultVaultId).toBe('second');
    expect(updates.length).toBeGreaterThan(1);
    const countBefore = updates.length;
    unsubscribe();
    addAdditionalVault({ id: 'third', name: 'Third' });
    expect(updates).toHaveLength(countBefore);
  });

  it('throws when adding a routing rule without any vaults', () => {
    resetVaultRouterStore();
    expect(() => addRoutingRule()).toThrow('No additional vaults configured');
  });

  it('merges legacy top-level rules into matching vaults during initialization', () => {
    initializeVaultRouterStore({
      vaults: [{
        id: 'main',
        name: 'Main',
        httpsUrl: 'https://main.example.com/',
        httpUrl: 'http://main.example.com/',
        vault: 'Main',
        apiKey: 'main-key',
        enabled: true,
        rules: []
      }],
      rules: [{ id: 'legacy-rule', type: 'domain', pattern: 'legacy.example.com', vaultId: 'main', enabled: true, priority: 3 }],
      defaultVaultId: 'missing'
    });

    const config = getVaultRouterConfig();
    expect(config?.defaultVaultId).toBe('missing');
    expect(config?.vaults[0].rules?.[0].id).toBe('legacy-rule');
  });

});
