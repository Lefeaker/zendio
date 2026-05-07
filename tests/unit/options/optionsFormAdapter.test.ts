import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '@shared/config';
import type { StoredOptions } from '@shared/types/options';
import {
  createOptionsManagedFixtures,
  resetOptionsManagedFixtures
} from '../../utils/optionsFixtures';

const fixturesRef: { current: ReturnType<typeof createOptionsManagedFixtures> | null } = {
  current: null
};

vi.mock('@options/state/vaultRouterStore', () => ({
  getVaultRouterConfig: () => fixturesRef.current?.getVaultRouterConfig() ?? null
}));

import { createOptionsFormAdapter } from '@options/components/optionsFormAdapter';

describe('optionsFormAdapter.read', () => {
  let fixtures: ReturnType<typeof createOptionsManagedFixtures>;

  beforeEach(() => {
    if (!fixturesRef.current) {
      fixturesRef.current = createOptionsManagedFixtures();
    } else {
      resetOptionsManagedFixtures(fixturesRef.current);
    }
    fixtures = fixturesRef.current!;
  });

  afterEach(() => {
    resetOptionsManagedFixtures(fixtures);
  });

  it('returns baseline defaults when no snapshot provided', () => {
    const adapter = createOptionsFormAdapter();
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
    expect(result.experimentalAi).toEqual(DEFAULT_OPTIONS.experimentalAi);
    expect(result.pageSummary).toEqual(DEFAULT_OPTIONS.pageSummary);
    expect(result.readingOverlaySummary).toEqual(DEFAULT_OPTIONS.readingOverlaySummary);
    expect(result.subtitleTranslation).toEqual(DEFAULT_OPTIONS.subtitleTranslation);
  });

  it('merges previous snapshot data and preserves unknown keys', () => {
    const adapter = createOptionsFormAdapter();
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

  it('merges experimental snapshot values with defaults', () => {
    const adapter = createOptionsFormAdapter();
    const previous: StoredOptions = {
      experimentalAi: {
        provider: 'openai',
        model: 'gpt-4o-mini'
      },
      pageSummary: {
        enabled: true
      },
      readingOverlaySummary: {
        enabled: true
      },
      subtitleTranslation: {
        enabled: true
      }
    };

    const result = adapter.read(previous);

    expect(result.experimentalAi).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiUrl: DEFAULT_OPTIONS.experimentalAi?.apiUrl ?? '',
      apiKey: DEFAULT_OPTIONS.experimentalAi?.apiKey ?? ''
    });
    expect(result.pageSummary).toEqual({ enabled: true });
    expect(result.readingOverlaySummary).toEqual({ enabled: true });
    expect(result.subtitleTranslation).toEqual({
      enabled: true,
      targetLanguage: DEFAULT_OPTIONS.subtitleTranslation?.targetLanguage ?? 'zh-CN'
    });
  });

  it('includes vault router snapshot when available', () => {
    const adapter = createOptionsFormAdapter();
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
