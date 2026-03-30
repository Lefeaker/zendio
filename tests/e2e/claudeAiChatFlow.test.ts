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

describe('claude ai chat integration', () => {
  const claudeUrl = 'https://claude.ai/chat/session-42';
  let globalSnapshot: ReturnType<typeof captureGlobalSnapshot>;
  let restoreDate: (() => void) | null = null;

  beforeEach(() => {
    restoreDate = mockDate('2025-03-05T06:07:08Z');
    globalSnapshot = captureGlobalSnapshot();

    const storageGetMock: ChromeStorageGet = vi.fn((_keys, callback) => {
      callback({
        options: {
          aiChat: { includeTimestamps: false, userName: 'Reviewer' },
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

  it('parses Claude chat, keeps language fences, and routes correctly', async () => {
    const html = readFileSync(join(process.cwd(), 'tests/fixtures/ai-chat/claude-code.html'), 'utf8');
    const dom = new JSDOM(html, { url: claudeUrl });
    installJsdom(dom, { includeLocalStorage: false });

    const { createDefaultExtractorRegistry } = await import('../../src/content/extractors/registry');
    const registry = createDefaultExtractorRegistry();
    const clip = await registry.extract({ document: dom.window.document, url: claudeUrl });

    expect(clip.type).toBe('ai_chat');
    expect(clip.meta.platform).toBe('claude');
    expect(clip.meta.model).toContain('Claude Opus 3.5');
    expect(clip.markdown).toContain('```typescript');
    expect(clip.markdown).toContain('interface Task');
    expect(clip.markdown).toContain('```bash');
    expect(clip.markdown).not.toMatch(/Copy code/);

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
          id: 'claude-ai',
          name: 'Claude Vault',
          httpsUrl: 'https://claude.local:27124/',
          httpUrl: 'http://claude.local:27123/',
          vault: 'ClaudeAI',
          apiKey: 'claude-key',
          rules: [
            {
              id: 'rule-claude',
              vaultId: 'claude-ai',
              type: 'domain',
              pattern: 'claude.ai',
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
        'claude.ai': 'claude'
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
    expect(selection.vault?.id).toBe('claude-ai');
    expect(selection.context.type).toBe('ai_chat');
    expect(selection.context.domain).toBe('claude.ai');

    const classification: ClassificationResult = {
      type: 'ai_chat',
      ai_platform: 'claude',
      topics: [],
      tags: [],
      status: 'success'
    };
    const filePath = resolvePath(options.templates, clipPayload, classification, options.domainMappings);
    expect(filePath).toBe('AI/claude/2025/03/05/代码演示.md');
  });
});
