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

describe('claude ai chat integration', () => {
  const claudeUrl = 'https://claude.ai/chat/session-42';
  let originalWindow: typeof window | undefined;
  let originalDocument: typeof document | undefined;
  let originalNode: typeof Node | undefined;
  let originalHTMLElement: typeof HTMLElement | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-05T06:07:08Z'));

    (globalThis as any).chrome = {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({
            options: {
              aiChat: { includeTimestamps: false, userName: 'Reviewer' },
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

  it('parses Claude chat, keeps language fences, and routes correctly', async () => {
    const html = readFileSync(join(process.cwd(), 'tests/fixtures/ai-chat/claude-code.html'), 'utf8');
    const dom = new JSDOM(html, { url: claudeUrl });

    (globalThis as any).window = dom.window as any;
    (globalThis as any).document = dom.window.document;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;

    const { extractAIChat } = await import('../../src/content/extractors/aiChatExtractor');
    const clip = await extractAIChat(dom.window.document, claudeUrl);

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
          isDefault: true
        },
        {
          id: 'claude-ai',
          name: 'Claude Vault',
          httpsUrl: 'https://claude.local:27124/',
          httpUrl: 'http://claude.local:27123/',
          vault: 'ClaudeAI',
          apiKey: 'claude-key'
        }
      ],
      rules: [
        {
          id: 'rule-claude',
          vaultId: 'claude-ai',
          type: 'domain',
          pattern: '*.claude.ai',
          enabled: true,
          priority: 90
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
      topics: []
    };
    const filePath = resolvePath(options.templates, clipPayload, classification, options.domainMappings);
    expect(filePath).toBe('AI/claude/2025/03/05/代码演示.md');
  });
});
