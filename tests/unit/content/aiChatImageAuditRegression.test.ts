/* @vitest-environment jsdom */
import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAIChatExtractor } from '@content/extractors/aiChatExtractor';
import { getContentMessages } from '@content/i18n/context';
import { countClipAttachmentReferences } from '@shared/attachments/clipAttachmentReferences';
import { imageBytes, imageSample } from '../shared/aiChatImageTestSamples';

const png = imageSample('png');
const fetchImage = vi.fn<typeof globalThis.fetch>();
const image = '<img src="/image.png" alt="sample">';

function chatgptMessage(role: 'user' | 'assistant', html: string): string {
  const content =
    role === 'user' ? 'data-user-message-bubble' : 'data-markdown-text-style="assistant-message"';
  return `<section><h4 data-conversation-role="${role}"></h4><div ${content}>${html}</div></section>`;
}

function conversation(html: string, url = 'https://chatgpt.com/c/audit'): Document {
  const doc = new DOMParser().parseFromString('<title>Image regression</title>', 'text/html');
  const base = doc.createElement('base');
  base.href = url;
  doc.head.append(base);
  doc.body.innerHTML = html;
  return doc;
}

beforeEach(async () => {
  await getContentMessages();
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('crypto', webcrypto);
  fetchImage
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve(
        new Response(imageBytes(png.base64), { headers: { 'content-type': png.mimeType } })
      )
    );
  vi.stubGlobal('fetch', fetchImage);
});
afterEach(() => vi.unstubAllGlobals());

// Only the image HTTP response is controlled. These cases exercise the complete
// production preparation, parser, byte conversion and final reference validation.
describe('AI image audit regressions through the production extractor', () => {
  it('exports a visible ChatGPT answer despite a hidden role copy', async () => {
    const doc = conversation(
      chatgptMessage('user', 'Question') +
        chatgptMessage(
          'assistant',
          `${image}Answer<div hidden><h4 data-conversation-role="assistant">Hidden copy</h4></div>`
        )
    );
    const original = doc.documentElement.outerHTML;
    const result = await createAIChatExtractor().extract({ document: doc, url: doc.baseURI });
    expect(result.meta.messageCount).toBe(2);
    expect(result.markdown).toContain('Answer');
    expect(result.markdown).not.toContain('Hidden copy');
    expect(result.meta.attachments).toHaveLength(1);
    expect(doc.documentElement.outerHTML).toBe(original);
  });

  it('retains all Kimi text fragments and one image within nested message wrappers', async () => {
    const doc = conversation(
      `<div class="chat-content-item chat-content-item-user"><div class="message-content">${image}Question</div><div class="message-content">Continuation</div></div>
       <div class="chat-content-item chat-content-item-assistant"><div class="segment-content">Answer</div></div>`,
      'https://www.kimi.com/chat/audit'
    );
    const result = await createAIChatExtractor().extract({ document: doc, url: doc.baseURI });
    expect(result.meta.messageCount).toBe(2);
    const files = result.meta.attachments ?? [];
    expect(files).toHaveLength(1);
    expect(
      countClipAttachmentReferences(
        result.markdown,
        files.map((file) => file.id)
      )
    ).toEqual(new Map(files.map((file) => [file.id, 1])));
    expect(result.markdown).toContain('# 1 USER');
    expect(result.markdown).toContain('# 2 ASSISTANT');
    expect(result.markdown).toContain('Question');
    expect(result.markdown).toContain('Continuation');
    expect(result.markdown.indexOf('Question')).toBeLessThan(
      result.markdown.indexOf('Continuation')
    );
    expect(result.markdown.indexOf('Continuation')).toBeLessThan(
      result.markdown.indexOf('# 2 ASSISTANT')
    );
  });

  describe.each([
    { name: 'hidden copies', attribute: 'hidden', visible: false },
    { name: 'aria-hidden copies', attribute: 'aria-hidden="true"', visible: false },
    { name: 'display:none copies', attribute: 'style="display:none"', visible: false },
    { name: 'display: none copies', attribute: 'style="display: none"', visible: false },
    { name: 'visible internal fragments', attribute: '', visible: true }
  ])('Kimi message ownership with $name', ({ attribute, visible }) => {
    it.each([false, true])(
      'preserves the complete user turn after an earlier pair: %s',
      async (later) => {
        const earlier = later
          ? '<div class="message user"><div class="content">EARLIER_QUESTION</div></div><div class="message assistant"><div class="content">EARLIER_ANSWER</div></div>'
          : '';
        const internal = `<div ${attribute}><div class="message">INTERNAL_FIRST</div><div class="message">INTERNAL_SECOND</div></div>`;
        const doc = conversation(
          `${earlier}<div class="chat-content-item chat-content-item-user" data-conversation-turn-id="owned-user-turn"><div class="segment-text">VISIBLE_QUESTION${image}${visible ? internal : ''}</div>${visible ? '' : internal}</div>
         <div class="chat-content-item chat-content-item-assistant"><div class="segment-content">VISIBLE_ANSWER</div></div>`,
          'https://www.kimi.com/chat/message-ownership'
        );
        const original = doc.documentElement.outerHTML;
        const result = await createAIChatExtractor().extract({ document: doc, url: doc.baseURI });
        expect(result.meta.messageCount).toBe(later ? 4 : 2);
        for (const text of ['VISIBLE_QUESTION', 'VISIBLE_ANSWER']) {
          expect(result.markdown.split(text)).toHaveLength(2);
        }
        expect(result.markdown.indexOf('VISIBLE_QUESTION')).toBeLessThan(
          result.markdown.indexOf('VISIBLE_ANSWER')
        );
        if (later) {
          expect(result.markdown).toContain('EARLIER_QUESTION');
          expect(result.markdown).toContain('EARLIER_ANSWER');
          expect(result.markdown.indexOf('EARLIER_ANSWER')).toBeLessThan(
            result.markdown.indexOf('VISIBLE_QUESTION')
          );
        }
        expect(result.markdown.match(/^# \d+ USER$/gm)).toHaveLength(later ? 2 : 1);
        expect(result.markdown.match(/^# \d+ ASSISTANT$/gm)).toHaveLength(later ? 2 : 1);
        for (const text of ['INTERNAL_FIRST', 'INTERNAL_SECOND']) {
          expect(result.markdown.includes(text)).toBe(visible);
        }
        const files = result.meta.attachments ?? [];
        expect(files).toHaveLength(1);
        expect(
          countClipAttachmentReferences(
            result.markdown,
            files.map((file) => file.id)
          )
        ).toEqual(new Map(files.map((file) => [file.id, 1])));
        expect(doc.documentElement.outerHTML).toBe(original);
      }
    );
  });

  it('keeps adjacent literal-backtick image captions outside code spans', async () => {
    const doc = conversation(
      chatgptMessage('user', 'Question') +
        chatgptMessage(
          'assistant',
          '<img src="/image.png" alt="a `"><img src="/image.png" alt="b `">'
        )
    );
    const result = await createAIChatExtractor().extract({ document: doc, url: doc.baseURI });
    const files = result.meta.attachments ?? [];
    expect(files).toHaveLength(1);
    expect(
      countClipAttachmentReferences(
        result.markdown,
        files.map((file) => file.id)
      )
    ).toEqual(new Map(files.map((file) => [file.id, 2])));
    expect(result.markdown).not.toContain('ai-image-occurrence-');
  });

  it.each([
    { secondSource: '/image.png', reads: 1 },
    { secondSource: '/same-bytes.png', reads: 2 }
  ])(
    'keeps two positions and one file with $reads source reads',
    async ({ secondSource, reads }) => {
      const doc = conversation(
        chatgptMessage('user', image) +
          chatgptMessage('assistant', `<img src="${secondSource}" alt="again">`)
      );
      const result = await createAIChatExtractor().extract({ document: doc, url: doc.baseURI });
      const files = result.meta.attachments ?? [];
      expect(files).toHaveLength(1);
      expect(files[0]).toMatchObject({
        mimeType: png.mimeType,
        content: {
          encoding: 'base64',
          data: png.base64,
          byteLength: imageBytes(png.base64).byteLength
        }
      });
      expect(
        countClipAttachmentReferences(
          result.markdown,
          files.map((file) => file.id)
        )
      ).toEqual(new Map(files.map((file) => [file.id, 2])));
      expect(fetchImage).toHaveBeenCalledTimes(reads);
    }
  );
});
