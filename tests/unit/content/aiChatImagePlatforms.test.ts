/* @vitest-environment jsdom */
import { Blob as NodeBlob } from 'node:buffer';
import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAIChatExtractor } from '@content/extractors/aiChatExtractor';
import { createLazyExtractorRegistry } from '@content/runtime/contentLazyRuntime';
import { createTestPlatformHarness } from '../../utils/platformTestHarness';
import { createAIChatImageAttachment } from '@shared/attachments/aiChatImageBytes';
import { createE2eOptionsRepository } from '../../utils/e2eOptionsRepository';
import { getContentMessages } from '@content/i18n/context';
import { countClipAttachmentReferences } from '@shared/attachments/clipAttachmentReferences';
import { getAIChatSupportedPlatformIds } from '../../../src/third_party/ai-chat-exporter/platformIdentity';
import type { PlatformId } from '../../../src/third_party/ai-chat-exporter/types';
import { imageAdapterDocument } from '../../fixtures/ai-chat/imageAdapterSynthetic';
import { imageBytes, imageSample } from '../shared/aiChatImageTestSamples';

const pages: Record<PlatformId, string> = {
  chatgpt: 'https://chatgpt.com/c/image-contract',
  claude: 'https://claude.ai/chat/image-contract',
  copilot: 'https://copilot.microsoft.com/chats/image-contract',
  gemini: 'https://gemini.google.com/app/image-contract',
  tongyi: 'https://www.qianwen.com/chat/image-contract',
  deepseek: 'https://chat.deepseek.com/a/chat/s/image-contract',
  kimi: 'https://www.kimi.com/chat/image-contract',
  doubao: 'https://www.doubao.com/chat/image-contract',
  monica: 'https://monica.im/chat/image-contract',
  perplexity: 'https://www.perplexity.ai/search/image-contract',
  grok: 'https://grok.com/c/image-contract'
};
const png = imageSample('png');
const gif = imageSample('gif');
const modelLabels: Partial<Record<PlatformId, string>> = {
  deepseek: 'DeepSeek',
  doubao: 'Doubao',
  monica: 'Monica'
};
const attachmentId = (sample: typeof png) =>
  `ai-image-${createHash('sha256').update(imageBytes(sample.base64)).digest('hex')}`;

beforeEach(async () => {
  // Load real local i18n assets before installing the image-only HTTP stub.
  await getContentMessages();
  // JSDOM lacks Blob.arrayBuffer and SubtleCrypto; use native implementations.
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

it('passes the bootstrap messenger through both lazy registries to restricted image acquisition', async () => {
  const source = 'https://assets.grok.com/image.png';
  const doc = imageAdapterDocument('grok', `<img src="${source}" alt="generated">`, '');
  const attachment = await createAIChatImageAttachment(
    imageBytes(png.base64),
    png.mimeType,
    new AbortController().signal
  );
  const harness = createTestPlatformHarness();
  const send = vi.fn(() => Promise.resolve(attachment));
  harness.messaging.setHandler(send);
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof globalThis.fetch>(() => Promise.reject(new TypeError('Network rejected')))
  );
  const registry = createLazyExtractorRegistry(createE2eOptionsRepository({}), harness.messaging);
  const result = await registry.extract({ document: doc, url: pages.grok });
  expect(send).toHaveBeenCalledWith({
    type: 'FETCH_AI_CHAT_IMAGE',
    url: source,
    sourceUrl: pages.grok,
    platform: 'grok'
  });
  expect(result.meta.attachments).toEqual([attachment]);
  expect(countClipAttachmentReferences(result.markdown, [attachment.id]).get(attachment.id)).toBe(
    2
  );
});

// Controlled DOM contracts, not live platform or installed-extension acceptance.
// Only HTTP responses are mocked; parser loading, preparation, byte validation,
// Markdown formatting and attachment occurrence accounting use production code.
describe.each(getAIChatSupportedPlatformIds())('%s image extraction integration', (platform) => {
  it.each([
    { pageContext: 'ordinary body', bodyClass: '' },
    {
      pageContext: 'observed Gemini page feature flags',
      bodyClass: 'enable-mweb-header-mavatar sidenav-mavatar-migration-enabled'
    }
  ])(
    'keeps all image-only occurrences and original bytes with $pageContext',
    async ({ bodyClass }) => {
      const page = pages[platform];
      const uploaded = new URL('/images/upload.png', page).href;
      const repeated = new URL('/images/same-bytes.png', page).href;
      const generated = new URL('/images/generated.gif', page).href;
      const sources = new Map([
        [uploaded, png],
        [repeated, png],
        [generated, gif]
      ]);
      const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
        if (typeof input !== 'string') throw new Error('Expected an absolute image URL');
        const sample = sources.get(input);
        if (!sample) throw new Error(`Unexpected image request: ${input}`);
        expect(init).toMatchObject({ credentials: 'same-origin', redirect: 'manual' });
        return Promise.resolve(
          new Response(imageBytes(sample.base64), {
            headers: { 'content-type': sample.mimeType }
          })
        );
      });
      vi.stubGlobal('fetch', fetch);
      const doc = imageAdapterDocument(
        platform,
        `
        <button><img src="${uploaded}" alt="uploaded"></button>
      `,
        `
        <div class="image-container">
          <img data-original-src="${repeated}" alt="repeated">
          <button><img src="${generated}" alt="generated"></button>
        </div>
        <div class="avatar"><img src="/must-not-fetch-avatar.png"></div>
        <div role="toolbar"><img src="/must-not-fetch-toolbar.png"></div>
        <url-source-card><img src="/must-not-fetch-source.png"></url-source-card>
        <div hidden><img src="/must-not-fetch-hidden.png"></div>
      `
      );
      doc.body.className = bodyClass;
      expect(doc.body.textContent?.trim()).toBe('');
      const original = doc.documentElement.outerHTML;
      const result = await createAIChatExtractor().extract({ document: doc, url: page });

      expect(result.type).toBe('ai_chat');
      expect(result.meta).toMatchObject({ platform, messageCount: 2 });
      expect(doc.documentElement.outerHTML).toBe(original);
      const attachments = result.meta.attachments;
      if (!attachments) throw new Error('Extraction did not return image attachments');
      expect(attachments).toHaveLength(2);
      expect(new Set(attachments.map((file) => file.fileName)).size).toBe(2);
      for (const attachment of attachments) {
        if (!('content' in attachment)) throw new Error('Expected original binary image bytes');
        const sample = attachment.mimeType === png.mimeType ? png : gif;
        const bytes = Buffer.from(attachment.content.data, 'base64');
        expect(attachment.id).toBe(attachmentId(sample));
        expect(attachment.fileName).toBe(`${attachmentId(sample)}.${sample.extension}`);
        expect(attachment.mimeType).toBe(sample.mimeType);
        expect(attachment.content).toEqual({
          encoding: 'base64',
          data: sample.base64,
          byteLength: imageBytes(sample.base64).byteLength
        });
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(
          attachment.id.slice('ai-image-'.length)
        );
      }

      const pngId = attachmentId(png);
      const gifId = attachmentId(gif);
      const expectedImages = [
        `![uploaded](aiob-attachment:${pngId})`,
        `![repeated](aiob-attachment:${pngId})`,
        `![generated](aiob-attachment:${gifId})`
      ];
      expect(result.markdown.match(/!\[[^\]]*\]\([^)]*\)/gu)).toEqual([
        ...expectedImages,
        ...expectedImages
      ]);
      expect(result.markdown).toContain('# 1 USER');
      const assistantHeading = `# 2 ${modelLabels[platform] ?? 'ASSISTANT'}`;
      expect(result.markdown).toContain(assistantHeading);
      const [userSection, assistantSection] = result.markdown.split(assistantHeading);
      if (!userSection || !assistantSection) throw new Error('Both image-only roles must survive');
      for (const section of [userSection, assistantSection]) {
        expect(countClipAttachmentReferences(section, [pngId, gifId])).toEqual(
          new Map([
            [pngId, 2],
            [gifId, 1]
          ])
        );
      }
      expect(result.markdown).not.toMatch(/!\[[^\]]*\]\(https?:/u);
      expect(result.markdown).not.toContain('ai-image-occurrence-');
      for (const source of sources.keys()) expect(result.markdown).not.toContain(source);
      expect(new Set(fetch.mock.calls.map(([input]) => input))).toEqual(new Set(sources.keys()));
    }
  );
});
