/* @vitest-environment jsdom */
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareChatGPTDocumentForExtraction } from '../../../src/content/extractors/chatgptDocumentPreparer';
import { createAIChatExtractor } from '../../../src/content/extractors/aiChatExtractor';
import { chatgptParser } from '../../../src/third_party/ai-chat-exporter/platforms/chatgpt';

type Scenario = {
  middle?: boolean;
  gap?: boolean;
  grows?: boolean;
  generating?: boolean;
  navigate?: 'url' | 'owner';
  stuckLoading?: boolean;
  viewportUnavailable?: boolean;
  lastHeight?: number;
  changingUi?: 'hidden' | 'aria-hidden' | 'button';
  contentChanges?: boolean;
  semanticChanges?: 'code' | 'language' | 'math';
  codeSource?: 'generic-header' | 'language-change' | 'content-change';
};

function virtualHistory(scenario: Scenario = {}) {
  const dom = new JSDOM(
    '<title>History regression</title><div data-app-action-timeline-scroll role="region"><div data-thread-user-message-navigation-content></div></div>',
    { url: 'https://chatgpt.com/c/sanitized-history' }
  );
  const doc = dom.window.document;
  const owner = doc.querySelector<HTMLElement>('[data-app-action-timeline-scroll]');
  const transcriptElement = doc.querySelector<HTMLElement>(
    '[data-thread-user-message-navigation-content]'
  );
  if (!owner || !transcriptElement) throw new Error('Missing history fixture');
  const transcript = transcriptElement;
  let loadedStart = 3;
  let top = 1300;
  let active = true;
  let loadPending = false;
  let hasGrown = false;
  let oldOwnerWrites = 0;
  let newOwnerWrites = 0;
  const heights = [600, 600, 600, 600, 600, 600];
  const height = () => heights.slice(loadedStart).reduce((sum, value) => sum + value, 0);
  const absoluteTop = (index: number) =>
    heights.slice(loadedStart, index).reduce((sum, value) => sum + value, 0);
  const rect = (y: number, h: number) => new DOMRect(0, y, 800, h);
  Object.defineProperties(owner, {
    clientHeight: { get: () => (active && !scenario.viewportUnavailable ? 500 : 0) },
    scrollHeight: { get: height },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = Math.max(0, Math.min(value, height() - 500));
        oldOwnerWrites += 1;
      }
    },
    getBoundingClientRect: { value: () => rect(0, 500) }
  });
  function render() {
    transcript.replaceChildren();
    if (loadedStart > 0) {
      const loading = doc.createElement('div');
      loading.setAttribute('data-loading-indicator', '');
      transcript.append(loading);
    }
    let visible = loadedStart;
    while (visible < heights.length - 1 && absoluteTop(visible) + (heights[visible] ?? 0) <= top)
      visible += 1;
    const first =
      scenario.gap && loadedStart === 0 && top > 0
        ? visible + 1
        : Math.max(loadedStart, visible - 1);
    for (let index = first; index < Math.min(6, visible + 3); index += 1) {
      const turn = doc.createElement('div');
      turn.setAttribute('data-turn-key', `stable-turn-${index}`);
      Object.defineProperty(turn, 'getBoundingClientRect', {
        value: () => rect(absoluteTop(index) - top, heights[index] ?? 0)
      });
      turn.setAttribute(
        'data-talvt-turn-state',
        scenario.generating && loadedStart === 0 && top > 0 ? 'in_progress' : 'complete'
      );
      for (const role of ['user', 'assistant']) {
        const message = doc.createElement('div');
        const heading = doc.createElement('h4');
        heading.setAttribute('data-conversation-role', role);
        const body = doc.createElement('div');
        body.setAttribute(
          role === 'user' ? 'data-user-message-bubble' : 'data-markdown-text-style',
          role === 'user' ? 'true' : 'assistant-message'
        );
        body.textContent = role === 'user' ? 'Repeated prompt' : `ANSWER_${index}`;
        if (role === 'assistant' && index === 2 && scenario.codeSource) {
          const changed = loadedStart === 0 && top > 0;
          const label =
            scenario.codeSource === 'generic-header'
              ? '代码'
              : changed && scenario.codeSource === 'language-change'
                ? 'Python'
                : 'JavaScript';
          const header =
            scenario.codeSource === 'generic-header' && !changed
              ? ''
              : `<div data-markdown-copy="exclude">${label}<button>Copy code</button></div>`;
          const code =
            changed && scenario.codeSource === 'content-change' ? 'const x = 2;' : 'const x = 1;';
          body.innerHTML += `<div data-code-block="true">${header}<div data-code-block-source="true"><code>${code}</code></div></div>`;
        }
        if (role === 'assistant' && index === 2 && scenario.semanticChanges) {
          const changed = loadedStart === 0 && top > 0;
          if (scenario.semanticChanges === 'code') {
            body.innerHTML = `<pre><code>const x = ${changed ? 2 : 1};</code></pre>`;
          } else if (scenario.semanticChanges === 'language') {
            body.innerHTML = `<div data-code-block="true"><span>${changed ? 'Python' : 'JavaScript'}</span><pre><code>123</code></pre></div>`;
          } else {
            body.innerHTML = `<span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">x^${changed ? 3 : 2}</annotation></semantics></math></span><span aria-hidden="true">visual math</span></span>`;
          }
        }
        if (role === 'assistant' && loadedStart === 0 && top > 0 && index === 2) {
          if (scenario.contentChanges) body.textContent = 'CHANGED_ANSWER';
          if (scenario.changingUi) {
            const control = doc.createElement(scenario.changingUi === 'button' ? 'button' : 'span');
            if (scenario.changingUi !== 'button') control.setAttribute(scenario.changingUi, 'true');
            control.textContent = 'TRANSIENT_UI';
            body.append(control);
          }
        }
        message.append(heading, body);
        turn.append(message);
      }
      transcript.append(turn);
    }
  }
  function paint() {
    if (loadPending && !scenario.stuckLoading) {
      const previous = loadedStart;
      loadedStart = Math.max(0, loadedStart - 2);
      top += heights.slice(loadedStart, previous).reduce((sum, value) => sum + value, 0);
      loadPending = false;
      render();
    }
  }
  Object.defineProperties(dom.window, {
    requestAnimationFrame: {
      value: (callback: FrameRequestCallback) =>
        dom.window.setTimeout(() => {
          paint();
          callback(0);
        }, 0)
    },
    cancelAnimationFrame: { value: (handle: number) => dom.window.clearTimeout(handle) }
  });
  owner.addEventListener('scroll', () => {
    if (scenario.navigate && active) {
      if (scenario.navigate === 'url') {
        dom.window.history.replaceState({}, '', '/c/different-conversation');
        return;
      }
      active = false;
      const replacement = doc.createElement('div');
      replacement.setAttribute('data-app-action-timeline-scroll', '');
      Object.defineProperties(replacement, {
        clientHeight: { value: 500 },
        scrollTop: {
          get: () => 0,
          set: () => {
            newOwnerWrites += 1;
          }
        }
      });
      doc.body.append(replacement);
      return;
    }
    if (top === 0 && loadedStart > 0) loadPending = true;
    if (scenario.grows && loadedStart === 0 && top >= 1200 && !hasGrown) {
      heights[5] = scenario.lastHeight ?? 1200;
      hasGrown = true;
    }
    render();
  });
  if (scenario.middle) top = 700;
  render();
  return { doc, owner, dom, getWrites: () => ({ oldOwnerWrites, newOwnerWrites }) };
}

const extractor = () =>
  createAIChatExtractor({
    getMessages: () =>
      Promise.resolve({
        exportAiChatFallbackTitleDeepseek: 'DeepSeek',
        exportAiChatFallbackTitleKimi: 'Kimi',
        exportAiChatFallbackTitleTongyi: 'Tongyi'
      })
  });

afterEach(() => vi.restoreAllMocks());

describe('ChatGPT long history preparation', () => {
  it('uses the real extractor to collect paginated first, middle and last turns without text deduplication', async () => {
    const { doc, owner } = virtualHistory({ grows: true });
    expect(chatgptParser.parse(doc).messages).toHaveLength(4);
    const result = await extractor().extract({ document: doc, url: doc.URL });
    expect(result.meta?.messageCount).toBe(12);
    for (let index = 0; index < 6; index += 1) expect(result.markdown).toContain(`ANSWER_${index}`);
    expect(result.markdown.match(/Repeated prompt/g)).toHaveLength(6);
    expect(owner.scrollTop).toBe(owner.scrollHeight - owner.clientHeight);
  });

  it('restores the original visible turn anchor and relative offset after older pages change the height', async () => {
    const { doc, owner } = virtualHistory({ middle: true, grows: true });
    const initial = Array.from(owner.querySelectorAll('[data-turn-key]')).find(
      (turn) => turn.getBoundingClientRect().bottom > 0
    );
    if (!initial) throw new Error('Missing initial anchor');
    const key = initial.getAttribute('data-turn-key');
    const offset = initial.getBoundingClientRect().top;
    const prepared = await prepareChatGPTDocumentForExtraction(doc);
    expect(chatgptParser.parse(prepared).messages).toHaveLength(12);
    const restored = Array.from(owner.querySelectorAll('[data-turn-key]')).find(
      (turn) => turn.getAttribute('data-turn-key') === key
    );
    expect(restored?.getBoundingClientRect().top).toBe(offset);
    expect(owner.scrollTop).not.toBe(700);
  });

  it.each<{ changingUi: Scenario['changingUi'] }>([
    { changingUi: 'hidden' },
    { changingUi: 'aria-hidden' },
    { changingUi: 'button' }
  ])('ignores changing $changingUi text excluded from exported content', async ({ changingUi }) => {
    const { doc, owner } = virtualHistory({ changingUi });
    const result = await extractor().extract({ document: doc, url: doc.URL });
    expect(result.meta?.messageCount).toBe(12);
    expect(result.markdown).not.toContain('TRANSIENT_UI');
    for (let index = 0; index < 6; index += 1) expect(result.markdown).toContain(`ANSWER_${index}`);
    expect(owner.scrollTop).toBe(owner.scrollHeight - owner.clientHeight);
  });

  it('still rejects changed conversation text in an overlapping turn', async () => {
    const { doc, owner } = virtualHistory({ contentChanges: true });
    await expect(prepareChatGPTDocumentForExtraction(doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['chatgpt_history_content_changed'] }
    });
    expect(owner.scrollTop).toBe(owner.scrollHeight - owner.clientHeight);
  });

  it('ignores a generic header mounting around unchanged semantic code and exports a fenced block', async () => {
    const { doc } = virtualHistory({ codeSource: 'generic-header' });
    const result = await extractor().extract({ document: doc, url: doc.URL });
    expect(result.meta?.messageCount).toBe(12);
    expect(result.markdown).toContain('```\nconst x = 1;\n```');
    expect(result.markdown).not.toContain('代码');
  });

  it.each<{ codeSource: Scenario['codeSource'] }>([
    { codeSource: 'language-change' },
    { codeSource: 'content-change' }
  ])('rejects $codeSource within semantic code blocks', async ({ codeSource }) => {
    const { doc } = virtualHistory({ codeSource });
    await expect(prepareChatGPTDocumentForExtraction(doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['chatgpt_history_content_changed'] }
    });
  });

  it.each<{ semanticChanges: Scenario['semanticChanges'] }>([
    { semanticChanges: 'code' },
    { semanticChanges: 'language' },
    { semanticChanges: 'math' }
  ])(
    'keeps $semanticChanges content changes in the turn signature',
    async ({ semanticChanges }) => {
      const { doc } = virtualHistory({ semanticChanges });
      await expect(prepareChatGPTDocumentForExtraction(doc)).rejects.toMatchObject({
        code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
        context: { parserDiagnosticCodes: ['chatgpt_history_content_changed'] }
      });
    }
  );

  it('shares one same-document preparation owner and allows a fresh preparation after it settles', async () => {
    const { doc } = virtualHistory();
    const first = prepareChatGPTDocumentForExtraction(doc);
    const second = prepareChatGPTDocumentForExtraction(doc);
    expect(second).toBe(first);
    expect(await second).toBe(await first);
    const next = prepareChatGPTDocumentForExtraction(doc);
    expect(next).not.toBe(first);
    expect(chatgptParser.parse(await next).messages).toHaveLength(12);
  });

  it('rejects disjoint windows instead of exporting a partial conversation and restores the bottom', async () => {
    const { doc, owner } = virtualHistory({ gap: true });
    await expect(prepareChatGPTDocumentForExtraction(doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['chatgpt_history_window_gap'] }
    });
    expect(owner.scrollTop).toBe(owner.scrollHeight - owner.clientHeight);
  });

  it('keeps scan failure explicit when bounded restoration cannot remount the original anchor after height growth', async () => {
    const { doc, owner } = virtualHistory({
      middle: true,
      gap: true,
      grows: true,
      lastHeight: 12_000
    });
    const initial = Array.from(owner.querySelectorAll('[data-turn-key]')).find(
      (turn) => turn.getBoundingClientRect().bottom > 0
    );
    if (!initial) throw new Error('Missing initial anchor');
    const key = initial.getAttribute('data-turn-key');
    await expect(prepareChatGPTDocumentForExtraction(doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['chatgpt_history_window_gap'] }
    });
    // Failed collection cannot promise anchor recovery when virtualization no
    // longer mounts it. The bounded attempt must not conceal the scan failure.
    expect(
      Array.from(owner.querySelectorAll('[data-turn-key]')).some(
        (turn) => turn.getAttribute('data-turn-key') === key
      )
    ).toBe(false);
  });

  it('rejects generation that begins during collection and restores the viewport', async () => {
    const { doc, owner } = virtualHistory({ generating: true });
    await expect(prepareChatGPTDocumentForExtraction(doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['chatgpt_generation_in_progress'] }
    });
    expect(owner.scrollTop).toBe(owner.scrollHeight - owner.clientHeight);
  });

  it('fails within its time budget and still restores its original viewport', async () => {
    const { doc, owner } = virtualHistory();
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(60_001);
    await expect(prepareChatGPTDocumentForExtraction(doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['chatgpt_history_budget_exhausted'] }
    });
    expect(owner.scrollTop).toBe(1300);
  });

  it('does not mistake a stable top with a pending history loader for the real start', async () => {
    const { doc, owner } = virtualHistory({ stuckLoading: true });
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => {
      clock += 15_000;
      return clock;
    });
    await expect(prepareChatGPTDocumentForExtraction(doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['chatgpt_history_budget_exhausted'] }
    });
    expect(owner.querySelector('[data-loading-indicator]')).not.toBeNull();
    expect(owner.scrollTop).toBe(1300);
  });

  it.each<NonNullable<Scenario['navigate']>>(['url', 'owner'])(
    'rejects %s changes and never scrolls a new conversation or returns the old in-flight snapshot',
    async (navigate) => {
      const { doc, getWrites } = virtualHistory({ navigate });
      const first = prepareChatGPTDocumentForExtraction(doc);
      const changed = prepareChatGPTDocumentForExtraction(doc);
      const results = await Promise.allSettled([first, changed]);
      for (const result of results) {
        expect(result).toMatchObject({
          status: 'rejected',
          reason: {
            code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
            context: { parserDiagnosticCodes: ['chatgpt_history_document_changed'] }
          }
        });
      }
      expect(getWrites()).toEqual({ oldOwnerWrites: 1, newOwnerWrites: 0 });
    }
  );

  it('rejects current history when its viewport is unavailable instead of returning a partial DOM', async () => {
    const { doc, getWrites } = virtualHistory({ viewportUnavailable: true });
    await expect(prepareChatGPTDocumentForExtraction(doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['chatgpt_history_owner_unresolved'] }
    });
    expect(getWrites().oldOwnerWrites).toBe(0);
  });

  it('does not guess an owner when two live timeline scrollers overlap during a route transition', async () => {
    const { doc, getWrites } = virtualHistory();
    const extra = doc.createElement('div');
    extra.setAttribute('data-app-action-timeline-scroll', '');
    Object.defineProperty(extra, 'clientHeight', { value: 500 });
    doc.body.append(extra);
    await expect(prepareChatGPTDocumentForExtraction(doc)).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_PREPARATION_INCOMPLETE',
      context: { parserDiagnosticCodes: ['chatgpt_history_owner_unresolved'] }
    });
    expect(getWrites().oldOwnerWrites).toBe(0);
  });

  it('keeps detached legacy/static documents on their existing synchronous parser path', async () => {
    const doc = new DOMParser().parseFromString(
      '<article data-message-author-role="user">Question</article>',
      'text/html'
    );
    expect(await prepareChatGPTDocumentForExtraction(doc)).toBe(doc);
  });
});
