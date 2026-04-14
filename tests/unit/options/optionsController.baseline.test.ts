/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { DEFAULT_OPTIONS } from '@shared/config';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import { createOptionsController } from '@options/app/optionsController';
import { createOptionsFormAdapter } from '@options/components/optionsFormAdapter';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import type { OptionsPersistenceService } from '@options/services/persistence';
import { createOptionsManagedFixtures, resetOptionsManagedFixtures } from '../../utils/optionsFixtures';

const fixturesRef: { current: ReturnType<typeof createOptionsManagedFixtures> | null } = { current: null };

vi.mock('@options/state/vaultRouterStore', () => ({
  getVaultRouterConfig: () => fixturesRef.current?.getVaultRouterConfig() ?? null
}));

function requireRegistry(registry: FormSectionRegistry | null): FormSectionRegistry {
  if (!registry) {
    throw new Error('FormSectionRegistry is not initialized');
  }
  return registry;
}

describe('OptionsController baseline integration', () => {
  let persistence: OptionsPersistenceService;
  let fixtures: ReturnType<typeof createOptionsManagedFixtures>;
  let persistenceMocks: {
    load: Mock<[], Promise<StoredOptions>>;
    save: Mock<[CompleteOptions | StoredOptions], Promise<void>>;
    getCached: Mock<[], StoredOptions | null>;
  };

  beforeEach(() => {
    if (!fixturesRef.current) {
      fixturesRef.current = createOptionsManagedFixtures();
    } else {
      resetOptionsManagedFixtures(fixturesRef.current);
    }
    fixtures = fixturesRef.current!;
    const registry = new FormSectionRegistry();
    fixtures.registry = registry;
    vi.spyOn(registry, 'collect').mockImplementation((snapshot) =>
      fixtures.collectManagedSectionChanges(snapshot)
    );
    vi.spyOn(registry, 'apply').mockImplementation((options) => {
      return Promise.resolve(fixtures.applyManagedSections(options));
    });

    persistenceMocks = {
      load: vi.fn<[], Promise<StoredOptions>>(() => Promise.resolve({} as StoredOptions)),
      save: vi.fn<[CompleteOptions | StoredOptions], Promise<void>>((options) => {
        fixtures.savedOptions.push(options);
        return Promise.resolve();
      }),
      getCached: vi.fn<[], StoredOptions | null>(() => null)
    };
    persistence = persistenceMocks;
  });

  afterEach(() => {
    fixtures.registry?.clear();
  });

  it('merges baseline defaults and managed data during saveSnapshot', async () => {
    fixtures.managedChanges = {
      rest: {
        baseUrl: 'https://managed.example.com/',
        httpsUrl: 'https://managed.example.com/',
        httpUrl: 'http://managed.example.com/',
        vault: 'ManagedVault',
        apiKey: 'managed-token'
      },
      yamlConfig: {
        contentTypes: {
          article: {
            customFields: [
              { name: 'managed_field', type: 'text', enabled: true, defaultValue: 'managed' }
            ]
          }
        }
      }
    };
    fixtures.vaultRouterSnapshot = {
      defaultVaultId: 'default',
      vaults: [{
        id: 'default',
        vault: 'Primary',
        name: 'Primary Vault',
        httpsUrl: 'https://managed.example.com/',
        httpUrl: 'http://managed.example.com/',
        apiKey: 'managed-token',
        enabled: true
      }]
    };

    const registry = requireRegistry(fixtures.registry);
    const formAdapter = createOptionsFormAdapter(registry);
    const controller = createOptionsController({ persistence, formAdapter, formRegistry: registry });

    await controller.loadInitialState();
    await controller.saveSnapshot({ reason: 'manual' });

    const collectManagedSectionChangesMock = vi.mocked(fixtures.collectManagedSectionChanges);
    const collectCalls = collectManagedSectionChangesMock.mock.calls;
    expect(collectCalls[0]?.[0]).toEqual(expect.objectContaining({}));
    expect(persistenceMocks.save.mock.calls.length).toBe(1);

    const saved = fixtures.savedOptions[0] as CompleteOptions;
    expect(saved.rest.baseUrl).toBe('https://managed.example.com/');
    expect(saved.rest.httpsUrl).toBe('https://managed.example.com/');
    expect(saved.rest.httpUrl).toBe('http://managed.example.com/');
    expect(saved.rest.vault).toBe('ManagedVault');
    expect(saved.domainMappings).toEqual(DEFAULT_OPTIONS.domainMappings);
    expect(saved.vaultRouter).toEqual(fixtures.vaultRouterSnapshot);
    expect((saved as StoredOptions).yamlConfig).toEqual(fixtures.managedChanges.yamlConfig);
  });

  it('preserves imported snapshot and reconstitutes defaults on subsequent save', async () => {
    const registry = requireRegistry(fixtures.registry);
    const formAdapter = createOptionsFormAdapter(registry);
    const controller = createOptionsController({ persistence, formAdapter, formRegistry: registry });
    await controller.loadInitialState();

    const importedOptions = {
      ...DEFAULT_OPTIONS,
      rest: {
        ...DEFAULT_OPTIONS.rest,
        baseUrl: 'https://imported.example.com/',
        vault: 'ImportedVault',
        apiKey: 'import-token'
      },
      templates: { ...DEFAULT_OPTIONS.templates },
      domainMappings: { ...DEFAULT_OPTIONS.domainMappings },
      aiChat: { ...DEFAULT_OPTIONS.aiChat },
      deepResearch: { ...DEFAULT_OPTIONS.deepResearch },
      fragmentClipper: { ...DEFAULT_OPTIONS.fragmentClipper },
      readingSession: { ...DEFAULT_OPTIONS.readingSession },
      video: { ...DEFAULT_OPTIONS.video },
      classifier: { ...DEFAULT_OPTIONS.classifier },
      vaultRouter: {
        defaultVaultId: 'imported',
        vaults: [
          {
            id: 'imported',
            vault: 'ImportedVault',
            name: 'Imported Vault',
            httpsUrl: 'https://imported.example.com/',
            httpUrl: 'http://imported.example.com/',
            apiKey: 'import-token',
            enabled: true
          }
        ]
      },
      yamlConfig: {
        contentTypes: {
          article: {
            customFields: [
              { name: 'imported_template', type: 'text', enabled: true, defaultValue: 'imported' }
            ]
          }
        }
      }
    } as unknown as CompleteOptions;

    await controller.applyImportedConfig(importedOptions);

    const applyManagedSectionsMock = vi.mocked(fixtures.applyManagedSections);

    expect(applyManagedSectionsMock.mock.calls[0]?.[0]).toEqual(importedOptions);
    expect(persistenceMocks.save.mock.calls.length).toBe(1);
    expect(fixtures.savedOptions[0]).toEqual(importedOptions);

    fixtures.managedChanges = {};
    fixtures.vaultRouterSnapshot = null;

    await controller.saveSnapshot({ reason: 'manual' });

    expect(persistenceMocks.save.mock.calls.length).toBe(2);
    const savedAfterImport = fixtures.savedOptions[1] as CompleteOptions;

    expect(savedAfterImport.rest.baseUrl).toBe('https://imported.example.com/');
    expect(savedAfterImport.rest.httpsUrl).toBe(DEFAULT_OPTIONS.rest.httpsUrl);
    expect(savedAfterImport.rest.httpUrl).toBe(DEFAULT_OPTIONS.rest.httpUrl);
    expect(savedAfterImport.domainMappings).toEqual(DEFAULT_OPTIONS.domainMappings);
    expect(savedAfterImport.vaultRouter).toEqual(importedOptions.vaultRouter);
    expect((savedAfterImport as StoredOptions).yamlConfig).toEqual(importedOptions.yamlConfig);
  });
});
