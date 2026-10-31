/* @vitest-environment jsdom */
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BinaryClipAttachment } from '@shared/types/clip';
import type {
  ChatPlatformParser,
  PlatformId
} from '../../../src/third_party/ai-chat-exporter/types';
import type { AIChatImagePreparation } from '@content/extractors/aiChatImagePreparation';
import { prepareAIChatExtraction } from '@content/extractors/aiChatPreparedExtraction';

const { loadImage, prepareDocument } = vi.hoisted(() => ({
  loadImage:
    vi.fn<
      (
        source: string,
        page: string,
        platform: PlatformId,
        signal: AbortSignal
      ) => Promise<BinaryClipAttachment>
    >(),
  prepareDocument:
    vi.fn<
      (platform: PlatformId, doc: Document, images: AIChatImagePreparation) => Promise<Document>
    >()
}));
vi.mock('@content/extractors/aiChatImageResource', () => ({ loadAIChatImage: loadImage }));
vi.mock('@content/extractors/aiChatDocumentPreparer', () => ({
  prepareAIChatDocumentForExtraction: prepareDocument
}));

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
      slotKey: `image-${index}`
    })),
  parse: () => ({ title: 'Test', messages: [], assets: [] })
};
let dom: JSDOM;
let doc: Document;

beforeEach(() => {
  dom = new JSDOM(
    '<body><section><p>First turn</p><img src="/one.png" alt="first"></section></body>',
    {
      url: 'https://chatgpt.com/c/shared-preparation'
    }
  );
  doc = dom.window.document;
  loadImage.mockReset().mockResolvedValue(imageFile());
  prepareDocument
    .mockReset()
    .mockImplementation((_platform, document) => Promise.resolve(document));
});
afterEach(() => dom.window.close());

describe('shared AI extraction preparation', () => {
  it('shares the entire pending bundle for identical same-document requests', async () => {
    const bytes = deferred<BinaryClipAttachment>();
    loadImage.mockReturnValue(bytes.promise);
    const check = vi.fn();
    const first = prepareAIChatExtraction('chatgpt', doc, doc.URL, parser, {}, check);
    const second = prepareAIChatExtraction('chatgpt', doc, doc.URL, parser, {}, check);
    expect(second).toBe(first);
    await vi.waitFor(() => expect(loadImage).toHaveBeenCalledTimes(1));
    bytes.resolve(imageFile());
    const [left, right] = await Promise.all([first, second]);
    expect(left.document).not.toBe(doc);
    expect(left.attachments).toEqual([imageFile()]);
    expect(right.attachments).toEqual(left.attachments);
    expect([...right.occurrences]).toEqual([...left.occurrences]);
    expect(prepareDocument).toHaveBeenCalledTimes(1);
  });

  it('does not reuse a bundle across content-selection configurations', async () => {
    const bytes = deferred<BinaryClipAttachment>();
    loadImage.mockReturnValue(bytes.promise);
    const first = prepareAIChatExtraction(
      'chatgpt',
      doc,
      doc.URL,
      parser,
      { deepResearch: { pureMode: false } },
      () => undefined
    );
    await expect(
      Promise.resolve().then(() =>
        prepareAIChatExtraction(
          'chatgpt',
          doc,
          doc.URL,
          parser,
          { deepResearch: { pureMode: true } },
          () => undefined
        )
      )
    ).rejects.toMatchObject({ code: 'EXTRACTION_AI_CHAT_IMAGES_INCOMPLETE' });
    bytes.resolve(imageFile());
    expect((await first).attachments).toEqual([imageFile()]);
  });

  it('clears a failed pending bundle so an explicit new extraction can retry', async () => {
    loadImage
      .mockRejectedValueOnce(new Error('resource unavailable'))
      .mockResolvedValue(imageFile());
    await expect(
      prepareAIChatExtraction('chatgpt', doc, doc.URL, parser, {}, () => undefined)
    ).rejects.toMatchObject({ code: 'EXTRACTION_AI_CHAT_IMAGES_INCOMPLETE' });
    const retried = await prepareAIChatExtraction(
      'chatgpt',
      doc,
      doc.URL,
      parser,
      {},
      () => undefined
    );
    expect(retried.attachments).toEqual([imageFile()]);
    expect(loadImage).toHaveBeenCalledTimes(2);
    expect(prepareDocument).toHaveBeenCalledTimes(2);
  });

  it('a completed snapshot is not a persistent cache for a later extraction', async () => {
    const first = await prepareAIChatExtraction(
      'chatgpt',
      doc,
      doc.URL,
      parser,
      {},
      () => undefined
    );
    const image = doc.querySelector('img');
    if (!image) throw new Error('Missing message image fixture');
    image.setAttribute('src', '/new.png');
    loadImage.mockResolvedValue(imageFile(2));
    const second = await prepareAIChatExtraction(
      'chatgpt',
      doc,
      doc.URL,
      parser,
      {},
      () => undefined
    );
    expect(second.document).not.toBe(first.document);
    expect(first.attachments).toEqual([imageFile()]);
    expect(second.attachments).toEqual([imageFile(2)]);
  });

  it('acquires each virtual window before the preparation owner unmounts it', async () => {
    const firstBytes = deferred<BinaryClipAttachment>();
    const secondBytes = deferred<BinaryClipAttachment>();
    loadImage.mockImplementation((source) =>
      source.endsWith('/one.png') ? firstBytes.promise : secondBytes.promise
    );
    let firstUnmounted = false;
    prepareDocument.mockImplementation(async (_platform, document, images) => {
      const first = document.querySelector('section');
      if (!first) throw new Error('Missing first window');
      const frozenFirst = images.clone(first, 'first-window');
      await images.flush();
      first.remove();
      firstUnmounted = true;
      const second = document.createElement('section');
      second.innerHTML = '<p>Second turn</p><img src="/two.png" alt="second">';
      document.body.append(second);
      const frozenSecond = images.clone(second, 'second-window');
      await images.flush();
      second.remove();
      const output = document.implementation.createHTMLDocument('Hydrated history');
      output.body.append(frozenFirst, frozenSecond);
      return output;
    });
    const pending = prepareAIChatExtraction('chatgpt', doc, doc.URL, parser, {}, () => undefined);
    await vi.waitFor(() => expect(loadImage).toHaveBeenCalledTimes(1));
    expect(firstUnmounted).toBe(false);
    expect(doc.querySelector('img')?.getAttribute('src')).toBe('/one.png');
    firstBytes.resolve(imageFile());
    await vi.waitFor(() => expect(loadImage).toHaveBeenCalledTimes(2));
    expect(firstUnmounted).toBe(true);
    secondBytes.resolve(imageFile(2));
    const result = await pending;
    expect(result.attachments).toEqual([imageFile(), imageFile(2)]);
    expect([...result.occurrences.values()].map(({ alt }) => alt)).toEqual(['first', 'second']);
    expect(result.document.body.textContent).toContain('First turn');
    expect(result.document.body.textContent).toContain('Second turn');
    expect(result.document.querySelectorAll('img[data-aiob-image-token]')).toHaveLength(2);
    expect(doc.querySelector('img')).toBeNull();
  });
});
