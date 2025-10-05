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

describe('deepseek ai chat integration', () => {
  const deepseekUrl = 'https://chat.deepseek.com/c/session-123';
  let originalWindow: typeof window | undefined;
  let originalDocument: typeof document | undefined;
  let originalNode: typeof Node | undefined;
  let originalHTMLElement: typeof HTMLElement | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-04T05:06:07Z'));

    (globalThis as any).chrome = {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({
            options: {
              aiChat: { includeTimestamps: true, userName: 'Analyst' },
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
  });

  it('parses DeepSeek chat and builds markdown plus routing metadata', async () => {
    const html = readFileSync(join(process.cwd(), 'tests/fixtures/ai-chat/deepseek-code.html'), 'utf8');
    const dom = new JSDOM(html, { url: deepseekUrl });

    (globalThis as any).window = dom.window as any;
    (globalThis as any).document = dom.window.document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;

    const { extractAIChat } = await import('../../src/content/extractors/aiChatExtractor');
    const clip = await extractAIChat(dom.window.document, deepseekUrl);

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
          isDefault: true
        },
        {
          id: 'deepseek-ai',
          name: 'DeepSeek Vault',
          httpsUrl: 'https://deepseek.local:27124/',
          httpUrl: 'http://deepseek.local:27123/',
          vault: 'DeepSeekAI',
          apiKey: 'deepseek-key'
        }
      ],
      rules: [
        {
          id: 'rule-deepseek',
          vaultId: 'deepseek-ai',
          type: 'domain',
          pattern: '*.deepseek.com',
          enabled: true,
          priority: 90
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
      topics: []
    };
    const filePath = resolvePath(options.templates, clipPayload, classification, options.domainMappings);
    expect(filePath).toBe('AI/deepseek/2025/03/04/代码片段.md');
  });
});
