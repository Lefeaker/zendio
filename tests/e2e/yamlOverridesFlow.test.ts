/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StorageAreaService } from '../../src/platform/interfaces/storage';
import type { PlatformServices } from '../../src/platform/types';
import type { DownloadsService } from '../../src/platform/interfaces/downloads';
import type { StoredOptions } from '../../src/shared/types/options';
import { registerService, resetGlobalRegistry, TOKENS } from '../../src/shared/di';
import { repositoryContainer } from '../../src/shared/di/serviceRegistry';
import { DI_TOKENS } from '../../src/shared/di/tokens';
import { ChromeOptionsRepository } from '../../src/infrastructure/repositories/ChromeOptionsRepository';
import {
  createBackgroundOptionsRepository,
  createOptionsMutationCoordinator
} from '../../src/background/services/optionsMutationCoordinator';
import type { OptionsStore } from '../../src/options/state/types';
import { createTestPlatformHarness } from '../utils/platformTestHarness';
import { generateYamlFrontMatter } from '../../src/shared/utils/yamlGenerator';

const mockDownloads: DownloadsService = {
  download() {
    return Promise.resolve(undefined);
  }
};

describe('YAML overrides integration flow', () => {
  let syncArea: StorageAreaService;
  let optionsStore: OptionsStore;
  let harness: ReturnType<typeof createTestPlatformHarness>;

  beforeEach(async () => {
    harness = createTestPlatformHarness();
    const storageService = harness.storage;
    syncArea = storageService.sync;

    const platformServices: PlatformServices = {
      ...harness,
      downloads: mockDownloads,
      fileSystemAccess: {
        isSupported: () => false,
        chooseDirectory: () =>
          Promise.reject(new Error('File System Access unavailable in tests.')),
        queryPermission: () => Promise.resolve('unsupported'),
        ensurePermission: () => Promise.resolve('unsupported'),
        writeFile: () => Promise.reject(new Error('File System Access unavailable in tests.')),
        removeDirectory: () => Promise.resolve(undefined)
      }
    };

    resetGlobalRegistry();
    registerService(TOKENS.platformServices, () => platformServices);
    repositoryContainer.reset();
    const rawOptionsRepository = new ChromeOptionsRepository(storageService);
    const optionsMutationCoordinator = createOptionsMutationCoordinator(rawOptionsRepository, {
      createOperationId: () => 'yaml-overrides-e2e',
      yieldAfterWrite: () => Promise.resolve()
    });
    const optionsRepository = createBackgroundOptionsRepository(
      rawOptionsRepository,
      optionsMutationCoordinator
    );
    repositoryContainer.registerSingleton(DI_TOKENS.IOptionsRepository, () => optionsRepository);
    optionsStore = (await import('../../src/options/state/optionsStore')).optionsStore;
    optionsStore.reset();
  });

  afterEach(() => {
    optionsStore.reset();
    repositoryContainer.reset();
    harness.reset();
    resetGlobalRegistry();
  });

  it('persists YAML overrides and applies them during export', async () => {
    const overrides: StoredOptions = {
      yamlConfig: {
        contentTypes: {
          article: {
            customFields: [
              { name: 'review_notes', type: 'text', enabled: true, valuePath: 'meta.reviewNotes' }
            ],
            domainOverrides: {
              '*.example.com': [
                { name: 'tags', type: 'array', enabled: true, defaultValue: ['custom-tag'] }
              ]
            }
          }
        }
      }
    };

    await optionsStore.save([{ path: ['yamlConfig'], value: overrides.yamlConfig ?? null }]);

    const persisted = await syncArea.get<StoredOptions>('options');
    expect(persisted?.yamlConfig?.contentTypes?.article?.customFields?.[0]?.isCustom).toBe(true);

    const frontMatter = generateYamlFrontMatter(
      'article',
      {
        type: 'article',
        title: 'Deep Dive',
        url: 'https://news.example.com/deep-dive',
        clipped_at: '2024-11-11T10:00:00Z',
        meta: {
          reviewNotes: 'Double-check statistics section'
        }
      },
      { domain: 'news.example.com' }
    );

    expect(frontMatter).toContain('review_notes: "Double-check statistics section"');
    expect(frontMatter).toContain('tags: ["custom-tag"]');
  });
});
