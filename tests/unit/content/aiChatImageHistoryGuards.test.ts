/* @vitest-environment jsdom */
import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
import { prepareAIChatExtraction } from '@content/extractors/aiChatPreparedExtraction';
import { AIChatImagePreparation } from '@content/extractors/aiChatImagePreparation';
import { prepareGrokDocumentForExtraction } from '@content/extractors/grokDocumentPreparer';
import { deepseekParser } from '../../../src/third_party/ai-chat-exporter/platforms/deepseek';
import type { ChatPlatformParser } from '../../../src/third_party/ai-chat-exporter/types';
import type { BinaryClipAttachment } from '@shared/types/clip';

const loadImage = vi.hoisted(() =>
  vi.fn(
    (source: string): Promise<BinaryClipAttachment> =>
      Promise.resolve({
        id: `ai-image-${(source.includes('new') ? '2' : '1').repeat(64)}`,
        fileName: 'image.png',
        mimeType: 'image/png',
        content: { encoding: 'base64', data: 'YQ==', byteLength: 1 }
      })
  )
);
vi.mock('@content/extractors/aiChatImageResource', () => ({ loadAIChatImage: loadImage }));

const doms: JSDOM[] = [];
function setup(html: string, url: string): JSDOM {
  const dom = new JSDOM(html, { url });
  doms.push(dom);
  Object.defineProperty(dom.window, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => dom.window.setTimeout(() => callback(0), 0)
  });
  Object.defineProperty(dom.window, 'cancelAnimationFrame', {
    value: (id: number) => dom.window.clearTimeout(id)
  });
  return dom;
}
afterEach(() => {
  doms.splice(0).forEach((dom) => dom.window.close());
  loadImage.mockClear();
  vi.useRealTimers();
});

function deepSeekHistory(navigate = false, stableImage = false) {
  const dom = setup(
    '<div class="ds-virtual-list--printable"></div>',
    'https://chat.deepseek.com/a/chat/original'
  );
  const doc = dom.window.document;
  const scroller = doc.querySelector<HTMLElement>('.ds-virtual-list--printable');
  if (!scroller) throw new Error('Missing DeepSeek scroller');
  let top = 1_000;
  let navigated = false;
  const writes: number[] = [];
  Object.defineProperties(scroller, {
    clientHeight: { get: () => 500 },
    scrollHeight: { get: () => 1_500 },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = value;
        writes.push(value);
      }
    },
    getBoundingClientRect: { value: () => new DOMRect(0, 100, 800, 500) }
  });
  function render() {
    if (!scroller) throw new Error('Missing DeepSeek scroller');
    const indices = top < 480 ? [0, 1] : top < 960 ? [1, 2, 3] : [2, 3];
    scroller.replaceChildren();
    for (const index of indices) {
      const message = doc.createElement('div');
      message.className = 'ds-message';
      message.setAttribute('data-message-id', `m${index}`);
      Object.defineProperty(message, 'getBoundingClientRect', {
        value: () => new DOMRect(0, 100 + index * 300 - top, 800, 300)
      });
      const imageSource = stableImage || top < 480 ? 'old' : 'new';
      message.innerHTML =
        index % 2
          ? `<div class="ds-assistant-message-main-content"><div class="ds-markdown">ANSWER_${index}${index === 1 ? `<img src="/${imageSource}.png">` : ''}</div></div>`
          : `<div class="ds-markdown">PROMPT_${index}</div>`;
      scroller.append(message);
    }
  }
  scroller.addEventListener('scroll', () => {
    if (navigate && !navigated) {
      navigated = true;
      dom.window.history.replaceState({}, '', '/a/chat/replacement');
    }
    render();
  });
  render();
  return { doc, scroller, writes };
}

it('DeepSeek rejects an image change under the same stable message ID across overlapping windows', async () => {
  const { doc } = deepSeekHistory();
  await expect(
    prepareAIChatExtraction('deepseek', doc, doc.URL, deepseekParser, {}, () => undefined)
  ).rejects.toMatchObject({ domain: 'extraction' });
  expect(loadImage.mock.calls.map(([source]) => source)).toContain(
    'https://chat.deepseek.com/old.png'
  );
});

it('DeepSeek does not restore a stale scroll position after same-scroller SPA navigation', async () => {
  const { doc, writes } = deepSeekHistory(true);
  const original = doc.URL;
  await expect(
    prepareAIChatExtraction('deepseek', doc, original, deepseekParser, {}, () => {
      if (doc.URL !== original) throw new Error('source changed');
    })
  ).rejects.toThrow();
  expect(doc.URL).toBe('https://chat.deepseek.com/a/chat/replacement');
  expect(writes).toEqual([0]);
  expect(loadImage).not.toHaveBeenCalled();
});

it('DeepSeek still completes when background-tab animation frames never arrive', async () => {
  vi.useFakeTimers();
  const { doc, scroller } = deepSeekHistory(false, true);
  const frames = vi.fn(() => 12345);
  Object.defineProperty(doc.defaultView, 'requestAnimationFrame', { value: frames });
  let settled = false;
  const pending = (async () => {
    try {
      return {
        value: await prepareAIChatExtraction(
          'deepseek',
          doc,
          doc.URL,
          deepseekParser,
          {},
          () => undefined
        )
      };
    } catch (error) {
      return { error };
    } finally {
      settled = true;
    }
  })();
  await vi.advanceTimersByTimeAsync(5_000);
  expect(frames).toHaveBeenCalled();
  expect(settled).toBe(true);
  const result = await pending;
  expect(result).not.toHaveProperty('error');
  if (!result.value) throw new Error('DeepSeek preparation unexpectedly rejected');
  const prepared = result.value;
  expect(prepared.document.querySelectorAll('.ds-message')).toHaveLength(4);
  expect(scroller.scrollTop).toBe(1_000);
});

it('Grok accepts a completed overlapping message when only excluded button text changes', async () => {
  const dom = setup(
    '<div id="grok-content-area"><div data-transcript-renderer="plane"></div></div>',
    'https://grok.com/share/sanitized'
  );
  const doc = dom.window.document;
  const scroller = doc.querySelector<HTMLElement>('[data-transcript-renderer]');
  if (!scroller) throw new Error('Missing Grok scroller');
  Object.defineProperties(scroller, {
    clientHeight: { value: 500 },
    scrollHeight: { value: 2_000 }
  });
  function render() {
    if (!scroller) throw new Error('Missing Grok scroller');
    const first = scroller.scrollTop < 750 ? 0 : 2;
    const last = scroller.scrollTop < 750 ? 4 : 6;
    scroller.replaceChildren();
    const marker = (key: string) => {
      const element = doc.createElement('div');
      element.setAttribute('data-plane-row', key);
      scroller.append(element);
    };
    if (first === 0) marker('transcript:top-inset');
    for (let index = first; index < last; index++) {
      const row = doc.createElement('div');
      row.setAttribute('data-plane-row', `response:r${index}`);
      row.innerHTML = `<div role="article" data-testid="${index % 2 ? 'assistant-message' : 'user-message'}"><div class="response-content-markdown">BODY_${index}</div>${index === 2 ? `<button>${scroller.scrollTop < 750 ? 'Copy' : 'Copied'}</button>` : ''}</div>`;
      scroller.append(row);
    }
    if (last === 6) marker('transcript:bottom-spacing');
  }
  scroller.addEventListener('scroll', render);
  scroller.scrollTop = 1_500;
  render();
  const prepared = await prepareGrokDocumentForExtraction(doc);
  expect(prepared.querySelectorAll('[role="article"]')).toHaveLength(6);
  expect(scroller.scrollTop).toBe(1_500);
});

const imageParser: ChatPlatformParser = {
  id: 'deepseek',
  collectImages: (root) =>
    Array.from(root.querySelectorAll<HTMLElement>('img')).map((node, index) => ({
      node,
      slotKey: `image-${index}`
    })),
  parse: () => ({ title: 'Test', messages: [], assets: [] })
};

it('keeps one canonical file and every occurrence for many explicit URLs returning identical bytes', async () => {
  const doc = setup('<body></body>', 'https://chat.deepseek.com/a/chat/images').window.document;
  doc.body.innerHTML = Array.from(
    { length: 64 },
    (_, index) => `<img src="/copy-${index}.png" alt="occurrence ${index}">`
  ).join('');
  const images = new AIChatImagePreparation(imageParser, {}, doc.URL, () => undefined);
  try {
    const frozen = images.clone(doc, 'page');
    await images.flush();
    const bundle = images.finish(frozen);
    expect(bundle.attachments).toHaveLength(1);
    expect(bundle.occurrences.size).toBe(64);
    expect(
      new Set([...bundle.occurrences.values()].map(({ attachmentId }) => attachmentId)).size
    ).toBe(1);
    expect(loadImage).toHaveBeenCalledTimes(64);
  } finally {
    images.dispose();
  }
});

it('rejects the aggregate source-descriptor budget before fetching any image', async () => {
  const doc = setup('<body></body>', 'https://chat.deepseek.com/a/chat/images').window.document;
  const prefix = `https://chat.deepseek.com/${'x'.repeat(64 * 1024)}`;
  // Each URL fits the single-descriptor bound; there are no more than 1,000 occurrences.
  for (let index = 0; index < 1_000; index++) {
    const image = doc.createElement('img');
    image.setAttribute('src', `${prefix}?image=${index}`);
    doc.body.append(image);
  }
  const single = doc.implementation.createHTMLDocument('One source descriptor');
  const first = doc.querySelector('img');
  if (!first) throw new Error('Missing source descriptor fixture');
  single.body.append(first.cloneNode(true));
  const singlePreparation = new AIChatImagePreparation(imageParser, {}, doc.URL, () => undefined);
  try {
    expect(
      singlePreparation.clone(single, 'one').querySelector('[data-aiob-image-token]')
    ).not.toBeNull();
  } finally {
    singlePreparation.dispose();
  }
  const images = new AIChatImagePreparation(imageParser, {}, doc.URL, () => undefined);
  try {
    await expect(Promise.resolve().then(() => images.clone(doc, 'page'))).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_IMAGES_INCOMPLETE',
      context: { parserDiagnosticCodes: ['ai_chat_image_capacity_exceeded'] }
    });
    expect(loadImage).not.toHaveBeenCalled();
  } finally {
    images.dispose();
  }
});
