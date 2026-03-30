import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { VaultConfig, RoutingRule } from '@shared/types/vault';
import { VaultRouterController } from '@options/components/controls/vaultRouterController';

const optionsContextMocks = vi.hoisted(() => ({
  scheduleAutoSave: vi.fn<[], void>(),
  markPendingAutoSave: vi.fn<[string], void>()
}));

const vaultStoreMocks = vi.hoisted(() => ({
  addAdditionalVault: vi.fn<[Partial<VaultConfig>?], VaultConfig>((initial) => ({
    id: 'vault-1',
    name: initial?.name ?? 'Vault',
    vault: initial?.vault ?? 'Vault',
    httpsUrl: initial?.httpsUrl ?? 'https://vault',
    httpUrl: initial?.httpUrl ?? 'http://vault',
    apiKey: initial?.apiKey ?? 'KEY',
    enabled: true,
    rules: []
  })),
  updateAdditionalVault: vi.fn<[string, Partial<VaultConfig>], void>(),
  removeAdditionalVault: vi.fn<[string], void>(),
  addRoutingRule: vi.fn<[Partial<RoutingRule>?], RoutingRule>((initial) => ({
    id: 'rule-1',
    type: initial?.type ?? 'domain',
    pattern: initial?.pattern ?? '',
    vaultId: initial?.vaultId ?? 'vault-1',
    enabled: initial?.enabled ?? true,
    priority: initial?.priority ?? 10
  })),
  updateRoutingRule: vi.fn<[string, Partial<RoutingRule>], void>(),
  removeRoutingRule: vi.fn<[string], void>()
}));

vi.mock('@options/app/optionsControllerContext', () => ({
  getOptionsController: () => ({ scheduleAutoSave: optionsContextMocks.scheduleAutoSave }),
  markPendingAutoSave: optionsContextMocks.markPendingAutoSave
}));

vi.mock('@options/state/vaultRouterStore', () => ({
  addAdditionalVault: (initial?: Partial<VaultConfig>) => vaultStoreMocks.addAdditionalVault(initial),
  updateAdditionalVault: (id: string, updates: Partial<VaultConfig>) =>
    vaultStoreMocks.updateAdditionalVault(id, updates),
  removeAdditionalVault: (id: string) => vaultStoreMocks.removeAdditionalVault(id),
  addRoutingRule: (initial?: Partial<RoutingRule>) => vaultStoreMocks.addRoutingRule(initial),
  updateRoutingRule: (id: string, updates: Partial<RoutingRule>) =>
    vaultStoreMocks.updateRoutingRule(id, updates),
  removeRoutingRule: (id: string) => vaultStoreMocks.removeRoutingRule(id)
}));

describe('VaultRouterController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds vaults and schedules auto save', () => {
    const controller = new VaultRouterController();
    const result = controller.addVault({ name: 'New Vault' });

    expect(vaultStoreMocks.addAdditionalVault).toHaveBeenCalledWith({ name: 'New Vault' });
    expect(result.id).toBe('vault-1');
    expect(optionsContextMocks.markPendingAutoSave).toHaveBeenCalledWith('vaultRouter');
    expect(optionsContextMocks.scheduleAutoSave).toHaveBeenCalled();
  });

  it('updates routing rules without scheduling when silent', () => {
    const controller = new VaultRouterController();
    controller.updateRule('rule-1', { pattern: 'docs.example.com' }, { silent: true });

    expect(vaultStoreMocks.updateRoutingRule).toHaveBeenCalledWith('rule-1', { pattern: 'docs.example.com' });
    expect(optionsContextMocks.markPendingAutoSave).not.toHaveBeenCalled();
    expect(optionsContextMocks.scheduleAutoSave).not.toHaveBeenCalled();
  });

  it('updates vault fields and schedules auto save', () => {
    const controller = new VaultRouterController();
    controller.updateVault('vault-1', { name: 'Updated' });

    expect(vaultStoreMocks.updateAdditionalVault).toHaveBeenCalledWith('vault-1', { name: 'Updated' });
    expect(optionsContextMocks.markPendingAutoSave).toHaveBeenCalledWith('vaultRouter');
    expect(optionsContextMocks.scheduleAutoSave).toHaveBeenCalledTimes(1);
  });

  it('removes vaults and routing rules with auto save', () => {
    const controller = new VaultRouterController();
    controller.removeVault('vault-1');
    controller.removeRule('rule-1');

    expect(vaultStoreMocks.removeAdditionalVault).toHaveBeenCalledWith('vault-1');
    expect(vaultStoreMocks.removeRoutingRule).toHaveBeenCalledWith('rule-1');
    expect(optionsContextMocks.markPendingAutoSave).toHaveBeenCalledTimes(2);
    expect(optionsContextMocks.scheduleAutoSave).toHaveBeenCalledTimes(2);
  });

  it('add rule schedules auto save and returns created rule', () => {
    const controller = new VaultRouterController();
    const created = controller.addRule({ pattern: '*.md' });

    expect(vaultStoreMocks.addRoutingRule).toHaveBeenCalledWith({ pattern: '*.md' });
    expect(created.id).toBe('rule-1');
    expect(optionsContextMocks.markPendingAutoSave).toHaveBeenCalledWith('vaultRouter');
    expect(optionsContextMocks.scheduleAutoSave).toHaveBeenCalled();
  });

  it('supports disabling auto save via render config', () => {
    const controller = new VaultRouterController();
    controller.render({ autoSave: false });

    controller.addVault({ name: 'No Auto Save' });

    expect(optionsContextMocks.markPendingAutoSave).not.toHaveBeenCalled();
    expect(optionsContextMocks.scheduleAutoSave).not.toHaveBeenCalled();
  });
});
