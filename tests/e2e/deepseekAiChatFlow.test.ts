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

    const { createDefaultExtractorRegistry } =
      await import('../../src/content/extractors/registry');
    const registry = createDefaultExtractorRegistry({
      optionsRepository: createE2eOptionsRepository({
        aiChat: { includeTimestamps: true, userName: 'Analyst' },
        deepResearch: { pureMode: false }
      })
    });
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

  it('hydrates DeepSeek virtualized messages before parsing from a bottom scroll position', async () => {
    const dom = new JSDOM(
      `<!doctype html>
      <html lang="en">
        <head>
          <title>Comparison of Three Leading AI Companies - DeepSeek</title>
        </head>
        <body>
          <main>
            <div class="ds-virtual-list ds-virtual-list--printable ds-scroll-area ds-scroll-area--enabled">
              <div class="ds-virtual-list-visible-items"></div>
            </div>
          </main>
        </body>
      </html>`,
      { url: deepseekUrl, pretendToBeVisual: true }
    );
    installJsdom(dom, { includeLocalStorage: false });

    const doc = dom.window.document;
    const scroller = doc.querySelector<HTMLElement>('.ds-virtual-list--printable');
    const visibleItems = doc.querySelector<HTMLElement>('.ds-virtual-list-visible-items');
    if (!scroller || !visibleItems) {
      throw new Error('Expected DeepSeek virtual list fixture nodes');
    }

    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 700 });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 5200 });

    const renderTopWindow = () => {
      visibleItems.innerHTML = `
        <div class="d29f3d7d ds-message _63c77b1"><div class="fbb737a4">please u use a table to summery three ai company different</div></div>
        <div class="ds-message _63c77b1"><div class="ds-markdown ds-assistant-message-main-content"><p>Of course! Here is a table that summarizes and compares three leading AI companies.</p></div></div>
        <div class="d29f3d7d ds-message _63c77b1"><div class="fbb737a4">i need u use least four layers text to show more things</div></div>
        <div class="ds-message _63c77b1"><div class="ds-markdown ds-assistant-message-main-content"><p>Of course. Here is a more detailed layered breakdown.</p></div></div>
        <div class="d29f3d7d ds-message _63c77b1"><div class="fbb737a4">please give me some code block example html markdown js ts python</div></div>
        <div class="ds-message _63c77b1"><div class="ds-markdown ds-assistant-message-main-content"><p>Here are code examples in HTML, Markdown, JavaScript, TypeScript, and Python.</p></div></div>`;
    };

    const renderBottomWindow = () => {
      visibleItems.innerHTML = `
        <div class="ds-message _63c77b1"><div class="ds-markdown ds-assistant-message-main-content"><p>Of course! Here is a table that summarizes and compares three leading AI companies.</p></div></div>
        <div class="d29f3d7d ds-message _63c77b1"><div class="fbb737a4">i need u use least four layers text to show more things</div></div>
        <div class="ds-message _63c77b1"><div class="ds-markdown ds-assistant-message-main-content"><p>Of course. Here is a more detailed layered breakdown.</p></div></div>
        <div class="d29f3d7d ds-message _63c77b1"><div class="fbb737a4">please give me some code block example html markdown js ts python</div></div>
        <div class="ds-message _63c77b1"><div class="ds-markdown ds-assistant-message-main-content"><p>Here are code examples in HTML, Markdown, JavaScript, TypeScript, and Python.</p></div></div>`;
    };

    scroller.addEventListener('scroll', () => {
      if (scroller.scrollTop <= 0) {
        renderTopWindow();
      } else {
        renderBottomWindow();
      }
    });

    renderBottomWindow();
    scroller.scrollTop = 4500;

    const { createDefaultExtractorRegistry } =
      await import('../../src/content/extractors/registry');
    const registry = createDefaultExtractorRegistry({
      optionsRepository: createE2eOptionsRepository({
        aiChat: { includeTimestamps: true, userName: 'Analyst' },
        deepResearch: { pureMode: false }
      })
    });

    const clip = await registry.extract({ document: doc, url: deepseekUrl });

    expect(clip.meta.messageCount).toBe(6);
    expect(clip.markdown).toContain('message_count: 6');
    expect(clip.markdown).toMatch(/^# 1 Analyst/m);
    expect(clip.markdown.indexOf('# 1 Analyst')).toBeLessThan(
      clip.markdown.indexOf('# 2 DeepSeek')
    );
    expect(clip.markdown).toContain('> please u use a table to summery three ai company different');
    expect(scroller.scrollTop).toBe(4500);
  });
});
