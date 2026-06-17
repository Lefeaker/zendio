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
  type ChromeStorageGet,
  type ChromeStorageSet,
  type ChromeChangeListener
} from '../utils/chromeMocks';
import { createE2eOptionsRepository } from '../utils/e2eOptionsRepository';

describe('kimi ai chat integration', () => {
  const kimiUrl = 'https://www.kimi.com/chat/awesome-session';
  let globalSnapshot: ReturnType<typeof captureGlobalSnapshot>;
  let restoreDate: (() => void) | null = null;

  beforeEach(() => {
    restoreDate = mockDate('2025-01-02T03:04:05Z');
    globalSnapshot = captureGlobalSnapshot();

    const storageGetMock = vi.fn<ChromeStorageGet>((_keys, callback) => {
      callback({
        options: {
          aiChat: { includeTimestamps: false, userName: 'Tester' },
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

  it('parses Kimi chat, sanitizes output, and routes to dedicated vault', async () => {
    const html = readFileSync(join(process.cwd(), 'tests/fixtures/ai-chat/kimi-new.html'), 'utf8');
    const dom = new JSDOM(html, { url: kimiUrl });
    installJsdom(dom, { includeLocalStorage: false });

    const { createDefaultExtractorRegistry } =
      await import('../../src/content/extractors/registry');
    const registry = createDefaultExtractorRegistry({
      optionsRepository: createE2eOptionsRepository({
        aiChat: { includeTimestamps: false, userName: 'Tester' },
        deepResearch: { pureMode: false }
      })
    });
    const clip = await registry.extract({ document: dom.window.document, url: kimiUrl });

    expect(clip.type).toBe('ai_chat');
    expect(clip.meta.platform).toBe('kimi');
    expect(clip.markdown).toContain(
      '| 表格 | Feature | OpenAI | Google DeepMind (Gemini) | Anthropic (Claude) |'
    );
    expect(clip.markdown).not.toMatch(/预览|复制|分享/);

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
          id: 'kimi-ai',
          name: 'Kimi Vault',
          httpsUrl: 'https://kimi.local:27124/',
          httpUrl: 'http://kimi.local:27123/',
          vault: 'KimiAI',
          apiKey: 'kimi-key',
          rules: [
            {
              id: 'rule-kimi',
              vaultId: 'kimi-ai',
              type: 'domain',
              pattern: '*.kimi.com',
              enabled: true,
              priority: 90
            }
          ]
        }
      ],
      defaultVaultId: 'default'
    };

    const merged = mergeOptions({
      domainMappings: {
        'www.kimi.com': 'kimi',
        'kimi.com': 'kimi'
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
    expect(selection.vault?.id).toBe('kimi-ai');
    expect(selection.context.type).toBe('ai_chat');
    expect(selection.context.domain).toBe('www.kimi.com');

    const classification: ClassificationResult = {
      type: 'ai_chat',
      ai_platform: 'kimi',
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
    expect(filePath).toBe('AI/kimi/2025/01/02/研究计划.md');
  });
});
