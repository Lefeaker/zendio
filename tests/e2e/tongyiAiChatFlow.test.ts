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
  assignGlobalValues
} from '../utils/globalTestHelpers';
import {
  createChromeMock,
  type ChromeChangeListener,
  type ChromeStorageGet,
  type ChromeStorageSet
} from '../utils/chromeMocks';
import { createE2eOptionsRepository } from '../utils/e2eOptionsRepository';

describe('tongyi ai chat integration', () => {
  const tongyiUrl = 'https://tongyi.aliyun.com/chat/share/demo-session';
  let globalSnapshot: ReturnType<typeof captureGlobalSnapshot>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-04T05:06:07Z'));
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
    vi.useRealTimers();
    restoreGlobalSnapshot(globalSnapshot);
  });

  it('parses Tongyi chat, removes UI chrome, and routes to the correct vault path', async () => {
    const html = readFileSync(
      join(process.cwd(), 'tests/fixtures/ai-chat/tongyi-code.html'),
      'utf8'
    );
    const dom = new JSDOM(html, { url: tongyiUrl });

    dom.window.localStorage.setItem('selectedQwenModel', 'qwen2-max');

    installJsdom(dom);

    const { createDefaultExtractorRegistry } =
      await import('../../src/content/extractors/registry');
    const registry = createDefaultExtractorRegistry({
      optionsRepository: createE2eOptionsRepository({
        aiChat: { includeTimestamps: false, userName: 'Tester' },
        deepResearch: { pureMode: false }
      })
    });
    const clip = await registry.extract({ document: dom.window.document, url: tongyiUrl });

    expect(clip.type).toBe('ai_chat');
    expect(clip.meta.platform).toBe('tongyi');
    expect(clip.meta.model).toBe('Qwen2-Max');
    expect(clip.markdown).toContain('```TypeScript');
    expect(clip.markdown).toContain('interface AIModel');
    expect(clip.markdown).toContain('```python');
    expect(clip.markdown).not.toMatch(/^\s*1\s/m);
    expect(clip.markdown).not.toContain('预览');
    expect(clip.markdown).not.toContain('hover:text');

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
          id: 'tongyi-ai',
          name: 'Tongyi Vault',
          httpsUrl: 'https://tongyi.local:27124/',
          httpUrl: 'http://tongyi.local:27123/',
          vault: 'TongyiAI',
          apiKey: 'tongyi-key',
          rules: [
            {
              id: 'rule-tongyi',
              vaultId: 'tongyi-ai',
              type: 'domain',
              pattern: 'tongyi.aliyun.com',
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
        'tongyi.aliyun.com': 'tongyi',
        'www.tongyi.aliyun.com': 'tongyi'
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
    expect(selection.vault?.id).toBe('tongyi-ai');
    expect(selection.context.type).toBe('ai_chat');
    expect(selection.context.domain).toBe('tongyi.aliyun.com');

    const classification: ClassificationResult = {
      type: 'ai_chat',
      ai_platform: 'tongyi',
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
    expect(filePath).toBe('AI/tongyi/2025/03/04/代码块测试.md');
  });
});
