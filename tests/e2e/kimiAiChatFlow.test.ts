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

describe('kimi ai chat integration', () => {
  const kimiUrl = 'https://www.kimi.com/chat/awesome-session';
  let originalWindow: typeof window | undefined;
  let originalDocument: typeof document | undefined;
  let originalNode: typeof Node | undefined;
  let originalHTMLElement: typeof HTMLElement | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-02T03:04:05Z'));

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

  it('parses Kimi chat, sanitizes output, and routes to dedicated vault', async () => {
    const html = readFileSync(join(process.cwd(), 'tests/fixtures/ai-chat/kimi-new.html'), 'utf8');
    const dom = new JSDOM(html, { url: kimiUrl });
    (globalThis as any).window = dom.window as any;
    (globalThis as any).document = dom.window.document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;

    const { extractAIChat } = await import('../../src/content/extractors/aiChatExtractor');
    const clip = await extractAIChat(dom.window.document, kimiUrl);

    expect(clip.type).toBe('ai_chat');
    expect(clip.meta.platform).toBe('kimi');
    expect(clip.markdown).toContain('| 表格 | Feature | OpenAI | Google DeepMind (Gemini) | Anthropic (Claude) |');
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
          isDefault: true
        },
        {
          id: 'kimi-ai',
          name: 'Kimi Vault',
          httpsUrl: 'https://kimi.local:27124/',
          httpUrl: 'http://kimi.local:27123/',
          vault: 'KimiAI',
          apiKey: 'kimi-key'
        }
      ],
      rules: [
        {
          id: 'rule-kimi',
          vaultId: 'kimi-ai',
          type: 'domain',
          pattern: '*.kimi.com',
          enabled: true,
          priority: 90
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
      topics: []
    };
    const filePath = resolvePath(options.templates, clipPayload, classification, options.domainMappings);
    expect(filePath).toBe('AI/kimi/2025/01/02/研究计划.md');
  });
});
