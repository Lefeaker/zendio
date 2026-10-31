/* @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { createAIChatExtractor } from '../../../src/content/extractors/aiChatExtractor';

function createGatewayTranscript(scrollHeight = 2193) {
  const html = readFileSync(
    join(process.cwd(), 'tests/fixtures/ai-chat/current-dom/grok-gateway-current-2026-10-31.html'),
    'utf8'
  );
  const dom = new JSDOM(html, { url: 'https://grok.com/c/sanitized' });
  const doc = dom.window.document;
  const scroller = doc.querySelector<HTMLElement>('[data-transcript-renderer="plane"]');
  if (!scroller) throw new Error('Missing gateway transcript');
  Object.defineProperty(scroller, 'clientHeight', { value: 1028 });
  Object.defineProperty(scroller, 'scrollHeight', { value: scrollHeight });
  Object.defineProperty(dom.window, 'requestAnimationFrame', {
    value: (callback: FrameRequestCallback) => dom.window.setTimeout(() => callback(0), 0)
  });
  Object.defineProperty(dom.window, 'cancelAnimationFrame', {
    value: (handle: number) => dom.window.clearTimeout(handle)
  });
  scroller.scrollTop = Math.max(0, scrollHeight - 1028);
  const extractor = createAIChatExtractor({
    getMessages: () =>
      Promise.resolve({
        exportAiChatFallbackTitleDeepseek: 'DeepSeek',
        exportAiChatFallbackTitleKimi: 'Kimi',
        exportAiChatFallbackTitleTongyi: 'Qianwen'
      })
  });
  return { doc, scroller, extract: () => extractor.extract({ document: doc, url: doc.URL }) };
}

describe('Grok signed-in gateway transcript', () => {
  it.each([1028, 2193])(
    'exports the completed live-shaped two-round transcript at height %i',
    async (height) => {
      const { doc, scroller, extract } = createGatewayTranscript(height);
      const end = doc.querySelector('[data-plane-row="transcript:submit-spacer"]');
      if (!end) throw new Error('Missing submit spacer');
      end.textContent = 'SUGGESTED_FOLLOWUP';
      const result = await extract();
      expect(result.meta.messageCount).toBe(4);
      expect(result.markdown).toContain('GROK_USER_ONE');
      expect(result.markdown).toContain('GROK_TEST_ONE');
      expect(result.markdown).toContain('GROK_USER_TWO');
      expect(result.markdown).toContain('GROK_TEST_TWO_END');
      expect(result.markdown).toContain('- 列表一项目A');
      expect(result.markdown).toContain('- 列表二项目Y');
      expect(result.markdown).toContain('| 列1 | 列2 |');
      expect(result.markdown).toContain('| 数据3 | 数据4 |');
      expect(result.markdown).toMatch(/```javascript\nconst x = 1;\n```/i);
      expect(result.markdown).toContain('$x^2$');
      for (let line = 1; line <= 40; line += 1) {
        expect(
          result.markdown.match(new RegExp(`GROK_LINE_${String(line).padStart(2, '0')}`, 'g'))
        ).toHaveLength(1);
      }
      expect(result.markdown).not.toContain('SUGGESTED_FOLLOWUP');
      expect(scroller.scrollTop).toBe(Math.max(0, height - 1028));
    }
  );

  it.each([
    { key: 'gateway:sanitized-3', empty: true },
    { key: 'gateway:', empty: false },
    { key: 'unknown:sanitized-3', empty: false },
    { key: 'unknown:sanitized-3', empty: true },
    { key: 'transcript:submit-spacer', empty: false }
  ])(
    'rejects unresolved row $key (empty=$empty) without losing its viewport',
    async ({ key, empty }) => {
      const { doc, scroller, extract } = createGatewayTranscript();
      const row = doc.querySelector('[data-plane-row="gateway:sanitized-3"]');
      if (!row) throw new Error('Missing middle gateway row');
      row.setAttribute('data-plane-row', key);
      if (empty) row.replaceChildren();
      await expect(extract()).rejects.toMatchObject({
        code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
        context: { parserDiagnosticCodes: ['grok_transcript_message_unresolved'] }
      });
      expect(scroller.scrollTop).toBe(1165);
    }
  );

  it.each([1028, 2193])(
    'rejects an empty final assistant body at height %i without a working indicator',
    async (height) => {
      const { doc, scroller, extract } = createGatewayTranscript(height);
      const body = doc.querySelector(
        '[data-plane-row="gateway:sanitized-4"] .response-content-markdown'
      );
      if (!body) throw new Error('Missing final assistant body');
      body.innerHTML = '<div><div></div><span></span></div>';
      expect(doc.querySelector('.grok-bot[data-state="working"]')).toBeNull();
      await expect(extract()).rejects.toMatchObject({
        code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
        context: { parserDiagnosticCodes: ['grok_message_content_incomplete'] }
      });
      expect(scroller.scrollTop).toBe(Math.max(0, height - 1028));
    }
  );

  it('rejects a missing signed-in end marker and restores the viewport', async () => {
    const { doc, scroller, extract } = createGatewayTranscript();
    doc.querySelector('[data-plane-row="transcript:submit-spacer"]')?.remove();
    await expect(extract()).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['grok_transcript_end_missing'] }
    });
    expect(scroller.scrollTop).toBe(1165);
  });

  it('preserves full row identity when gateway and response IDs have the same suffix', async () => {
    const { doc, scroller, extract } = createGatewayTranscript();
    const row = doc.querySelector('[data-plane-row="gateway:sanitized-3"]');
    if (!row) throw new Error('Missing middle gateway row');
    row.setAttribute('data-plane-row', 'response:sanitized-1');
    const result = await extract();
    expect(result.meta.messageCount).toBe(4);
    expect(result.markdown).toContain('GROK_USER_ONE');
    expect(result.markdown).toContain('GROK_USER_TWO');
    expect(scroller.scrollTop).toBe(1165);
  });
});
