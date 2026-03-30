import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '@shared/config';
import type { StoredOptions } from '@shared/types/options';
import { FormSectionRegistry } from '@options/components/formSections/formSectionManager';
import { createOptionsManagedFixtures, resetOptionsManagedFixtures } from '../../utils/optionsFixtures';

const fixturesRef: { current: ReturnType<typeof createOptionsManagedFixtures> | null } = { current: null };

vi.mock('@options/state/vaultRouterStore', () => ({
  getVaultRouterConfig: () => fixturesRef.current?.getVaultRouterConfig() ?? null
}));

import { createOptionsFormAdapter } from '@options/components/optionsFormAdapter';

describe('optionsFormAdapter.read', () => {
  let registry: FormSectionRegistry;
  let fixtures: ReturnType<typeof createOptionsManagedFixtures>;

  beforeEach(() => {
    if (!fixturesRef.current) {
      fixturesRef.current = createOptionsManagedFixtures();
    } else {
      resetOptionsManagedFixtures(fixturesRef.current);
    }
    fixtures = fixturesRef.current!;

    registry = new FormSectionRegistry();
    vi.spyOn(registry, 'collect').mockImplementation((snapshot) =>
      fixtures.collectManagedSectionChanges(snapshot)
    );
  });

  afterEach(() => {
    registry.clear();
  });

  it('returns baseline defaults when no snapshot provided', () => {
    const adapter = createOptionsFormAdapter(registry);
    const result = adapter.read(null);

    expect(result.rest).toEqual(DEFAULT_OPTIONS.rest);
    expect(result.templates).toEqual(DEFAULT_OPTIONS.templates);
    expect(result.domainMappings).toEqual(DEFAULT_OPTIONS.domainMappings);
    expect(result.aiChat).toEqual(DEFAULT_OPTIONS.aiChat);
    expect(result.deepResearch).toEqual(DEFAULT_OPTIONS.deepResearch);
    expect(result.video).toEqual(DEFAULT_OPTIONS.video);
    expect(result.fragmentClipper).toEqual(DEFAULT_OPTIONS.fragmentClipper);
    expect(result.readingSession).toEqual(DEFAULT_OPTIONS.readingSession);
    expect(result.classifier).toEqual(DEFAULT_OPTIONS.classifier);
  });

  it('merges previous snapshot data and preserves unknown keys', () => {
    const adapter = createOptionsFormAdapter(registry);
    const previous = {
      rest: {
        httpsUrl: 'https://custom.local/',
        httpUrl: 'http://custom.local/',
        vault: 'CustomVault',
        apiKey: 'TOKEN'
      },
      aiChat: { includeTimestamps: true, userName: 'Tester' },
      yamlConfig: { contentTypes: { article: { customFields: [] } } },
      legacyFeature: { enabled: true }
    } as StoredOptions & { legacyFeature: { enabled: boolean } };

    const result = adapter.read(previous);

    expect(result.rest.httpsUrl).toBe('https://custom.local/');
    expect(result.rest.httpUrl).toBe('http://custom.local/');
    expect(result.rest.vault).toBe('CustomVault');
    expect(result.rest.apiKey).toBe('TOKEN');
    expect(result.aiChat.includeTimestamps).toBe(true);
    expect((result as Record<string, unknown>).legacyFeature).toEqual({ enabled: true });
    expect((result as StoredOptions).yamlConfig).toEqual(previous.yamlConfig);
  });

  it('applies managed section overrides', () => {
    const adapter = createOptionsFormAdapter(registry);
    fixtures.managedChanges = {
      rest: {
        baseUrl: 'https://override.example.com/',
        httpsUrl: 'https://override.example.com/',
        httpUrl: undefined,
        vault: 'Override',
        apiKey: 'OVERRIDE'
      }
    };

    const result = adapter.read(null);

    expect(result.rest.vault).toBe('Override');
    expect(result.rest.apiKey).toBe('OVERRIDE');
  });

  it('includes vault router snapshot when available', () => {
    const adapter = createOptionsFormAdapter(registry);
    const snapshot = {
      defaultVaultId: 'default',
      vaults: [
        {
          id: 'default',
          vault: 'Main',
          name: 'Main Vault',
          httpsUrl: 'https://main.local/',
          httpUrl: 'http://main.local/',
          apiKey: 'MAIN',
          enabled: true
        }
      ]
    };
    fixtures.vaultRouterSnapshot = snapshot;

    const result = adapter.read(null);
    expect(result.vaultRouter).toEqual(snapshot);
  });
});
