import { describe, it, expect, beforeEach } from 'vitest';
import {
  addAdditionalVault,
  addRoutingRule,
  getVaultRouterConfig,
  initializeVaultRouterStore,
  removeAdditionalVault,
  resetVaultRouterStore,
  updateRoutingRule
} from '../../src/options/state/vaultRouterStore';

describe('vaultRouterStore', () => {
  beforeEach(() => {
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
    expect(config?.rules).toHaveLength(1);
    expect(config?.rules[0].description).toBe('Example domain');
    expect(config?.rules[0].enabled).toBe(false);
    expect(config?.defaultVaultId).toBe(vault.id);
  });

  it('removes associated rules when a vault is deleted', () => {
    const vault = addAdditionalVault({ name: 'To Remove' });
    addRoutingRule({ vaultId: vault.id, pattern: 'remove.me', type: 'keyword' });

    removeAdditionalVault(vault.id);

    const config = getVaultRouterConfig();
    expect(config).toBeUndefined();
  });
});
