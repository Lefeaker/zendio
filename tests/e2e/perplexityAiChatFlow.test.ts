import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

import { mergeOptions } from '../../src/shared/config/optionsMerger';
import { selectVaultForClip } from '../../src/background/services/vaultRouterService';
import { resolvePath } from '../../src/background/pathResolver';
import { repositoryContainer } from '../../src/shared/di/serviceRegistry';
import { DI_TOKENS } from '../../src/shared/di/tokens';
import type { ClipPayload } from '../../src/shared/types';
import type { VaultRouterConfig } from '../../src/shared/types/vault';
import type { ClassificationResult } from '../../src/background/services/classificationService';
import {
  captureGlobalSnapshot,
  restoreGlobalSnapshot,
  installJsdom,
  assignGlobalValues,
  mockDate
} from '../utils/globalTestHelpers';
import {
  createChromeMock,
  type ChromeChangeListener,
  type ChromeStorageGet,
  type ChromeStorageSet
} from '../utils/chromeMocks';

describe('perplexity ai chat integration', () => {
  const perplexityUrl = 'https://www.perplexity.ai/search/ai-research-thread';
  let globalSnapshot: ReturnType<typeof captureGlobalSnapshot>;
  let restoreDate: (() => void) | null = null;

  beforeEach(() => {
    restoreDate = mockDate('2025-03-04T05:06:07Z');
    globalSnapshot = captureGlobalSnapshot();

    const storageGetMock = vi.fn<ChromeStorageGet>((_keys, callback) => {
      callback({
        options: {
          aiChat: { includeTimestamps: true, userName: 'Analyst' },
          deepResearch: { pureMode: false }
        }
      });
    });
    const storageSetMock = vi.fn<ChromeStorageSet>((_items, callback) => {
      callback?.();
    });
    const addListenerMock: (listener: ChromeChangeListener) => void = vi.fn();
    const removeListenerMock: (listener: ChromeChangeListener) => void = vi.fn();

    const chromeMock = createChromeMock({
      get: storageGetMock,
      set: storageSetMock,
      addListener: addListenerMock,
      removeListener: removeListenerMock
    });
    assignGlobalValues({ chrome: chromeMock });
  });

  afterEach(() => {
    restoreDate?.();
    restoreDate = null;
    restoreGlobalSnapshot(globalSnapshot);
  });

  it('parses Perplexity chat and routes output to a dedicated vault', async () => {
    const html = readFileSync(
      join(process.cwd(), 'tests/fixtures/ai-chat/perplexity.html'),
      'utf8'
    );
    const dom = new JSDOM(html, { url: perplexityUrl });

    installJsdom(dom);
    Object.assign(globalThis, {
      HTMLOListElement: dom.window.HTMLOListElement,
      HTMLUListElement: dom.window.HTMLUListElement,
      HTMLLIElement: dom.window.HTMLLIElement
    });

    const { createDefaultExtractorRegistry } = await import(
      '../../src/content/extractors/registry'
    );
    const optionsRepository = {
      get: vi.fn().mockResolvedValue({
        aiChat: { includeTimestamps: true, userName: 'Analyst' },
        deepResearch: { pureMode: false }
      }),
      set: vi.fn(),
      onChange: vi.fn(() => () => undefined)
    };
    repositoryContainer.reset();
    repositoryContainer.registerSingleton(
      DI_TOKENS.IOptionsRepository,
      () => optionsRepository as never
    );
    const registry = createDefaultExtractorRegistry({
      optionsRepository: optionsRepository as never
    });
    const clip = await registry.extract({ document: dom.window.document, url: perplexityUrl });

    expect(clip.type).toBe('ai_chat');
    expect(clip.title).toBe('AI Research Thread');
    expect(clip.meta.platform).toBe('perplexity');
    expect(clip.meta.model).toBe('Sonar Pro');
    expect(clip.markdown).toContain('Here is a concise overview.');
    expect(clip.markdown).toContain('OpenAI continues to lead frontier deployment.');

    const clipPayload: ClipPayload = {
      type: clip.type,
      markdown: clip.markdown,
      title: clip.title,
      meta: clip.meta
    };

    const vaultRouterConfig: VaultRouterConfig = {
      vaults: [
        {
          id: 'default',
          name: 'Default Vault',
          httpsUrl: 'https://default.local:27124/',
          httpUrl: 'http://default.local:27123/',
          vault: 'Default',
          apiKey: 'default-key',
          isDefault: true,
          rules: []
        },
        {
          id: 'perplexity-ai',
          name: 'Perplexity Vault',
          httpsUrl: 'https://perplexity.local:27124/',
          httpUrl: 'http://perplexity.local:27123/',
          vault: 'PerplexityAI',
          apiKey: 'perplexity-key',
          rules: [
            {
              id: 'rule-perplexity',
              vaultId: 'perplexity-ai',
              type: 'domain',
              pattern: 'perplexity.ai',
              enabled: true,
              priority: 80
            }
          ]
        }
      ],
      defaultVaultId: 'default'
    };

    const merged = mergeOptions({
      domainMappings: {
        'perplexity.ai': 'perplexity'
      },
      templates: {
        ai: 'AI/{platform}/{yyyy}/{mm}/{dd}/{title}.md'
      },
      vaultRouter: vaultRouterConfig
    });

    const options = {
      ...merged,
      vaultRouter: vaultRouterConfig
    };

    const selection = selectVaultForClip(options, clipPayload);
    expect(selection.vault?.id).toBe('perplexity-ai');

    const classification: ClassificationResult = {
      type: 'ai_chat',
      ai_platform: 'perplexity',
      topics: [],
      tags: [],
      status: 'success'
    };
    const filePath = resolvePath(
      options.templates,
      clipPayload,
      classification,
      options.domainMappings
    );
    expect(filePath).toBe('AI/perplexity/2025/03/04/AI Research Thread.md');
  });
});
