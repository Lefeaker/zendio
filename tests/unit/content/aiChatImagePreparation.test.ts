/* @vitest-environment jsdom */
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BinaryClipAttachment } from '@shared/types/clip';
import type {
  ChatPlatformParser,
  PlatformId
} from '../../../src/third_party/ai-chat-exporter/types';
import {
  AIChatImagePreparation,
  AI_CHAT_IMAGE_TOKEN
} from '@content/extractors/aiChatImagePreparation';
import { geminiParser } from '../../../src/third_party/ai-chat-exporter/platforms/gemini';
import { chatgptParser } from '../../../src/third_party/ai-chat-exporter/platforms/chatgpt';
import * as imageSignatures from '../../../src/third_party/ai-chat-exporter/shared/messageImages';

const loadImage = vi.hoisted(() =>
  vi.fn<
    (
      source: string,
      page: string,
      platform: PlatformId,
      signal: AbortSignal
    ) => Promise<BinaryClipAttachment>
  >()
);
vi.mock('@content/extractors/aiChatImageResource', () => ({ loadAIChatImage: loadImage }));

function imageFile(index = 1): BinaryClipAttachment {
  const id = `ai-image-${String(index).padStart(64, '0')}`;
  return {
    id,
    fileName: `${id}.png`,
    mimeType: 'image/png',
    content: { encoding: 'base64', data: 'YQ==', byteLength: 1 }
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred was not initialized');
  };
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

const parser: ChatPlatformParser = {
  id: 'chatgpt',
  collectImages: (root) =>
    Array.from(root.querySelectorAll<HTMLElement>('img')).map((node, index) => ({
      node,
      slotKey: node.getAttribute('data-slot') ?? `image-${index}`
    })),
  parse: () => ({ title: 'Test', messages: [], assets: [] })
};

let dom: JSDOM;
let doc: Document;
const preparations: AIChatImagePreparation[] = [];
function preparation(checkSource = () => undefined) {
  const instance = new AIChatImagePreparation(parser, {}, doc.URL, checkSource);
  preparations.push(instance);
  return instance;
}

beforeEach(() => {
  dom = new JSDOM('<body><p>Question</p><img src="/image.png" alt="first"></body>', {
    url: 'https://chatgpt.com/c/image-preparation'
  });
  doc = dom.window.document;
  loadImage.mockReset().mockResolvedValue(imageFile());
});
afterEach(() => {
  preparations.splice(0).forEach((instance) => instance.dispose());
  dom.window.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AI image preparation snapshots', () => {
  it('freezes a clone before awaiting bytes and resolves URLs against the live document', async () => {
    const pending = deferred<BinaryClipAttachment>();
    loadImage.mockReturnValue(pending.promise);
    const images = preparation();
    const clone = images.clone(doc, 'page');
    const token = clone.querySelector('img')?.getAttribute(AI_CHAT_IMAGE_TOKEN);
    expect(token).toBeTruthy();
    expect(doc.querySelector('img')?.hasAttribute(AI_CHAT_IMAGE_TOKEN)).toBe(false);
    const flushing = images.flush();
    expect(loadImage).toHaveBeenCalledWith(
      'https://chatgpt.com/image.png',
      doc.URL,
      'chatgpt',
      expect.any(AbortSignal)
    );
    expect(clone.body.textContent).toBe('Question');
    pending.resolve(imageFile());
    await flushing;
    expect(images.finish(clone).occurrences.get(token ?? '')).toEqual({
      attachmentId: imageFile().id,
      alt: 'first'
    });
  });

  it.each<'text' | 'image' | 'alt' | 'unmount' | 'lazy-source'>([
    'text',
    'image',
    'alt',
    'unmount',
    'lazy-source'
  ])('rejects a %s change while bytes are pending', async (change) => {
    const pending = deferred<BinaryClipAttachment>();
    loadImage.mockReturnValue(pending.promise);
    const image = doc.querySelector('img');
    const paragraph = doc.querySelector('p');
    if (!image || !paragraph) throw new Error('Missing message/image fixture');
    if (change === 'lazy-source') image.setAttribute('data-original', '/original.png');
    const images = preparation();
    images.clone(doc.body, 'window');
    const flushing = images.flush();
    if (change === 'text') paragraph.textContent = 'Different conversation';
    if (change === 'image') image.setAttribute('src', '/replacement.png');
    if (change === 'alt') image.setAttribute('alt', 'changed');
    if (change === 'unmount') doc.body.remove();
    if (change === 'lazy-source') image.setAttribute('data-original', '/changed.png');
    const failed = expect(flushing).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_IMAGES_INCOMPLETE'
    });
    pending.resolve(imageFile());
    await failed;
  });

  it('rejects navigation observed by the source guard after acquisition', async () => {
    let changed = false;
    const pending = deferred<BinaryClipAttachment>();
    loadImage.mockReturnValue(pending.promise);
    const images = preparation(() => {
      if (changed) throw new Error('source changed');
    });
    images.clone(doc, 'page');
    const flushing = images.flush();
    changed = true;
    const failed = expect(flushing).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_IMAGES_INCOMPLETE'
    });
    pending.resolve(imageFile());
    await failed;
  });

  it('does not mistake an action-button label update for changed message content', async () => {
    const button = doc.createElement('button');
    button.textContent = 'Copy';
    doc.body.append(button);
    const pending = deferred<BinaryClipAttachment>();
    loadImage.mockReturnValue(pending.promise);
    const images = preparation();
    const frozen = images.clone(doc, 'page');
    const flushing = images.flush();
    button.textContent = 'Copied';
    pending.resolve(imageFile());
    await flushing;
    expect(images.finish(frozen).attachments).toEqual([imageFile()]);
  });

  it('rechecks a Gemini Canvas image from its original document collection scope', async () => {
    dom.reconfigure({ url: 'https://gemini.google.com/app/canvas-snapshot' });
    doc.body.innerHTML = `<user-query><div role="presentation"><p>Question</p></div></user-query>
      <model-response><message-content><p>Answer</p><immersive-entry-chip>Open Canvas</immersive-entry-chip></message-content></model-response>
      <immersive-panel><immersive-page><section data-test-id="canvas-body"><p>Canvas content</p><img src="/canvas-original.png"></section></immersive-page></immersive-panel>`;
    if (!geminiParser.collectImages) throw new Error('Missing Gemini collector');
    const candidates = geminiParser.collectImages(doc);
    expect(candidates).toHaveLength(1);
    const scope = candidates[0]?.messageRoot;
    if (!scope) throw new Error('Missing owned Canvas message scope');
    expect(geminiParser.collectImages(scope)).toHaveLength(0);
    const image = scope.querySelector('img');
    if (!image) throw new Error('Missing Canvas image');
    const pending = deferred<BinaryClipAttachment>();
    loadImage.mockReturnValue(pending.promise);
    const images = new AIChatImagePreparation(geminiParser, {}, doc.URL, () => undefined);
    preparations.push(images);
    images.clone(doc, 'document');
    const flushing = images.flush();
    expect(loadImage).toHaveBeenCalledTimes(1);
    image.setAttribute('src', '/canvas-replacement.png');
    const failed = expect(flushing).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_IMAGES_INCOMPLETE'
    });
    pending.resolve(imageFile());
    await failed;
  });

  it('bounds repeated large data URLs by occurrences before cloning or fetching', async () => {
    doc.body.innerHTML =
      '<article data-message-author-role="user" data-message-id="images"><div class="whitespace-pre-wrap"></div></article>';
    const body = doc.querySelector('.whitespace-pre-wrap');
    if (!body) throw new Error('Missing owned image body');
    const source = `data:image/png;base64,${'A'.repeat(1024 * 1024)}`;
    for (let index = 0; index < 60; index++) {
      const image = doc.createElement('img');
      image.src = source;
      body.append(image);
    }
    expect(chatgptParser.collectImages?.(doc)).toHaveLength(60);
    const clone = vi.spyOn(doc, 'cloneNode');
    const images = new AIChatImagePreparation(chatgptParser, {}, doc.URL, () => undefined);
    preparations.push(images);
    await expect(Promise.resolve().then(() => images.clone(doc, 'page'))).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_IMAGES_INCOMPLETE',
      context: { parserDiagnosticCodes: ['ai_chat_image_capacity_exceeded'] }
    });
    expect(clone).not.toHaveBeenCalled();
    expect(loadImage).not.toHaveBeenCalled();
  });

  it('bounds a post-await alt expansion before serializing an image signature', async () => {
    doc.body.innerHTML =
      '<article data-message-author-role="user" data-message-id="image"><div class="whitespace-pre-wrap"><img src="/original.png" alt="before"></div></article>';
    const image = doc.querySelector('img');
    if (!image) throw new Error('Missing owned image');
    expect(chatgptParser.collectImages?.(doc)).toHaveLength(1);
    const pending = deferred<BinaryClipAttachment>();
    loadImage.mockReturnValue(pending.promise);
    const images = new AIChatImagePreparation(chatgptParser, {}, doc.URL, () => undefined);
    preparations.push(images);
    images.clone(doc, 'page');
    const signature = vi.spyOn(imageSignatures, 'imageContentSignature');
    images.contentSignature(doc);
    expect(signature).toHaveBeenCalledTimes(1);
    signature.mockClear();
    const flushing = images.flush();
    image.alt = 'x'.repeat(49 * 1024 * 1024);
    const failed = expect(flushing).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_IMAGES_INCOMPLETE'
    });
    pending.resolve(imageFile());
    await failed;
    expect(signature).not.toHaveBeenCalled();
  });

  it('keeps distinct occurrence tokens and alt text when repeated images share bytes', async () => {
    doc.body.innerHTML = '<img src="/a.png" alt="first"><img src="/b.png" alt="again">';
    const images = preparation();
    const clone = images.clone(doc, 'page');
    await images.flush();
    const bundle = images.finish(clone);
    expect(bundle.attachments).toEqual([imageFile()]);
    expect(bundle.occurrences.size).toBe(2);
    const tokens = Array.from(clone.querySelectorAll('img')).map((node) =>
      node.getAttribute(AI_CHAT_IMAGE_TOKEN)
    );
    expect(new Set(tokens).size).toBe(2);
    expect([...bundle.occurrences.values()]).toEqual([
      { attachmentId: imageFile().id, alt: 'first' },
      { attachmentId: imageFile().id, alt: 'again' }
    ]);
  });

  it('retains acquired bytes after a virtual window is unmounted', async () => {
    const images = preparation();
    const frozen = images.clone(doc.body, 'window-one');
    await images.flush();
    doc.body.replaceChildren();
    const output = doc.implementation.createHTMLDocument('Frozen');
    output.body.append(...Array.from(frozen.childNodes));
    const bundle = images.finish(output);
    expect(bundle.attachments).toEqual([imageFile()]);
    expect(bundle.document.querySelector(`img[${AI_CHAT_IMAGE_TOKEN}]`)).not.toBeNull();
  });

  it('fails a missing required image source before starting acquisition', () => {
    doc.body.innerHTML = '<img alt="not loaded">';
    expect(() => preparation().clone(doc, 'page')).toThrow();
    expect(loadImage).not.toHaveBeenCalled();
  });

  it('preserves the existing data-original-src image source when src is not yet assigned', async () => {
    doc.body.innerHTML = '<img data-original-src="/lazy-original.png" alt="lazy">';
    const images = preparation();
    const frozen = images.clone(doc, 'page');
    await images.flush();
    expect(loadImage).toHaveBeenCalledWith(
      'https://chatgpt.com/lazy-original.png',
      doc.URL,
      'chatgpt',
      expect.any(AbortSignal)
    );
    expect(images.finish(frozen).attachments).toEqual([imageFile()]);
  });

  it('reads the live selected currentSrc before cloning loses that resource selection', async () => {
    const image = doc.querySelector('img');
    if (!image) throw new Error('Missing image fixture');
    Object.defineProperty(image, 'currentSrc', {
      value: 'https://chatgpt.com/selected-resolution.png'
    });
    const images = preparation();
    const frozen = images.clone(doc, 'page');
    await images.flush();
    expect(loadImage).toHaveBeenCalledWith(
      'https://chatgpt.com/selected-resolution.png',
      doc.URL,
      'chatgpt',
      expect.any(AbortSignal)
    );
    expect(images.finish(frozen).attachments).toEqual([imageFile()]);
  });

  it('uses an explicit lazy source instead of a loaded placeholder currentSrc', async () => {
    doc.body.innerHTML = '<img src="/placeholder.png" data-src="/original.png" alt="photo">';
    const image = doc.querySelector('img');
    if (!image) throw new Error('Missing image fixture');
    Object.defineProperty(image, 'currentSrc', { value: 'https://chatgpt.com/placeholder.png' });
    const images = preparation();
    const frozen = images.clone(doc, 'page');
    await images.flush();
    expect(loadImage).toHaveBeenCalledWith(
      'https://chatgpt.com/original.png',
      doc.URL,
      'chatgpt',
      expect.any(AbortSignal)
    );
    expect(images.finish(frozen).attachments).toEqual([imageFile()]);
  });

  it('does not guess a srcset resource when the browser has not selected currentSrc', async () => {
    doc.body.innerHTML =
      '<img srcset="/small.png 1x, /large.png 2x" alt="pending responsive image">';
    expect(doc.querySelector('img')?.currentSrc).toBe('');
    const images = preparation();
    await expect(Promise.resolve().then(() => images.clone(doc, 'page'))).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_IMAGES_INCOMPLETE',
      context: { parserDiagnosticCodes: ['ai_chat_image_not_ready'] }
    });
    expect(loadImage).not.toHaveBeenCalled();
  });

  it('does no resource work for plain text', async () => {
    doc.body.innerHTML = '<p>Only text</p>';
    const images = preparation();
    const frozen = images.clone(doc, 'page');
    await images.flush();
    expect(images.finish(frozen).attachments).toEqual([]);
    expect(loadImage).not.toHaveBeenCalled();
  });

  it('rejects an unfinished bundle instead of returning references without bytes', () => {
    const images = preparation();
    const frozen = images.clone(doc, 'page');
    expect(() => images.finish(frozen)).toThrow();
  });

  it('bounds concurrent resource acquisition at two', async () => {
    doc.body.innerHTML = [0, 1, 2].map((index) => `<img src="/${index}.png">`).join('');
    const first = deferred<BinaryClipAttachment>();
    const second = deferred<BinaryClipAttachment>();
    const third = deferred<BinaryClipAttachment>();
    const gates = [first, second, third];
    let active = 0;
    let maxActive = 0;
    loadImage.mockImplementation((source) => {
      const index = Number(new URL(source).pathname.slice(1).split('.')[0]);
      const gate = gates[index];
      if (!gate) throw new Error('Unexpected resource');
      maxActive = Math.max(maxActive, ++active);
      return gate.promise.finally(() => {
        active--;
      });
    });
    const images = preparation();
    const frozen = images.clone(doc, 'page');
    const flushing = images.flush();
    expect(loadImage).toHaveBeenCalledTimes(2);
    first.resolve(imageFile(1));
    await vi.waitFor(() => expect(loadImage).toHaveBeenCalledTimes(3));
    second.resolve(imageFile(2));
    third.resolve(imageFile(3));
    await flushing;
    expect(maxActive).toBe(2);
    expect(images.finish(frozen).attachments).toHaveLength(3);
  });

  it('rejects more than fifty unique files rather than dropping the remainder', async () => {
    doc.body.innerHTML = Array.from({ length: 51 }, (_, index) => `<img src="/${index}.png">`).join(
      ''
    );
    loadImage.mockImplementation((source) =>
      Promise.resolve(imageFile(Number(new URL(source).pathname.slice(1).split('.')[0]) + 1))
    );
    const images = preparation();
    images.clone(doc, 'page');
    await expect(images.flush()).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_IMAGES_INCOMPLETE'
    });
  });

  it('bounds repeated occurrence descriptors even when all images share a resource', () => {
    doc.body.innerHTML = '<img src="/same.png">'.repeat(1_001);
    expect(() => preparation().clone(doc, 'page')).toThrow();
    expect(loadImage).not.toHaveBeenCalled();
  });

  it('rejects the aggregate encoded budget even when each file fits its individual limit', async () => {
    doc.body.innerHTML = [0, 1, 2].map((index) => `<img src="/${index}.png">`).join('');
    const suffix = 'A'.repeat(17 * 1024 * 1024 - 4);
    loadImage.mockImplementation((source) => {
      const index = Number(new URL(source).pathname.slice(1).split('.')[0]);
      const data = ['AAAA', 'AQAA', 'AgAA'][index] + suffix;
      return Promise.resolve({
        ...imageFile(index + 1),
        content: { encoding: 'base64', data, byteLength: (data.length / 4) * 3 }
      });
    });
    const images = preparation();
    images.clone(doc, 'page');
    await expect(images.flush()).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_IMAGES_INCOMPLETE'
    });
  });

  it('uses one absolute preparation deadline for pending image acquisition', async () => {
    vi.useFakeTimers();
    loadImage.mockImplementation(
      (_source, _page, _platform, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        })
    );
    const images = preparation();
    images.clone(doc, 'page');
    const failed = expect(images.flush()).rejects.toMatchObject({
      code: 'EXTRACTION_AI_CHAT_IMAGES_INCOMPLETE'
    });
    await vi.advanceTimersByTimeAsync(120_000);
    await failed;
  });
});
