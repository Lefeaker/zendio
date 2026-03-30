/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import { RoutingSection } from '@options/components/sections/RoutingSection';
import type { OptionsStateManager } from '@options/state/StateManager';
import en from '@i18n/locales/en';
import { MockOptionsRepository } from '../../../utils/repositories';

const routingFixtures = vi.hoisted(() => {
  const scheduleAutoSave = vi.fn();
  const markPendingAutoSave = vi.fn();
  const initialState = {
    vaults: [
      {
        id: 'default',
        name: 'Main Vault',
        vault: 'Main',
        enabled: true,
        rules: [
          {
            id: 'rule-1',
            type: 'domain' as const,
            pattern: 'example.com',
            vaultId: 'default',
            enabled: true,
            priority: 10
          }
        ]
      },
      {
        id: 'secondary',
        name: 'Side',
        vault: 'Side',
        enabled: true,
        rules: []
      }
    ],
    defaultVaultId: 'default'
  };
  type RoutingSnapshot = typeof initialState;

  const state: RoutingSnapshot = {
    vaults: initialState.vaults.map((vault) => ({
      ...vault,
      rules: (vault.rules ?? []).map((rule) => ({ ...rule }))
    })),
    defaultVaultId: initialState.defaultVaultId
  };

  const updateRoutingRule = vi.fn();
  const addRoutingRule = vi.fn((initial?: { vaultId?: string }) => {
    const ruleId = `rule-${Date.now()}`;
    const vaultId = initial?.vaultId ?? state.vaults[0]?.id ?? 'default';
    const newRule = {
      id: ruleId,
      type: 'domain' as const,
      pattern: '',
      vaultId,
      enabled: true,
      priority: 10
    };
    const target = state.vaults.find((v) => v.id === vaultId);
    if (target) {
      target.rules = [...(target.rules ?? []), newRule];
      listeners.forEach((listener) =>
        listener({ vaults: state.vaults, defaultVaultId: state.defaultVaultId })
      );
    }
    return newRule;
  });

  const removeRoutingRule = vi.fn((ruleId: string) => {
    for (const vault of state.vaults) {
      const before = vault.rules ?? [];
      vault.rules = before.filter((rule) => rule.id !== ruleId);
    }
    listeners.forEach((listener) =>
      listener({ vaults: state.vaults, defaultVaultId: state.defaultVaultId })
    );
  });

  const listeners: Array<(state: RoutingSnapshot) => void> = [];

  const subscribeVaultRouter = vi.fn((listener: (state: RoutingSnapshot) => void) => {
    listeners.push(listener);
    listener({ vaults: state.vaults, defaultVaultId: state.defaultVaultId });
    return () => {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    };
  });

  const getVaultRouterConfig = vi.fn(() => ({
    vaults: state.vaults.map((vault) => ({
      ...vault,
      rules: (vault.rules ?? []).map((rule) => ({ ...rule }))
    })),
    defaultVaultId: state.defaultVaultId
  }));

  const initializeVaultRouterStore = vi.fn((next?: typeof state | null) => {
    if (!next) {
      state.vaults = [];
      state.defaultVaultId = 'default';
    } else {
      state.vaults = next.vaults.map((vault) => ({
        ...vault,
        rules: (vault.rules ?? []).map((rule) => ({ ...rule }))
      }));
      state.defaultVaultId = next.defaultVaultId;
    }
    listeners.forEach((listener) =>
      listener({ vaults: state.vaults, defaultVaultId: state.defaultVaultId })
    );
  });

  return {
    scheduleAutoSave,
    markPendingAutoSave,
    state,
    updateRoutingRule,
    addRoutingRule,
    removeRoutingRule,
    subscribeVaultRouter,
    getVaultRouterConfig,
    initializeVaultRouterStore,
    reset() {
      scheduleAutoSave.mockClear();
      markPendingAutoSave.mockClear();
      updateRoutingRule.mockClear();
      addRoutingRule.mockClear();
      removeRoutingRule.mockClear();
      subscribeVaultRouter.mockClear();
      getVaultRouterConfig.mockClear();
      initializeVaultRouterStore.mockClear();
      state.vaults = initialState.vaults.map((vault) => ({
        ...vault,
        rules: (vault.rules ?? []).map((rule) => ({ ...rule }))
      }));
      state.defaultVaultId = initialState.defaultVaultId;
    }
  };
});

vi.mock('../../../../src/options/app/optionsControllerContext', () => ({
  getOptionsController: () => ({
    scheduleAutoSave: routingFixtures.scheduleAutoSave
  }),
  markPendingAutoSave: routingFixtures.markPendingAutoSave
}));

vi.mock('../../../../src/options/state/vaultRouterStore', () => ({
  addRoutingRule: routingFixtures.addRoutingRule,
  removeRoutingRule: routingFixtures.removeRoutingRule,
  updateRoutingRule: routingFixtures.updateRoutingRule,
  subscribeVaultRouter: routingFixtures.subscribeVaultRouter,
  getVaultRouterConfig: routingFixtures.getVaultRouterConfig,
  initializeVaultRouterStore: routingFixtures.initializeVaultRouterStore
}));

const noopStateManager = {} as OptionsStateManager;

describe('RoutingSection', () => {
  let registry: FormSectionRegistry;

  beforeEach(() => {
    routingFixtures.reset();
    document.body.innerHTML = '<section id="routing-section"></section>';
    registry = new FormSectionRegistry();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    registry.clear();
  });

  const renderSection = (): { section: RoutingSection; repo: MockOptionsRepository } => {
    const container = document.getElementById('routing-section');
    if (!container) {
      throw new Error('Routing Section container missing');
    }
    const repo = new MockOptionsRepository();
    const section = new RoutingSection(container, repo);
    section.setMessages(en.runtime);
    section.render({ stateManager: noopStateManager, formRegistry: registry });
    return { section, repo };
  };

  it('renders existing routing rules and updates via events', async () => {
    const { section, repo } = renderSection();
    routingFixtures.state.vaults = [
      {
        id: 'default',
        name: 'Main Vault',
        vault: 'Main',
        enabled: true,
        rules: []
      },
      {
        id: 'secondary',
        name: 'Side',
        vault: 'Side',
        enabled: true,
        rules: [
          {
            id: 'rule-secondary',
            type: 'domain',
            pattern: 'secondary.com',
            vaultId: 'secondary',
            enabled: true,
            priority: 5
          }
        ]
      }
    ];
    routingFixtures.state.defaultVaultId = 'default';
    await repo.set({
      vaultRouter: routingFixtures.state
    } as Partial<CompleteOptions>);
    await registry.apply({ vaultRouter: routingFixtures.state } as StoredOptions);

    await vi.waitFor(() => {
      const checkboxes = document.querySelectorAll<HTMLInputElement>('.routing-rule-enabled');
      expect(checkboxes).toHaveLength(1);
    });
    const checkboxes = Array.from(
      document.querySelectorAll<HTMLInputElement>('.routing-rule-enabled')
    );

    const checkbox = checkboxes[0];
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(routingFixtures.updateRoutingRule).toHaveBeenCalledWith('rule-secondary', {
      enabled: false
    });
    expect(routingFixtures.scheduleAutoSave).toHaveBeenCalled();
    expect(routingFixtures.markPendingAutoSave).toHaveBeenCalledWith('vaultRouter');
    expect(routingFixtures.markPendingAutoSave).toHaveBeenCalledWith('routing');

    const addButton = Array.from(section['container']?.querySelectorAll('button') ?? []).find((b) =>
      b.textContent?.includes('+')
    );
    addButton?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(routingFixtures.addRoutingRule).toHaveBeenCalled();
    expect(section['container'].textContent).toContain(en.runtime.routingRulesPriorityNote);

    section.destroy();
  });

  it('collects vault router configuration through form section manager', async () => {
    const { section, repo } = renderSection();
    routingFixtures.state.vaults = [
      {
        id: 'default',
        name: 'Main Vault',
        vault: 'Main',
        enabled: true,
        rules: []
      },
      {
        id: 'secondary',
        name: 'Side',
        vault: 'Side',
        enabled: true,
        rules: [
          {
            id: 'rule-secondary',
            type: 'domain',
            pattern: 'secondary.com',
            vaultId: 'secondary',
            enabled: true,
            priority: 5
          }
        ]
      }
    ];
    routingFixtures.state.defaultVaultId = 'default';
    await repo.set({
      vaultRouter: routingFixtures.state
    } as Partial<CompleteOptions>);
    await registry.apply({ vaultRouter: routingFixtures.state } as StoredOptions);

    const collected = registry.collect({ vaultRouter: routingFixtures.state } as StoredOptions);
    const expected = routingFixtures.getVaultRouterConfig();
    expect(collected.vaultRouter).toEqual(expected);
    await vi.waitFor(() => {
      expect(repo.getMockData().vaultRouter).toEqual(expected);
    });

    section.destroy();
  });

  it('renders empty placeholder when no rules exist and falls back to first vault as default', async () => {
    const { section } = renderSection();
    routingFixtures.state.vaults = [
      { id: 'alpha', name: '', vault: 'Alpha', enabled: true, rules: [] },
      { id: 'beta', name: 'Beta', vault: 'Beta', enabled: false, rules: [] }
    ];
    routingFixtures.state.defaultVaultId = undefined as unknown as string;

    await registry.apply({ vaultRouter: routingFixtures.state } as StoredOptions);

    expect(document.getElementById('routing-section')?.textContent).toContain(
      en.runtime.ruleEmptyPlaceholder
    );
    expect(document.getElementById('routing-section')?.textContent).toContain(
      en.runtime.routingRulesPriorityNote
    );
    section.destroy();
  });

  it('stops reacting to repository changes after destroy', async () => {
    const { section, repo } = renderSection();
    const initCallsBefore = routingFixtures.initializeVaultRouterStore.mock.calls.length;
    section.destroy();

    await repo.set({
      vaultRouter: {
        vaults: [{ id: 'after', name: 'After', vault: 'After', enabled: true, rules: [] }],
        defaultVaultId: 'after'
      }
    } as Partial<CompleteOptions>);

    expect(routingFixtures.initializeVaultRouterStore.mock.calls.length).toBe(initCallsBefore);
  });

  it('schedules auto save when routing pattern is edited', async () => {
    const { section, repo } = renderSection();
    routingFixtures.state.vaults = [
      {
        id: 'default',
        name: 'Main Vault',
        vault: 'Main',
        enabled: true,
        rules: []
      },
      {
        id: 'secondary',
        name: 'Side',
        vault: 'Side',
        enabled: true,
        rules: [
          {
            id: 'rule-secondary',
            type: 'domain',
            pattern: 'secondary.com',
            vaultId: 'secondary',
            enabled: true,
            priority: 5
          }
        ]
      }
    ];
    routingFixtures.state.defaultVaultId = 'default';
    await repo.set({
      vaultRouter: routingFixtures.state
    } as Partial<CompleteOptions>);
    await registry.apply({ vaultRouter: routingFixtures.state } as StoredOptions);
    routingFixtures.scheduleAutoSave.mockClear();

    const patternInput = await vi.waitFor(() => {
      const input = document.querySelector<HTMLInputElement>('.routing-rule-pattern');
      expect(input).toBeTruthy();
      return input;
    });
    if (!patternInput) {
      throw new Error('Pattern input missing');
    }

    patternInput.value = 'docs.example.com';
    patternInput.dispatchEvent(new Event('input', { bubbles: true }));
    patternInput.dispatchEvent(new Event('blur', { bubbles: true }));

    expect(routingFixtures.updateRoutingRule).toHaveBeenCalledWith('rule-secondary', {
      pattern: 'docs.example.com'
    });
    expect(routingFixtures.scheduleAutoSave).toHaveBeenCalled();
    expect(routingFixtures.markPendingAutoSave).toHaveBeenCalledWith('vaultRouter');
    expect(routingFixtures.markPendingAutoSave).toHaveBeenCalledWith('routing');

    section.destroy();
  });

  it('updates target vault and restores empty state after deleting the last rule', async () => {
    const { section, repo } = renderSection();
    routingFixtures.state.vaults = [
      {
        id: 'default',
        name: 'Main Vault',
        vault: 'Main',
        enabled: true,
        rules: [
          {
            id: 'rule-default',
            type: 'domain',
            pattern: 'main.example.com',
            vaultId: 'default',
            enabled: true,
            priority: 8
          }
        ]
      },
      {
        id: 'secondary',
        name: 'Side',
        vault: 'Side',
        enabled: true,
        rules: []
      }
    ];
    routingFixtures.state.defaultVaultId = 'default';
    await repo.set({
      vaultRouter: routingFixtures.state
    } as Partial<CompleteOptions>);
    await registry.apply({ vaultRouter: routingFixtures.state } as StoredOptions);

    const targetSelect = await vi.waitFor(() => {
      const element = document.querySelector<HTMLSelectElement>('.routing-rule-target');
      expect(element).toBeTruthy();
      return element;
    });
    if (!targetSelect) {
      throw new Error('Target select missing');
    }
    targetSelect.value = 'secondary';
    targetSelect.dispatchEvent(new Event('change', { bubbles: true }));

    expect(routingFixtures.updateRoutingRule).toHaveBeenCalledWith('rule-default', {
      vaultId: 'secondary'
    });

    routingFixtures.removeRoutingRule('rule-default');

    await vi.waitFor(() => {
      const empty = document.querySelector<HTMLElement>('[data-role="routing-empty"]');
      expect(empty).toBeTruthy();
      expect(empty?.hidden).toBe(false);
    });

    section.destroy();
  });

  it('updates routing table when repository snapshot changes', async () => {
    const { section, repo } = renderSection();
    await repo.set({
      vaultRouter: {
        vaults: [
          {
            id: 'repo',
            name: 'RepoVault',
            vault: 'RepoVault',
            enabled: true,
            rules: [
              {
                id: 'repo-rule',
                type: 'domain',
                pattern: 'repo.example.com',
                vaultId: 'repo',
                enabled: true,
                priority: 5
              }
            ]
          }
        ],
        defaultVaultId: 'repo'
      }
    } as Partial<CompleteOptions>);

    await vi.waitFor(() => {
      const ruleInput = document.querySelector<HTMLInputElement>('.routing-rule-pattern');
      expect(ruleInput?.value).toBe('repo.example.com');
    });

    section.destroy();
  });

  it('adds a rule against the first vault when no default vault is available', () => {
    routingFixtures.state.defaultVaultId = '';
    const { section } = renderSection();
    const addButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes(en.runtime.addRuleButton)
    );
    expect(addButton).toBeTruthy();
    addButton?.dispatchEvent(new Event('click', { bubbles: true }));

    expect(routingFixtures.addRoutingRule).toHaveBeenCalledWith({ vaultId: 'default' });
    expect(routingFixtures.markPendingAutoSave).toHaveBeenCalledWith('routing');
    expect(routingFixtures.markPendingAutoSave).toHaveBeenCalledWith('vaultRouter');
    section.destroy();
  });
});
