/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { StoredOptions } from '@shared/types/options';
import type { IOptionsRepository } from '@shared/repositories';
import type { OptionsPersistenceService } from '@options/services/persistence';
import type { OptionsFormAdapter } from '@options/components/optionsFormAdapter';
import type { TemplatesSection } from '@options/components/sections/TemplatesSection';
import { configureGlobalStateManagerStorage, resetGlobalState } from '@shared/state';
import { testPlatformHarness } from '../../setup/globalSetup';

const setupFixtures = vi.hoisted(() => {
  const markPendingAutoSave = vi.fn();
  const savedOptions: StoredOptions[] = [];
  const optionsRepository: IOptionsRepository = {
    async get() {
      return {
        templates: {
          article: 'Articles/{slug}.md',
          fragment: 'Fragments/{slug}.md',
          reading: 'Reading/{slug}.md',
          ai: 'AI/{slug}.md'
        }
      } as never;
    },
    async set() {},
    onChange() {
      return () => undefined;
    }
  };

  const persistence: OptionsPersistenceService = {
    load: vi.fn(() =>
      Promise.resolve({
        templates: {
          article: 'Articles/{slug}.md',
          fragment: 'Fragments/{slug}.md',
          reading: 'Reading/{slug}.md',
          ai: 'AI/{slug}.md'
        }
      } as StoredOptions)
    ),
    save: vi.fn((options) => {
      savedOptions.push(options as StoredOptions);
      return Promise.resolve();
    }),
    getCached: vi.fn(() => undefined)
  };

  return { markPendingAutoSave, savedOptions, persistence, optionsRepository };
});

const controllerSlot: { current: unknown } = { current: null };

vi.mock('@options/app/optionsControllerContext', () => ({
  getOptionsController: () => controllerSlot.current,
  registerOptionsController: (controller: unknown) => {
    controllerSlot.current = controller;
  },
  consumePendingAutoSaveSource: vi.fn(() => null),
  markPendingAutoSave: (...args: unknown[]) => {
    setupFixtures.markPendingAutoSave(...(args as [string]));
  }
}));

vi.mock('@options/components/controls/connectionTest', () => ({
  createConnectionTester: vi.fn(() => ({ trigger: vi.fn(), dispose: vi.fn() }))
}));

vi.mock('@options/components/controls/readingTemplateControls', async () => {
  const actual = await vi.importActual<
    typeof import('@options/components/controls/readingTemplateControls')
  >('@options/components/controls/readingTemplateControls');
  return actual;
});

vi.mock('@options/components/controls/domainMappings', async () => {
  const actual = await vi.importActual<
    typeof import('@options/components/controls/domainMappings')
  >('@options/components/controls/domainMappings');
  return actual;
});

vi.mock('@options/state/vaultRouterStore', async () => {
  const actual = await vi.importActual<typeof import('@options/state/vaultRouterStore')>(
    '@options/state/vaultRouterStore'
  );
  return actual;
});

describe('OptionsController integration', () => {
  let formRegistry: import('@options/components/formSections/formSectionManager').FormSectionRegistry;
  let stateManager: import('@options/state/StateManager').OptionsStateManager;
  let createOptionsFormAdapter: typeof import('@options/components/optionsFormAdapter').createOptionsFormAdapter;
  let createOptionsController: typeof import('@options/app/optionsController').createOptionsController;
  let FormSectionRegistry: typeof import('@options/components/formSections/formSectionManager').FormSectionRegistry;
  let TemplatesSectionCtor: typeof import('@options/components/sections/TemplatesSection').TemplatesSection;
  let RoutingSectionCtor: typeof import('@options/components/sections/RoutingSection').RoutingSection;
  let registerOptionsController: typeof import('@options/app/optionsControllerContext').registerOptionsController;
  let DEFAULT_OPTIONS: typeof import('@shared/config').DEFAULT_OPTIONS;
  let createOptionsStateManager: typeof import('@options/state/StateManager').createOptionsStateManager;

  beforeEach(async () => {
    setupFixtures.savedOptions.length = 0;
    setupFixtures.markPendingAutoSave.mockClear();
    controllerSlot.current = null;
    document.body.innerHTML = `
      <section id="templates-section"></section>
      <section id="routing-section"></section>
    `;

    testPlatformHarness.configure();
    configureGlobalStateManagerStorage(testPlatformHarness.storage);
    resetGlobalState();

    ({ createOptionsFormAdapter } = await import('@options/components/optionsFormAdapter'));
    ({ createOptionsController } = await import('@options/app/optionsController'));
    ({ FormSectionRegistry } = await import('@options/components/formSections/formSectionManager'));
    ({ TemplatesSection: TemplatesSectionCtor } = await import(
      '@options/components/sections/TemplatesSection'
    ));
    ({ RoutingSection: RoutingSectionCtor } = await import(
      '@options/components/sections/RoutingSection'
    ));
    ({ registerOptionsController } = await import('@options/app/optionsControllerContext'));
    ({ DEFAULT_OPTIONS } = await import('@shared/config'));
    ({ createOptionsStateManager } = await import('@options/state/StateManager'));

    formRegistry = new FormSectionRegistry();
    stateManager = createOptionsStateManager();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    formRegistry.clear();
    resetGlobalState();
    testPlatformHarness.reset();
  });

  const renderTemplatesSection = (): TemplatesSection => {
    const container = document.getElementById('templates-section');
    if (!container) {
      throw new Error('templates container missing');
    }
    const section = new TemplatesSectionCtor(container, setupFixtures.optionsRepository);
    section.render({ stateManager, formRegistry });
    return section as unknown as TemplatesSection;
  };

  const renderRoutingSection = (): void => {
    const container = document.getElementById('routing-section');
    if (!container) {
      throw new Error('routing container missing');
    }
    const section = new RoutingSectionCtor(container, setupFixtures.optionsRepository);
    section.render({ stateManager, formRegistry });
  };

  it('propagates reading template changes through auto-save flow', async () => {
    vi.useFakeTimers();

    const { persistence, savedOptions, markPendingAutoSave } = setupFixtures;
    const formAdapter: OptionsFormAdapter = createOptionsFormAdapter(formRegistry);

    const controller = createOptionsController({
      persistence,
      formAdapter,
      formRegistry,
      autoSaveDebounceMs: 50
    });
    registerOptionsController(controller);
    const scheduleSpy = vi.spyOn(controller, 'scheduleAutoSave');

    const initial = await controller.loadInitialState();
    await controller.applyToForm(initial);

    const templatesSection = renderTemplatesSection();
    renderRoutingSection();

    await formRegistry.apply(initial);

    const select = document.querySelector<HTMLSelectElement>('#templates-section select');
    expect(select).toBeTruthy();
    if (!select) {
      throw new Error('reading mode select missing');
    }

    select.value = 'article';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(markPendingAutoSave).toHaveBeenCalledWith('templates');
    expect(scheduleSpy).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60);

    expect(savedOptions.length).toBeGreaterThan(0);

    const lastSaved = savedOptions.at(-1);
    expect(lastSaved?.templates?.reading).toBe('Articles/{slug}.md');
    expect(lastSaved?.rest).toEqual(DEFAULT_OPTIONS.rest);
    expect(lastSaved?.domainMappings).toEqual(DEFAULT_OPTIONS.domainMappings);

    templatesSection.destroy();
    controller.dispose();
  });
});
