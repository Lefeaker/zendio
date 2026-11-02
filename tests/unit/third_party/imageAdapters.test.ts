/* @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listParsers } from '../../../src/third_party/ai-chat-exporter/registry';
import type {
  ChatPlatformParser,
  ParseConfig
} from '../../../src/third_party/ai-chat-exporter/types';
import { chatHtmlToMarkdown } from '../../../src/third_party/ai-chat-exporter/shared/markdown';
import { imageContentSignature } from '../../../src/third_party/ai-chat-exporter/shared/messageImages';
import { imageAdapterDocument } from '../../fixtures/ai-chat/imageAdapterSynthetic';
import { grokParser } from '../../../src/third_party/ai-chat-exporter/platforms/grok';
import { doubaoParser } from '../../../src/third_party/ai-chat-exporter/platforms/doubao';
import { geminiParser } from '../../../src/third_party/ai-chat-exporter/platforms/gemini';
import { buildChatMarkdown } from '../../../src/content/formatters/markdown';
import { countClipAttachmentReferences } from '../../../src/shared/attachments/clipAttachmentReferences';

function registerImages(parser: ChatPlatformParser, doc: ParentNode) {
  if (!parser.collectImages) throw new Error(`No collector for ${parser.id}`);
  const candidates = parser.collectImages(doc);
  candidates.forEach((candidate, index) =>
    candidate.node.setAttribute('data-aiob-image-token', `image-${index}`)
  );
  return candidates;
}

const config: ParseConfig = {
  fallbackTitle: 'Image adapter contract',
  imageResolver(node) {
    const token = node.getAttribute('data-aiob-image-token');
    if (!token) throw new Error('Unregistered message image');
    return `![image](aiob-attachment:${token})`;
  }
};

describe.each(listParsers())('$id image ownership (synthetic contract)', (parser) => {
  it('does not turn pretty HTML indentation around real images into Markdown code', () => {
    const doc = imageAdapterDocument(
      parser.id,
      `
        <p>Before the images.</p>
        <img src="https://images.example.test/first.png">
        <a href="https://example.com"><img src="https://images.example.test/second.png"></a>
        <span><img src="https://images.example.test/third.png"></span>
        <pre><code class="language-markdown">![literal](aiob-attachment:literal)</code></pre>
      `
    );
    const candidates = registerImages(parser, doc);
    expect(candidates).toHaveLength(6);
    expect(candidates.every((candidate) => candidate.messageRoot?.contains(candidate.node))).toBe(
      true
    );
    const result = parser.parse(doc, config);
    const markdown = buildChatMarkdown({
      platform: parser.id,
      url: 'https://example.com/controlled',
      messages: result.messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.md ?? ''
      }))
    });
    const ids = candidates.map((_, index) => `image-${index}`);
    const counts = countClipAttachmentReferences(markdown, [...ids, 'literal']);
    expect(Array.from(counts)).toEqual(ids.map((id) => [id, 1]));
    expect(markdown).toContain('![literal](aiob-attachment:literal)');
    expect(counts.has('literal')).toBe(false);
  });

  it('keeps image-only messages and every button-wrapped gallery image in message order', () => {
    const doc = imageAdapterDocument(
      parser.id,
      '<button><img src="https://images.example.test/same.png"></button>',
      '<div class="image-container"><button><img data-src="https://images.example.test/lazy.png"></button><img srcset="https://images.example.test/large.png 2x"></div>'
    );
    const candidates = registerImages(parser, doc);
    expect(candidates).toHaveLength(6);
    expect(new Set(candidates.map((candidate) => candidate.slotKey)).size).toBe(6);
    const result = parser.parse(doc, config);
    expect(result.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(
      result.messages
        .map((message) => message.md)
        .join('\n')
        .match(/aiob-attachment:image-\d+/g)
    ).toEqual(candidates.map((_, index) => `aiob-attachment:image-${index}`));
  });

  it('preserves text with outside-body images but excludes avatar, source cards and toolbar icons', () => {
    const doc = imageAdapterDocument(
      parser.id,
      '<p>Retain this text.</p>',
      '<button><img src="https://images.example.test/content.png"></button><div class="avatar"><img src="avatar.png"></div><div role="toolbar"><button><img src="copy.png"></button></div><url-source-card><img src="source.png"></url-source-card><div class="controls"><img src="control.png"></div>'
    );
    expect(registerImages(parser, doc)).toHaveLength(2);
    const result = parser.parse(doc, config);
    expect(result.messages).toHaveLength(2);
    expect(result.messages.every((message) => message.md?.includes('Retain this text.'))).toBe(
      true
    );
    expect(
      result.messages
        .map((message) => message.md)
        .join('\n')
        .match(/aiob-attachment:/g)
    ).toHaveLength(2);
  });

  it('keeps the same resource in distinct messages and stable slots when a message is collected alone', () => {
    const doc = imageAdapterDocument(parser.id, '<img src="https://images.example.test/same.png">');
    const all = registerImages(parser, doc);
    const message = doc.querySelector<HTMLElement>('[data-message-id="assistant-1"]');
    if (!message || !parser.collectImages) throw new Error('Missing synthetic message');
    const isolated = parser.collectImages(message);
    expect(isolated).toHaveLength(1);
    expect(isolated[0].messageRoot).toBe(message);
    expect(isolated[0].slotKey).toBe(all[1].slotKey);
    expect(parser.parse(doc, config).messages).toHaveLength(2);
  });

  it('does not silently strip an unregistered body image before the strict resolver can reject it', () => {
    const doc = imageAdapterDocument(
      parser.id,
      '<button><img src="https://images.example.test/required.png"></button>'
    );
    expect(() => parser.parse(doc, config)).toThrow('Unregistered message image');
  });

  it('keeps explicit custom image slots, including clickable wrappers and nested galleries', () => {
    const doc = imageAdapterDocument(
      parser.id,
      '<button class="uploaded-image" data-image-url="https://images.example.test/one.png"></button>',
      '<div class="image-container"><uploaded-image data-src="https://images.example.test/two.png"></uploaded-image><image-query data-url="https://images.example.test/three.png"></image-query></div>'
    );
    expect(registerImages(parser, doc)).toHaveLength(6);
    const result = parser.parse(doc, config);
    expect(result.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(
      result.messages
        .map((message) => message.md)
        .join('\n')
        .match(/aiob-attachment:/g)
    ).toHaveLength(6);
  });
});

it('keeps a resolver local to each conversion, including nested conversions', () => {
  const html =
    '<img src="https://images.example.test/a.png"><img src="https://images.example.test/b.png">';
  const output = chatHtmlToMarkdown(html, () => {
    expect(
      chatHtmlToMarkdown('<img src="https://images.example.test/inner.png">', () => 'INNER')
    ).toBe('INNER');
    return 'OUTER';
  });
  expect(output).toBe('OUTEROUTER');
});

it.each(['data-src', 'data-original', 'data-original-src'])(
  'includes %s image resource changes in the content signature without using text',
  (attribute) => {
    const doc = new DOMParser().parseFromString(
      '<img data-src="https://images.example.test/a.png">',
      'text/html'
    );
    const first = imageContentSignature(doc.body);
    doc.querySelector('img')?.setAttribute(attribute, 'https://images.example.test/b.png');
    expect(imageContentSignature(doc.body)).not.toBe(first);
  }
);

it('collects the sanitized real Grok generated-image DOM and keeps its image-only response', () => {
  const doc = new DOMParser().parseFromString(
    readFileSync(
      join(
        process.cwd(),
        'tests/fixtures/ai-chat/current-dom/grok-generated-image-current-2026-10-31.html'
      ),
      'utf8'
    ),
    'text/html'
  );
  const outside = doc.createElement('article');
  outside.setAttribute('role', 'article');
  outside.setAttribute('data-testid', 'assistant-message');
  const outsideImage = doc.createElement('img');
  outsideImage.src = 'https://images.example.test/unrelated.png';
  outside.append(outsideImage);
  doc.body.prepend(outside);
  const candidates = registerImages(grokParser, doc);
  expect(candidates).toHaveLength(1);
  expect(candidates[0].alt).toBe('生成的图像');
  const body = doc.querySelector('[data-testid="assistant-message"] .response-content-markdown');
  if (!body) throw new Error('Missing captured Grok body');
  const content = doc.createElement('div');
  content.append(body.cloneNode(true));
  content.querySelectorAll('button').forEach((button) => button.remove());
  expect(content.textContent?.trim()).toBe('');
  const result = grokParser.parse(doc, config);
  expect(result.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
  expect(result.messages[1].md).toBe('![image](aiob-attachment:image-0)');
});

it('excludes the observed empty Doubao avatar without rejecting a real image with the same alt', () => {
  const doc = imageAdapterDocument('doubao', '<p>Visible text.</p>');
  const assistant = doc.querySelector('[data-message-id="assistant-1"]');
  const user = doc.querySelector('[data-message-id="user-1"] .send-text');
  if (!assistant || !user) throw new Error('Missing synthetic Doubao roots');
  const avatar = doc.createElement('img');
  avatar.alt = '豆包助手';
  assistant.prepend(avatar);
  const image = doc.createElement('img');
  image.alt = '豆包助手';
  image.src = 'https://images.example.test/content.png';
  user.append(image);
  expect(registerImages(doubaoParser, doc)).toHaveLength(1);
  expect(doubaoParser.parse(doc, config).messages).toHaveLength(2);
});

it('collects Gemini Canvas images once across repeated chips and body/gallery paths', () => {
  const doc = new DOMParser().parseFromString(
    `<title>Canvas image contract</title>
    <user-query><div role="presentation"><p>Question</p></div></user-query>
    <model-response><message-content><p>Answer</p><immersive-entry-chip>Open Canvas</immersive-entry-chip></message-content></model-response>
    <model-response><message-content><p>Follow-up</p><immersive-entry-chip>Open Canvas</immersive-entry-chip></message-content></model-response>
    <immersive-panel><immersive-page><section data-test-id="canvas-body"><p>Canvas content</p><img src="https://images.example.test/canvas-body.png"></section><button><img src="https://images.example.test/canvas-gallery.png"></button></immersive-page></immersive-panel>`,
    'text/html'
  );
  expect(registerImages(geminiParser, doc)).toHaveLength(2);
  const before = doc.body.innerHTML;
  const result = geminiParser.parse(doc, config);
  const markdown = result.messages.map((message) => message.md).join('\n');
  expect(markdown.match(/aiob-attachment:image-0/g)).toHaveLength(1);
  expect(markdown.match(/aiob-attachment:image-1/g)).toHaveLength(1);
  expect(markdown).toContain('Canvas content');
  expect(doc.body.innerHTML).toBe(before);
});

it.each(['absent', 'outside-body'])(
  'ignores a residual Gemini Canvas when its chip is %s from selected message content',
  (placement) => {
    const doc = imageAdapterDocument(
      'gemini',
      '<p>Ordinary conversation.</p>',
      placement === 'outside-body'
        ? '<immersive-entry-chip>Unselected chip</immersive-entry-chip>'
        : ''
    );
    const panel = doc.createElement('immersive-panel');
    const canvas = doc.createElement('canvas-content');
    const image = doc.createElement('img');
    image.src = 'https://images.example.test/unowned-canvas.png';
    canvas.append(image);
    panel.append(canvas);
    doc.body.append(panel);
    expect(registerImages(geminiParser, doc)).toHaveLength(0);
    const result = geminiParser.parse(doc, config);
    expect(result.messages).toHaveLength(2);
    expect(result.messages.map((message) => message.md).join('\n')).not.toContain(
      'Canvas Snapshot'
    );
  }
);
