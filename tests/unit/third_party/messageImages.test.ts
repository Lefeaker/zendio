/* @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { geminiParser } from '../../../src/third_party/ai-chat-exporter/platforms/gemini';
import {
  cloneMessageWithImages,
  imageContentSignature,
  messageImageElements,
  removePreservingMessageImages
} from '../../../src/third_party/ai-chat-exporter/shared/messageImages';

describe('message image exclusion boundaries', () => {
  it('keeps the observed Gemini upload beneath page-level mavatar feature flags', () => {
    // Minimal observed BODY flags and user attachment shape, with neutral text.
    const doc = new DOMParser().parseFromString(
      `<body class="enable-mweb-header-mavatar sidenav-mavatar-migration-enabled">
        <user-query><user-query-content class="user-query-container">
          <user-query-file-preview><div class="file-preview-container">
            <button class="preview-image-button"><img class="preview-image" src="/test.jpg"></button>
          </div></user-query-file-preview>
          <div role="presentation">Neutral image test.</div>
        </user-query-content></user-query>
        <model-response><message-content>Image received.</message-content></model-response>
      </body>`,
      'text/html'
    );
    const candidates = geminiParser.collectImages?.(doc);
    expect(candidates).toHaveLength(1);
    for (const image of candidates ?? []) image.node.setAttribute('data-aiob-image-token', 'test');
    const result = geminiParser.parse(doc, {
      imageResolver(node) {
        if (node.getAttribute('data-aiob-image-token') !== 'test')
          throw new Error('Unprepared image');
        return '![test](aiob-attachment:test)';
      }
    });
    expect(result.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(result.messages[0]?.md).toContain('![test](aiob-attachment:test)');
    expect(result.messages[0]?.md).toContain('Neutral image test.');
  });

  it.each([
    { tag: 'section', attributes: 'class="avatar"', exclude: undefined },
    { tag: 'section', attributes: 'hidden', exclude: undefined },
    { tag: 'section', attributes: 'aria-hidden="true"', exclude: undefined },
    { tag: 'section', attributes: 'role="toolbar"', exclude: undefined },
    { tag: 'url-source-card', attributes: '', exclude: undefined },
    { tag: 'section', attributes: 'class="thinking"', exclude: '.thinking' }
  ])('still excludes the content root itself: $tag $attributes', ({ tag, attributes, exclude }) => {
    const doc = new DOMParser().parseFromString(
      `<${tag} ${attributes}><div data-body><img src="/excluded.jpg"></div></${tag}>`,
      'text/html'
    );
    const root = doc.querySelector<HTMLElement>(tag);
    const body = root?.querySelector<HTMLElement>('[data-body]');
    if (!root || !body) throw new Error('Missing scoped image fixture');
    expect(messageImageElements(root, exclude)).toHaveLength(0);
    const cloned = cloneMessageWithImages(root, [body], exclude);
    expect(cloned.querySelectorAll('img')).toHaveLength(0);
  });

  it('ignores outside ancestor classes in signatures and keeps owned images through clone cleanup', () => {
    const doc = new DOMParser().parseFromString(
      '<section><div data-body><button><img src="/visible.jpg"></button><div class="avatar"><img src="/avatar.jpg"></div></div></section>',
      'text/html'
    );
    const root = doc.querySelector<HTMLElement>('section');
    const body = root?.querySelector<HTMLElement>('[data-body]');
    if (!root || !body) throw new Error('Missing scoped image fixture');
    const before = imageContentSignature(root);
    doc.body.className = 'enable-mweb-header-mavatar sidenav-mavatar-migration-enabled';
    expect(imageContentSignature(root)).toBe(before);
    expect(messageImageElements(root).map((image) => image.getAttribute('src'))).toEqual([
      '/visible.jpg'
    ]);
    const clone = cloneMessageWithImages(root, [body]);
    clone.querySelectorAll('button').forEach(removePreservingMessageImages);
    expect(Array.from(clone.querySelectorAll('img'), (image) => image.getAttribute('src'))).toEqual(
      ['/visible.jpg']
    );
  });
});
