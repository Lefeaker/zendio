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

describe('doubao ai chat integration', () => {
  const doubaoUrl = 'https://www.doubao.com/chat/room-123';
  let globalSnapshot: ReturnType<typeof captureGlobalSnapshot>;
  let restoreDate: (() => void) | null = null;

  beforeEach(() => {
    restoreDate = mockDate('2025-03-04T05:06:07Z');
    globalSnapshot = captureGlobalSnapshot();

    const storageGetMock: ChromeStorageGet = vi.fn((_keys, callback) => {
      callback({
        options: {
          aiChat: { includeTimestamps: true, userName: 'Analyst' },
          deepResearch: { pureMode: false }
        }
      });
    });
    const storageSetMock: ChromeStorageSet = vi.fn((_items, callback) => {
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

  it('parses Doubao chat, extracts model, and resolves routing metadata', async () => {
    const html = readFileSync(
      join(process.cwd(), 'tests/fixtures/ai-chat/doubao-model.html'),
      'utf8'
    );
    const dom = new JSDOM(html, { url: doubaoUrl });
    installJsdom(dom, { includeLocalStorage: false });

    const { createDefaultExtractorRegistry } = await import(
      '../../src/content/extractors/registry'
    );
    const registry = createDefaultExtractorRegistry();
    const clip = await registry.extract({ document: dom.window.document, url: doubaoUrl });

    expect(clip.type).toBe('ai_chat');
    expect(clip.title).toBe('深度对话');
    expect(clip.meta.platform).toBe('doubao');
    expect(clip.meta.model).toBe('豆包旗舰版');
    expect(clip.markdown).toContain('# 1 E2E User');
    expect(clip.markdown).toContain('# 2 豆包旗舰版');
    expect(clip.markdown).toContain('版本比较');
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
          id: 'doubao-ai',
          name: 'Doubao Vault',
          httpsUrl: 'https://doubao.local:27124/',
          httpUrl: 'http://doubao.local:27123/',
          vault: 'DoubaoAI',
          apiKey: 'doubao-key',
          rules: [
            {
              id: 'rule-doubao',
              vaultId: 'doubao-ai',
              type: 'domain',
              pattern: '*.doubao.com',
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
        'www.doubao.com': 'doubao'
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
    expect(selection.vault?.id).toBe('doubao-ai');
    expect(selection.context.type).toBe('ai_chat');
    expect(selection.context.domain).toBe('www.doubao.com');

    const classification: ClassificationResult = {
      type: 'ai_chat',
      ai_platform: 'doubao',
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
    expect(filePath).toBe('AI/doubao/2025/03/04/深度对话.md');
  });
});
