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

describe('deepseek ai chat integration', () => {
  const deepseekUrl = 'https://chat.deepseek.com/c/session-123';
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

  it('parses DeepSeek chat and builds markdown plus routing metadata', async () => {
    const html = readFileSync(
      join(process.cwd(), 'tests/fixtures/ai-chat/deepseek-code.html'),
      'utf8'
    );
    const dom = new JSDOM(html, { url: deepseekUrl });
    installJsdom(dom, { includeLocalStorage: false });

    const { createDefaultExtractorRegistry } = await import(
      '../../src/content/extractors/registry'
    );
    const registry = createDefaultExtractorRegistry();
    const clip = await registry.extract({ document: dom.window.document, url: deepseekUrl });

    expect(clip.type).toBe('ai_chat');
    expect(clip.meta.platform).toBe('deepseek');
    expect(clip.meta.model).toContain('DeepSeek');
    expect(clip.markdown).toContain('```python');
    expect(clip.markdown).toContain('def greet(name):');
    expect(clip.markdown).not.toMatch(/Copy/);

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
          id: 'deepseek-ai',
          name: 'DeepSeek Vault',
          httpsUrl: 'https://deepseek.local:27124/',
          httpUrl: 'http://deepseek.local:27123/',
          vault: 'DeepSeekAI',
          apiKey: 'deepseek-key',
          rules: [
            {
              id: 'rule-deepseek',
              vaultId: 'deepseek-ai',
              type: 'domain',
              pattern: '*.deepseek.com',
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
        'chat.deepseek.com': 'deepseek'
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
    expect(selection.vault?.id).toBe('deepseek-ai');
    expect(selection.context.type).toBe('ai_chat');
    expect(selection.context.domain).toBe('chat.deepseek.com');

    const classification: ClassificationResult = {
      type: 'ai_chat',
      ai_platform: 'deepseek',
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
    expect(filePath).toBe('AI/deepseek/2025/03/04/代码片段.md');
  });
});
