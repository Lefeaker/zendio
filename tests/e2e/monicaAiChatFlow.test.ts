import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

import { mergeOptions } from '../../src/shared/config/optionsMerger';
import { selectVaultForClip } from '../../src/background/services/vaultRouterService';
import { resolvePath } from '../../src/background/pathResolver';
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
import { createE2eOptionsRepository } from '../utils/e2eOptionsRepository';

describe('monica ai chat integration', () => {
  const monicaUrl = 'https://monica.im/chat/flow-456';
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

  it('parses Monica chat, captures model metadata, and routes clip', async () => {
    const html = readFileSync(join(process.cwd(), 'tests/fixtures/ai-chat/monica.html'), 'utf8');
    const dom = new JSDOM(html, { url: monicaUrl });

    installJsdom(dom);

    const { createDefaultExtractorRegistry } =
      await import('../../src/content/extractors/registry');
    const registry = createDefaultExtractorRegistry({
      optionsRepository: createE2eOptionsRepository({
        aiChat: { includeTimestamps: true, userName: 'E2E User' },
        deepResearch: { pureMode: false }
      })
    });
    const clip = await registry.extract({ document: dom.window.document, url: monicaUrl });

    expect(clip.type).toBe('ai_chat');
    expect(clip.title).toBe('AI 对话摘要');
    expect(clip.meta.platform).toBe('monica');
    expect(clip.meta.model).toBe('GPT-4o');
    expect(clip.markdown).toContain('# 1 E2E User');
    expect(clip.markdown).toContain('# 2 GPT-4o');
    expect(clip.markdown).toContain('OpenAI');
    expect(clip.markdown).not.toMatch(/复制/);

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
          id: 'monica-ai',
          name: 'Monica Vault',
          httpsUrl: 'https://monica.local:27124/',
          httpUrl: 'http://monica.local:27123/',
          vault: 'MonicaAI',
          apiKey: 'monica-key',
          rules: [
            {
              id: 'rule-monica',
              vaultId: 'monica-ai',
              type: 'domain',
              pattern: 'monica.im',
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
        'monica.im': 'monica'
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
    expect(selection.vault?.id).toBe('monica-ai');
    expect(selection.context.type).toBe('ai_chat');
    expect(selection.context.domain).toBe('monica.im');

    const classification: ClassificationResult = {
      type: 'ai_chat',
      ai_platform: 'monica',
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
    expect(filePath).toBe('AI/monica/2025/03/04/AI 对话摘要.md');
  });
});
