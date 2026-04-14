/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import type { StoredOptions } from '../../src/shared/types/options';
import type { VaultConfig, RoutingRule } from '../../src/shared/types/vault';
import { createOptionsController } from '../../src/options/app/optionsController';
import { createOptionsFormAdapter } from '../../src/options/components/optionsFormAdapter';
import {
  registerOptionsController,
  consumePendingAutoSaveSource,
  resetOptionsController
} from '../../src/options/app/optionsControllerContext';
import { RoutingSection } from '../../src/options/components/sections/RoutingSection';
import { FormSectionRegistry } from '../../src/options/components/formSections/formSectionManager';
import { createOptionsStateManager } from '../../src/options/state/StateManager';
import type { IOptionsRepository } from '../../src/shared/repositories';

interface TestVaultState {
  vaults: VaultConfig[];
  defaultVaultId: string;
}

const storeMocks = vi.hoisted(() => {
  const state: TestVaultState = {
    defaultVaultId: 'vault-default',
    vaults: []
  };

  const listeners = new Set<(next: TestVaultState) => void>();
  let ruleCounter = 1;

  const reset = (): void => {
    state.defaultVaultId = 'vault-default';
    state.vaults = [
      {
        id: 'vault-default',
        name: 'Default Vault',
        vault: 'DefaultVault',
        httpsUrl: 'https://127.0.0.1:27124/',
        httpUrl: 'http://127.0.0.1:27123/',
        apiKey: '',
        enabled: true,
        isDefault: true,
        rules: []
      }
    ];
    ruleCounter = 1;
  };

  const cloneState = (): TestVaultState => ({
    defaultVaultId: state.defaultVaultId,
    vaults: state.vaults.map((vault) => ({
      ...vault,
      rules: (vault.rules ?? []).map((rule) => ({ ...rule }))
    }))
  });

  const notify = (): void => {
    const snapshot = cloneState();
    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  reset();

  return {
    reset,
    getState: () => state,
    listeners,
    cloneState,
    notify,
    generateRuleId: () => `rule-${ruleCounter++}`
  };
});

vi.mock('../../src/options/state/vaultRouterStore', () => ({
  subscribeVaultRouter: (listener: (next: TestVaultState) => void) => {
    storeMocks.listeners.add(listener);
    listener(storeMocks.cloneState());
    return () => {
      storeMocks.listeners.delete(listener);
    };
  },
  getVaultRouterConfig: () => storeMocks.cloneState(),
  initializeVaultRouterStore: (config?: TestVaultState | null) => {
    const target = storeMocks.getState();
    if (!config || !config.vaults?.length) {
      storeMocks.reset();
      storeMocks.notify();
      return;
    }
    target.vaults = config.vaults.map((vault) => ({
      ...vault,
      rules: (vault.rules ?? []).map((rule) => ({
        ...rule,
        vaultId: rule.vaultId ?? vault.id
      }))
    }));
    target.defaultVaultId =
      config.defaultVaultId ??
      target.vaults.find((vault) => vault.isDefault)?.id ??
      target.vaults[0]?.id ??
      'vault-default';
    storeMocks.notify();
  },
  addRoutingRule: (initial?: Partial<RoutingRule>) => {
    const id = storeMocks.generateRuleId();
    const rule: RoutingRule = {
      id,
      type: initial?.type ?? 'domain',
      pattern: initial?.pattern ?? '',
      enabled: initial?.enabled ?? true,
      priority: initial?.priority ?? 10,
      vaultId: initial?.vaultId ?? storeMocks.getState().defaultVaultId
    };
    const targetVault =
      storeMocks
        .getState()
        .vaults.find(
          (vault) => vault.id === (initial?.vaultId ?? storeMocks.getState().defaultVaultId)
        ) ?? storeMocks.getState().vaults[0];
    if (!targetVault.rules) {
      targetVault.rules = [];
    }
    targetVault.rules.push(rule);
    storeMocks.notify();
    return { ...rule };
  },
  updateRoutingRule: (id: string, updates: Partial<RoutingRule>) => {
    for (const vault of storeMocks.getState().vaults) {
      const rule = vault.rules?.find((item) => item.id === id);
      if (rule) {
        Object.assign(rule, updates);
        if (updates.vaultId && updates.vaultId !== vault.id) {
          vault.rules = (vault.rules ?? []).filter((item) => item.id !== id);
          const target =
            storeMocks.getState().vaults.find((candidate) => candidate.id === updates.vaultId) ??
            storeMocks.getState().vaults[0];
          if (!target.rules) {
            target.rules = [];
          }
          target.rules.push({ ...rule, vaultId: updates.vaultId });
        }
        break;
      }
    }
    storeMocks.notify();
  },
  removeRoutingRule: (id: string) => {
    for (const vault of storeMocks.getState().vaults) {
      vault.rules = (vault.rules ?? []).filter((rule) => rule.id !== id);
    }
    storeMocks.notify();
  },
  addAdditionalVault: vi.fn(),
  updateAdditionalVault: vi.fn(),
  removeAdditionalVault: vi.fn()
}));

describe('options vault router auto-save e2e', () => {
  let dom: JSDOM;
  const overriddenGlobals: Array<{ key: string; descriptor: PropertyDescriptor | undefined }> = [];
  let formRegistry: FormSectionRegistry;

  function overrideGlobal(key: string, value: unknown): void {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    overriddenGlobals.push({ key, descriptor });
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value
    });
  }

  beforeEach(() => {
    storeMocks.reset();
    vi.useFakeTimers();
    dom = new JSDOM(
      `
        <!DOCTYPE html>
        <html lang="en">
          <body>
            <main>
              <span id="msg" class="aobx-status-message"></span>
              <section id="routing-section"></section>
            </main>
          </body>
        </html>
      `,
      { url: 'https://options.test/' }
    );

    overrideGlobal('window', dom.window);
    overrideGlobal('document', dom.window.document);
    overrideGlobal('navigator', dom.window.navigator);
    overrideGlobal('HTMLElement', dom.window.HTMLElement);
    overrideGlobal('HTMLInputElement', dom.window.HTMLInputElement);
    overrideGlobal('HTMLSelectElement', dom.window.HTMLSelectElement);
    overrideGlobal('HTMLButtonElement', dom.window.HTMLButtonElement);
    overrideGlobal('Node', dom.window.Node);

    formRegistry = new FormSectionRegistry();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    resetOptionsController();
    dom.window.close();
    formRegistry.clear();

    while (overriddenGlobals.length > 0) {
      const entry = overriddenGlobals.pop();
      if (!entry) {
        continue;
      }
      const { key, descriptor } = entry;
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (globalThis as Record<string, unknown>)[key];
      }
    }
  });

  it('auto-saves vault router rule updates triggered via helper controls', async () => {
    const savedOptions: StoredOptions[] = [];
    const persistence = {
      load: vi.fn(() =>
        Promise.resolve({
          vaultRouter: storeMocks.cloneState()
        } as StoredOptions)
      ),
      save: vi.fn((options: StoredOptions) => {
        savedOptions.push(options);
        return Promise.resolve();
      }),
      getCached: vi.fn(() => null)
    };

    const formAdapter = createOptionsFormAdapter(formRegistry);
    const consumedSources: string[] = [];

    const controller = createOptionsController({
      persistence,
      formAdapter,
      formRegistry,
      autoSaveDebounceMs: 25,
      onSaveSuccess: (reason) => {
        if (reason !== 'auto') {
          return;
        }
        const source = consumePendingAutoSaveSource();
        if (source) {
          consumedSources.push(source);
        }
      }
    });

    registerOptionsController(controller);

    const initial = await controller.loadInitialState();
    const container = document.getElementById('routing-section');
    if (!container) {
      throw new Error('routing section container missing');
    }

    const optionsRepo: IOptionsRepository = {
      async get() {
        return (await persistence.load()) as never;
      },
      async set() {},
      onChange() {
        return () => undefined;
      }
    };

    const section = new RoutingSection(container, optionsRepo);
    const stateManager = createOptionsStateManager();
    section.render({ stateManager, formRegistry });

    await controller.applyToForm(initial);

    const addRuleButton = container.querySelector<HTMLButtonElement>('button');
    expect(addRuleButton).not.toBeNull();
    if (!addRuleButton) {
      throw new Error('Add rule button not found');
    }
    addRuleButton.click();

    await Promise.resolve();

    const patternInput = container.querySelector<HTMLInputElement>('.routing-rule-pattern');
    expect(patternInput).not.toBeNull();
    if (!patternInput) {
      throw new Error('Pattern input not found');
    }
    patternInput.value = 'docs.example.com';
    patternInput.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(30);
    await Promise.resolve();

    expect(savedOptions.length).toBeGreaterThan(0);
    const lastSaved = savedOptions.at(-1);
    expect(lastSaved?.vaultRouter?.vaults?.[0]?.rules?.[0]?.pattern).toBe('docs.example.com');
    expect(consumedSources).toContain('vaultRouter');

    section.destroy();
    controller.dispose();
  });
});
