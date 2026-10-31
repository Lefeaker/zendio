/* @vitest-environment jsdom */

import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { prepareAIChatDocumentForExtraction } from '../../../src/content/extractors/aiChatDocumentPreparer';
import { createAIChatExtractor } from '../../../src/content/extractors/aiChatExtractor';
import { grokParser } from '../../../src/third_party/ai-chat-exporter/platforms/grok';

function createVirtualTranscript(rootId = 'grok-content-area', rowPrefix = 'response') {
  const dom = new JSDOM(
    '<title>Virtual Grok | Shared Grok Conversation</title><div id="grok-content-area"><div data-testid="share-transcript-scroller" data-transcript-renderer="plane" aria-busy="false"></div></div>',
    { url: 'https://grok.com/share/sanitized' }
  );
  const doc = dom.window.document;
  const scope = doc.querySelector('#grok-content-area');
  if (!scope) throw new Error('Missing conversation surface');
  scope.id = rootId;
  const scroller = doc.querySelector<HTMLElement>('[data-transcript-renderer]');
  if (!scroller) throw new Error('Missing transcript scroller');
  Object.defineProperty(scroller, 'clientHeight', { value: 500, configurable: true });
  Object.defineProperty(scroller, 'scrollHeight', { value: 2000, configurable: true });
  Object.defineProperty(dom.window, 'requestAnimationFrame', {
    value: (callback: FrameRequestCallback) => dom.window.setTimeout(() => callback(0), 0),
    configurable: true
  });
  Object.defineProperty(dom.window, 'cancelAnimationFrame', {
    value: (handle: number) => dom.window.clearTimeout(handle),
    configurable: true
  });

  const texts = [
    'SAME_PROMPT',
    'ANSWER_ONE',
    'SAME_PROMPT',
    'ANSWER_TWO',
    'LAST_PROMPT',
    'LAST_ANSWER'
  ];
  const render = () => {
    const first = scroller.scrollTop < 750 ? 0 : 2;
    const last = scroller.scrollTop >= 750 ? 6 : 4;
    scroller.replaceChildren();
    const marker = (key: string) => {
      const node = doc.createElement('div');
      node.setAttribute('data-plane-row', key);
      scroller.appendChild(node);
    };
    if (first === 0) marker('transcript:top-inset');
    for (let index = first; index < last; index += 1) {
      const row = doc.createElement('div');
      row.setAttribute('data-plane-row', `${rowPrefix}:turn-${index}`);
      const message = doc.createElement('div');
      message.setAttribute('role', 'article');
      message.setAttribute('data-testid', index % 2 === 0 ? 'user-message' : 'assistant-message');
      const content = doc.createElement('div');
      content.className = 'response-content-markdown';
      content.textContent = texts[index] ?? '';
      message.appendChild(content);
      row.appendChild(message);
      scroller.appendChild(row);
    }
    if (last === 6) {
      marker(rowPrefix === 'gateway' ? 'transcript:submit-spacer' : 'transcript:bottom-spacing');
    }
  };
  scroller.addEventListener('scroll', render);
  scroller.scrollTop = 1500;
  render();
  return { doc, scroller };
}

describe('Grok virtual transcript preparation', () => {
  it.each([
    ['grok-content-area', 'response'],
    ['grok-page-content', 'response'],
    ['grok-content-area', 'gateway'],
    ['grok-page-content', 'gateway']
  ])(
    'collects every stable ID under %s with %s rows, keeps repeated text, and restores the viewport',
    async (rootId, rowPrefix) => {
      const { doc, scroller } = createVirtualTranscript(rootId, rowPrefix);
      expect(grokParser.parse(doc).messages.map((message) => message.md)).toEqual([
        'SAME_PROMPT',
        'ANSWER_TWO',
        'LAST_PROMPT',
        'LAST_ANSWER'
      ]);
      const prepared = await prepareAIChatDocumentForExtraction('grok', doc);
      const result = grokParser.parse(prepared);
      expect(result.messages.map((message) => message.md)).toEqual([
        'SAME_PROMPT',
        'ANSWER_ONE',
        'SAME_PROMPT',
        'ANSWER_TWO',
        'LAST_PROMPT',
        'LAST_ANSWER'
      ]);
      expect(result.messages.map((message) => message.role)).toEqual([
        'user',
        'assistant',
        'user',
        'assistant',
        'user',
        'assistant'
      ]);
      expect(scroller.scrollTop).toBe(1500);
    }
  );

  it('uses preparation in the real extractor before formatting and reports all messages', async () => {
    const { doc, scroller } = createVirtualTranscript();
    const extractor = createAIChatExtractor({
      getMessages: () =>
        Promise.resolve({
          exportAiChatFallbackTitleDeepseek: 'DeepSeek',
          exportAiChatFallbackTitleKimi: 'Kimi',
          exportAiChatFallbackTitleTongyi: 'Qianwen'
        })
    });
    const result = await extractor.extract({ document: doc, url: doc.URL });
    expect(result.meta.messageCount).toBe(6);
    expect(result.markdown).toContain('ANSWER_ONE');
    expect(result.markdown).toContain('LAST_ANSWER');
    expect(result.markdown.match(/SAME_PROMPT/g)).toHaveLength(2);
    expect(scroller.scrollTop).toBe(1500);
  });

  it('rejects a missing transcript boundary and restores the original position', async () => {
    const { doc, scroller } = createVirtualTranscript();
    scroller.addEventListener('scroll', () => {
      scroller.querySelector('[data-plane-row="transcript:bottom-spacing"]')?.remove();
    });
    await expect(prepareAIChatDocumentForExtraction('grok', doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['grok_transcript_end_missing'] }
    });
    expect(scroller.scrollTop).toBe(1500);
  });

  it('rejects a disconnected message window instead of silently joining missing history', async () => {
    const { doc, scroller } = createVirtualTranscript();
    scroller.addEventListener('scroll', () => {
      if (scroller.scrollTop >= 750) {
        scroller.querySelector('[data-plane-row="response:turn-2"]')?.remove();
        scroller.querySelector('[data-plane-row="response:turn-3"]')?.remove();
      }
    });
    await expect(prepareAIChatDocumentForExtraction('grok', doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['grok_transcript_window_gap'] }
    });
    expect(scroller.scrollTop).toBe(1500);
  });

  it('rejects loading and generating conversations before moving their viewport', async () => {
    const { doc, scroller } = createVirtualTranscript();
    scroller.setAttribute('aria-busy', 'true');
    await expect(prepareAIChatDocumentForExtraction('grok', doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['grok_transcript_loading'] }
    });
    scroller.setAttribute('aria-busy', 'false');
    const working = doc.createElement('span');
    working.className = 'grok-bot';
    working.setAttribute('data-state', 'working');
    scroller.appendChild(working);
    await expect(prepareAIChatDocumentForExtraction('grok', doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['grok_response_in_progress'] }
    });
    expect(scroller.scrollTop).toBe(1500);
  });

  it('fails when the bounded scan cannot reach the end and restores the viewport', async () => {
    const { doc, scroller } = createVirtualTranscript();
    Object.defineProperty(scroller, 'scrollHeight', { value: 1_000_000, configurable: true });
    await expect(prepareAIChatDocumentForExtraction('grok', doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['grok_transcript_budget_exhausted'] }
    });
    expect(scroller.scrollTop).toBe(1500);
  });

  it('restores the viewport if loading starts during collection', async () => {
    const { doc, scroller } = createVirtualTranscript();
    scroller.addEventListener('scroll', () => {
      if (scroller.scrollTop >= 750) scroller.setAttribute('aria-busy', 'true');
    });
    await expect(prepareAIChatDocumentForExtraction('grok', doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['grok_transcript_loading'] }
    });
    expect(scroller.scrollTop).toBe(1500);
  });

  it('does not certify an unmeasurable virtual transcript as complete', async () => {
    const { doc, scroller } = createVirtualTranscript();
    Object.defineProperty(scroller, 'clientHeight', { value: 0, configurable: true });
    await expect(prepareAIChatDocumentForExtraction('grok', doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['grok_transcript_viewport_unavailable'] }
    });
    expect(scroller.scrollTop).toBe(1500);
  });

  it('shares one active scan when the same document is exported concurrently', async () => {
    const { doc, scroller } = createVirtualTranscript();
    const prepared = await Promise.all([
      prepareAIChatDocumentForExtraction('grok', doc),
      prepareAIChatDocumentForExtraction('grok', doc)
    ]);
    expect(scroller.scrollTop).toBe(1500);
    for (const result of prepared) expect(grokParser.parse(result).messages).toHaveLength(6);
    const next = await prepareAIChatDocumentForExtraction('grok', doc);
    expect(next).not.toBe(prepared[0]);
    expect(scroller.scrollTop).toBe(1500);
  });

  it('rejects an unhydrated response row in the middle and restores the viewport', async () => {
    const { doc, scroller } = createVirtualTranscript();
    const breakMiddleRow = () => {
      scroller.querySelector('[data-plane-row="response:turn-2"]')?.replaceChildren();
    };
    scroller.addEventListener('scroll', breakMiddleRow);
    await expect(prepareAIChatDocumentForExtraction('grok', doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['grok_transcript_message_unresolved'] }
    });
    expect(scroller.scrollTop).toBe(1500);
    scroller.removeEventListener('scroll', breakMiddleRow);
    const retried = await prepareAIChatDocumentForExtraction('grok', doc);
    expect(grokParser.parse(retried).messages).toHaveLength(6);
    expect(scroller.scrollTop).toBe(1500);
  });

  it('validates response placeholders even when the transcript does not overflow', async () => {
    const { doc, scroller } = createVirtualTranscript();
    Object.defineProperty(scroller, 'scrollHeight', { value: 500, configurable: true });
    scroller.querySelector('[data-plane-row="response:turn-2"]')?.replaceChildren();
    await expect(prepareAIChatDocumentForExtraction('grok', doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['grok_transcript_message_unresolved'] }
    });
  });

  it('rejects an old export after SPA navigation reuses its connected scroller', async () => {
    const { doc, scroller } = createVirtualTranscript();
    const originalUrl = doc.URL;
    let navigated = false;
    scroller.addEventListener('scroll', () => {
      if (navigated) return;
      navigated = true;
      doc.defaultView?.history.pushState({}, '', '/share/replacement');
      doc.title = 'Replacement conversation';
      scroller.scrollTop = 400;
    });
    const extractor = createAIChatExtractor({
      getMessages: () =>
        Promise.resolve({
          exportAiChatFallbackTitleDeepseek: 'DeepSeek',
          exportAiChatFallbackTitleKimi: 'Kimi',
          exportAiChatFallbackTitleTongyi: 'Qianwen'
        })
    });
    await expect(extractor.extract({ document: doc, url: originalUrl })).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['grok_conversation_changed'] }
    });
    expect(scroller.isConnected).toBe(true);
    expect(scroller.scrollTop).toBe(400);
  });

  it('does not share an old document scan with a request for a different SPA URL', async () => {
    const { doc, scroller } = createVirtualTranscript();
    const oldRequest = prepareAIChatDocumentForExtraction('grok', doc);
    doc.defaultView?.history.pushState({}, '', '/share/replacement');
    doc.title = 'Replacement conversation';
    scroller.scrollTop = 400;
    const newRequest = prepareAIChatDocumentForExtraction('grok', doc);
    const results = await Promise.allSettled([oldRequest, newRequest]);
    expect(results).toEqual([
      expect.objectContaining({ status: 'rejected' }),
      expect.objectContaining({ status: 'rejected' })
    ]);
    expect(scroller.scrollTop).toBe(400);
    const retried = await prepareAIChatDocumentForExtraction('grok', doc);
    expect(retried.title).toBe('Replacement conversation');
    expect(grokParser.parse(retried).messages).toHaveLength(6);
    expect(scroller.scrollTop).toBe(400);
  });

  it('rechecks the owner before a non-scrolling preparation promise settles', async () => {
    const { doc, scroller } = createVirtualTranscript();
    Object.defineProperty(scroller, 'scrollHeight', { value: 500, configurable: true });
    const oldRequest = prepareAIChatDocumentForExtraction('grok', doc);
    doc.defaultView?.history.pushState({}, '', '/share/replacement');
    await expect(oldRequest).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['grok_conversation_changed'] }
    });
  });
});
