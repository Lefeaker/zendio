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

describe('tongyi ai chat integration', () => {
  const tongyiUrl = 'https://tongyi.aliyun.com/chat/share/demo-session';
  let originalWindow: typeof window | undefined;
  let originalDocument: typeof document | undefined;
  let originalNode: typeof Node | undefined;
  let originalHTMLElement: typeof HTMLElement | undefined;
  let originalLocalStorage: Storage | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-04T05:06:07Z'));

    (globalThis as any).chrome = {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({
            options: {
              aiChat: { includeTimestamps: false, userName: 'Tester' },
              deepResearch: { pureMode: false }
            }
          })
        }
      }
    } as any;

    originalWindow = (globalThis as any).window;
    originalDocument = (globalThis as any).document;
    originalNode = (globalThis as any).Node;
    originalHTMLElement = (globalThis as any).HTMLElement;
    originalLocalStorage = (globalThis as any).localStorage;
  });

  afterEach(() => {
    vi.useRealTimers();
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as { chrome?: unknown }).chrome;
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
    if (originalDocument === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      (globalThis as any).document = originalDocument;
    }
    if (originalNode === undefined) {
      delete (globalThis as { Node?: unknown }).Node;
    } else {
      (globalThis as any).Node = originalNode;
    }
    if (originalHTMLElement === undefined) {
      delete (globalThis as { HTMLElement?: unknown }).HTMLElement;
    } else {
      (globalThis as any).HTMLElement = originalHTMLElement;
    }
    if (originalLocalStorage === undefined) {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    } else {
      (globalThis as any).localStorage = originalLocalStorage;
    }
  });

  it('parses Tongyi chat, removes UI chrome, and routes to the correct vault path', async () => {
    const html = readFileSync(join(process.cwd(), 'tests/fixtures/ai-chat/tongyi-code.html'), 'utf8');
    const dom = new JSDOM(html, { url: tongyiUrl });

    dom.window.localStorage.setItem('selectedQwenModel', 'qwen2-max');

    (globalThis as any).window = dom.window as any;
    (globalThis as any).document = dom.window.document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
    (globalThis as any).localStorage = dom.window.localStorage;

    const { extractAIChat } = await import('../../src/content/extractors/aiChatExtractor');
    const clip = await extractAIChat(dom.window.document, tongyiUrl);

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
          isDefault: true
        },
        {
          id: 'tongyi-ai',
          name: 'Tongyi Vault',
          httpsUrl: 'https://tongyi.local:27124/',
          httpUrl: 'http://tongyi.local:27123/',
          vault: 'TongyiAI',
          apiKey: 'tongyi-key'
        }
      ],
      rules: [
        {
          id: 'rule-tongyi',
          vaultId: 'tongyi-ai',
          type: 'domain',
          pattern: '*.tongyi.aliyun.com',
          enabled: true,
          priority: 90
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
      topics: []
    };
    const filePath = resolvePath(options.templates, clipPayload, classification, options.domainMappings);
    expect(filePath).toBe('AI/tongyi/2025/03/04/代码块测试.md');
  });
});
