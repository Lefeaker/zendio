/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BilibiliVideoPlatform } from '@content/video/platforms/bilibiliPlatform';
import {
  flattenBilibiliContentNode,
  parseBilibiliDataContent,
  resolveBilibiliRichTextContainer,
  serializeBilibiliRichTextFragment
} from '@content/video/platforms/bilibiliRichText';
import type { PlatformSelectionInput } from '@content/video/platforms';
import {
  createContext,
  mountBiliCommentWithRichText,
  withScheduledRestore
} from './bilibiliVideoPlatformFixtures';

describe('BilibiliVideoPlatform rich text', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = '';
    vi.useRealTimers();
  });

  it('falls back to rich text range extraction when selected text/html are missing', () => {
    const host = document.createElement('bili-rich-text');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const content = document.createElement('div');
    content.className = 'rich-text-content';
    content.innerHTML = '<span>Hello</span><span> world</span>';
    shadowRoot.appendChild(content);
    document.body.appendChild(host);

    const range = document.createRange();
    const firstText = content.querySelector('span')?.firstChild;
    const lastText = content.querySelectorAll('span')[1]?.firstChild;
    if (!firstText || !lastText) {
      throw new Error('Failed to build Bilibili rich text fixture');
    }
    range.setStart(firstText, 0);
    range.setEnd(lastText, lastText.textContent?.length ?? 0);

    const platform = new BilibiliVideoPlatform(createContext(document));
    const result = platform.resolveSelection({
      range,
      selectedText: '',
      selectedHtml: ''
    } as PlatformSelectionInput);

    expect(result?.text).toBe('Hello world');
    expect(result?.html).toContain('Hello');
    expect(result?.range?.toString()).toBe('Hello world');
  });

  it('extracts selection from event composed path when range is absent', () => {
    const host = document.createElement('bili-rich-text');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const content = document.createElement('div');
    content.className = 'rich-text-content';
    content.textContent = 'Event fallback text';
    shadowRoot.appendChild(content);
    document.body.appendChild(host);

    const event = new MouseEvent('mouseup', { bubbles: true });
    Object.defineProperty(event, 'composedPath', {
      configurable: true,
      value: () => [content, shadowRoot, host, document.body, document, window]
    });

    const platform = new BilibiliVideoPlatform(createContext(document));
    const result = platform.resolveSelection({
      range: null,
      selectedText: '',
      selectedHtml: '',
      event
    } as PlatformSelectionInput);

    expect(result?.text).toBe('Event fallback text');
    expect(result?.html).toContain('Event fallback text');
    expect(result?.range?.toString()).toBe('Event fallback text');
  });

  it('rebuilds an exact rich text range from selected text during event fallback', () => {
    const { content } = mountBiliCommentWithRichText(
      '<span>before </span><span>selected target</span><span> after</span>'
    );
    const selectedNode = content.querySelectorAll('span')[1]?.firstChild;
    if (!selectedNode) {
      throw new Error('Failed to build selected text fixture');
    }
    const root = content.getRootNode();
    const event = new MouseEvent('mouseup', { bubbles: true });
    Object.defineProperty(event, 'composedPath', {
      configurable: true,
      value: () => [
        selectedNode,
        content,
        root,
        root instanceof ShadowRoot ? root.host : null,
        document.body,
        document,
        window
      ]
    });

    const platform = new BilibiliVideoPlatform(createContext(document));
    const input: PlatformSelectionInput = {
      range: null,
      selectedText: 'selected target',
      selectedHtml: '',
      event
    };
    const result = platform.resolveSelection(input);

    expect(result?.text).toBe('selected target');
    expect(result?.range?.toString()).toBe('selected target');
    expect(result?.html).toContain('selected target');
    expect(result?.html).not.toContain('before');
    expect(result?.html).not.toContain('after');
  });

  it('parses structured data-content JSON and preserves mentions', () => {
    const host = document.createElement('bili-rich-text');
    host.setAttribute(
      'data-content',
      JSON.stringify({
        rich_text_nodes: [{ text: 'Hello ' }, { type: 'at', name: 'Alice' }, { text: ' world' }]
      })
    );
    document.body.appendChild(host);

    const event = new MouseEvent('mouseup', { bubbles: true });
    Object.defineProperty(event, 'composedPath', {
      configurable: true,
      value: () => [host, document.body, document, window]
    });

    const platform = new BilibiliVideoPlatform(createContext(document));
    const result = platform.resolveSelection({
      range: null,
      selectedText: '',
      selectedHtml: '',
      event
    } as PlatformSelectionInput);

    expect(result?.text).toBe('Hello @Alice world');
    expect(result?.html).toContain('Hello @Alice world');
  });

  it('finds text ranges inside nested shadow roots and strips emoji markers for matching', () => {
    const commentHost = document.createElement('bili-comment-renderer');
    const commentRoot = commentHost.attachShadow({ mode: 'open' });
    const richTextHost = document.createElement('bili-rich-text');
    richTextHost.setAttribute('data-content', '[doge] nested text');
    const richTextRoot = richTextHost.attachShadow({ mode: 'open' });
    const content = document.createElement('div');
    content.className = 'rich-text-content';
    content.textContent = '[doge] nested text';
    richTextRoot.appendChild(content);
    commentRoot.appendChild(richTextHost);
    document.body.appendChild(commentHost);

    const platform = new BilibiliVideoPlatform(createContext(document));
    const range = platform.findTextRange('nested text');

    expect(range?.toString()).toContain('nested text');
  });

  it('serializes emoji mentions and links from rich text event fallback', () => {
    const host = document.createElement('bili-rich-text');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const content = document.createElement('div');
    content.className = 'rich-text-content';
    content.innerHTML = [
      '<bili-emoji data-emoji="[doge]"></bili-emoji>',
      '<bili-at data-user-name="Alice"></bili-at>',
      '<bili-link href="https://example.com" data-title="Example"></bili-link>'
    ].join('');
    shadowRoot.appendChild(content);
    document.body.appendChild(host);

    const event = new MouseEvent('mouseup', { bubbles: true });
    Object.defineProperty(event, 'composedPath', {
      configurable: true,
      value: () => [content, shadowRoot, host, document.body, document, window]
    });

    const platform = new BilibiliVideoPlatform(createContext(document));
    const result = platform.resolveSelection({
      range: null,
      selectedText: '',
      selectedHtml: '',
      event
    } as PlatformSelectionInput);

    expect(result?.text).toContain('[doge]');
    expect(result?.text).toContain('@Alice');
    expect(result?.text).toContain('Example');
    expect(result?.html).toContain('data-aiob-fragment="emoji"');
    expect(result?.html).toContain('data-aiob-fragment="mention"');
    expect(result?.html).toContain('<a href="https://example.com"');
  });

  it('parses additional structured content node shapes and ignores invalid payloads', () => {
    expect(parseBilibiliDataContent('   ', (value) => value)).toBeNull();
    expect(parseBilibiliDataContent('plain text', (value) => value)?.text).toBe('plain text');
    expect(parseBilibiliDataContent('{bad', (value) => value)?.text).toBe('{bad');
    expect(flattenBilibiliContentNode({ raw_text: 'raw text' })).toBe('raw text');
    expect(flattenBilibiliContentNode({ content: 'content text' })).toBe('content text');
    expect(flattenBilibiliContentNode({ display_text: 'display text' })).toBe('display text');
    expect(flattenBilibiliContentNode({ name: 'Bob', type: 'user' })).toBe('');
    expect(flattenBilibiliContentNode([{ text: 'A' }, { ops: [{ insert: 'B' }] }, true, 3])).toBe(
      'ABtrue3'
    );
    expect(
      parseBilibiliDataContent(
        JSON.stringify({ ops: [{ insert: 'Hello' }, { insert: { name: 'Alice', type: 'at' } }] }),
        (value) => value
      )?.text
    ).toBe('Hello@Alice');
  });

  it('serializes img alt, reply-target mentions, dyn content, text nodes, and skips inert nodes', () => {
    const host = document.createElement('div');
    host.innerHTML = [
      '<style>.x{}</style>',
      '<img alt="[开心]" />',
      '<span class="reply-target" data-name="Carol"></span>',
      '<bili-dyn-content><span>dyn text</span></bili-dyn-content>',
      '<span class="text-node"> loose text </span>',
      '<a data-url="https://example.com/fallback"></a>',
      '<span></span>'
    ].join('');

    const result = serializeBilibiliRichTextFragment(host, (value) => value);
    expect(result.text).toContain('[开心]');
    expect(result.text).toContain('@Carol');
    expect(result.text).toContain('dyn text');
    expect(result.text).toContain('loose text');
    expect(result.text).toContain('https://example.com/fallback');
    expect(result.html).toContain('data-aiob-fragment="emoji"');
    expect(result.html).toContain('data-aiob-fragment="mention"');
    expect(result.html).toContain('<a href="https://example.com/fallback"');
  });

  it.each([
    {
      name: 'plain text',
      html: '<span>這婚是非結不可的嗎 不結婚會被抓嗎?</span>',
      expectedText: '這婚是非結不可的嗎 不結婚會被抓嗎?'
    },
    {
      name: 'reply mention and emoji',
      html: '<span>回复</span><a href="//space.bilibili.com/508008818" data-type="mention">@-银河路车神</a><span>: 那真的太會花錢了</span><img alt="[doge]" />',
      expectedText: '回复 @-银河路车神 : 那真的太會花錢了 [doge]'
    },
    {
      name: 'multi-line text',
      html: '<span>第一行\n第二行</span>',
      expectedText: '第一行 第二行'
    }
  ])('extracts Bilibili rich text from shadow contents: $name', ({ html, expectedText }) => {
    const { richText, content } = mountBiliCommentWithRichText(html);
    const event = new MouseEvent('mouseup', { bubbles: true });
    Object.defineProperty(event, 'composedPath', {
      configurable: true,
      value: () => [content.firstChild ?? content, content, richText.shadowRoot, richText]
    });

    const platform = new BilibiliVideoPlatform(createContext(document));
    const result = platform.resolveSelection({
      range: null,
      selectedText: '',
      selectedHtml: '',
      event
    } as PlatformSelectionInput);

    expect(result?.text).toBe(expectedText);
    expect(result?.html).toContain(expectedText.split(' ')[0]);
    if (html.includes('<img')) {
      expect(result?.html).toContain('data-aiob-fragment="emoji"');
      expect(result?.html).toContain('[doge]');
    }
    if (html.includes('data-type="mention"')) {
      expect(result?.html).toContain('href="//space.bilibili.com/508008818"');
      expect(result?.html).toContain('@-银河路车神');
    }
  });

  it('falls back when rich text containers or ranges cannot be resolved', () => {
    const platform = new BilibiliVideoPlatform(createContext(document));
    const platformAny = platform as unknown as {
      extractBilibiliSelection: (range: Range) => { text: string; html: string } | null;
      buildRangeCoveringBilibiliRichText: (host: HTMLElement) => Range | null;
    };
    const emptyHost = document.createElement('bili-rich-text');
    const shadowRoot = emptyHost.attachShadow({ mode: 'open' });
    shadowRoot.append(document.createElement('style'));
    expect(resolveBilibiliRichTextContainer(shadowRoot)).toBeNull();
    expect(platformAny.buildRangeCoveringBilibiliRichText(emptyHost)).toBeNull();

    const orphan = document.createTextNode('orphan');
    const range = document.createRange();
    range.setStart(orphan, 0);
    range.setEnd(orphan, orphan.textContent?.length ?? 0);
    expect(platformAny.extractBilibiliSelection(range)).toBeNull();
  });

  it('keeps range-derived selection when event fallback also exists and ignores non-childList mutations', () => {
    vi.useFakeTimers();
    const host = document.createElement('bili-rich-text');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const content = document.createElement('div');
    content.textContent = 'Range wins';
    shadowRoot.appendChild(content);
    document.body.appendChild(host);

    const range = document.createRange();
    const textNode = content.firstChild;
    if (!textNode) throw new Error('Missing text node');
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.textContent?.length ?? 0);

    const event = new MouseEvent('mouseup', { bubbles: true });
    Object.defineProperty(event, 'composedPath', {
      configurable: true,
      value: () => [content, shadowRoot, host, document.body, document, window]
    });

    const scheduleRestore = vi.fn();
    const platform = new BilibiliVideoPlatform(
      withScheduledRestore(createContext(document), scheduleRestore)
    );
    const result = platform.resolveSelection({
      range,
      selectedText: '',
      selectedHtml: '',
      event
    } as PlatformSelectionInput);
    expect(result?.text).toBe('Range wins');
    expect(result?.range?.toString()).toBe('Range wins');

    platform.handleMutations([
      {
        type: 'attributes',
        addedNodes: [],
        removedNodes: [],
        target: document.body,
        attributeName: 'data-test',
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null
      } as unknown as MutationRecord
    ]);
    vi.advanceTimersByTime(120);
    expect(scheduleRestore).not.toHaveBeenCalled();
  });

  it('serializes mixed rich text nodes and restores by wrapper id before text lookup', () => {
    const context = createContext(document);
    const wrapper = document.createElement('mark');
    wrapper.id = 'existing-wrapper';
    document.body.appendChild(wrapper);
    context.__mocks.getElementByIdDeep.mockReturnValue(wrapper);
    const platform = new BilibiliVideoPlatform(context);

    const root = document.createElement('div');
    root.innerHTML = '<span class="text-node">Hello </span><a href="https://example.com">link</a>';
    const mention = document.createElement('bili-at');
    mention.setAttribute('data-name', 'Alice');
    const emoji = document.createElement('img');
    emoji.setAttribute('alt', '[smile]');
    root.append(mention, emoji);

    const serialized = serializeBilibiliRichTextFragment(root, (value) => value);
    expect(serialized.text).toContain('Hello');
    expect(serialized.text).toContain('link');
    expect(serialized.text).toContain('@Alice');
    expect(serialized.text).toContain('[smile]');
    expect(serialized.html).toContain('data-aiob-fragment="mention"');
    expect(serialized.html).toContain('data-aiob-fragment="emoji"');

    const restored = platform.restoreHighlight({
      kind: 'fragment',
      id: 'fragment-existing',
      comment: '',
      selectedText: 'unused',
      selectedHtml: '<p>unused</p>',
      fragmentUrl: 'https://example.com/#:~:text=unused',
      wrapperId: 'existing-wrapper',
      createdAt: Date.now()
    });
    expect(restored).toBe('existing-wrapper');
  });

  it('wraps normalized plain text when html cannot be recovered and keeps non-childList mutations inert', () => {
    const platform = new BilibiliVideoPlatform(createContext(document));
    const textNode = document.createTextNode('Hello bilibili world');
    document.body.appendChild(textNode);
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.textContent?.length ?? 0);

    const result = platform.resolveSelection({
      range,
      selectedText: '   Hello   bilibili world   ',
      selectedHtml: ''
    } as PlatformSelectionInput);

    expect(result).toMatchObject({
      text: 'Hello bilibili world',
      html: '<p>Hello bilibili world</p>'
    });

    const scheduleRestore = vi.fn();
    const inertPlatform = new BilibiliVideoPlatform(
      withScheduledRestore(createContext(document), scheduleRestore)
    );
    inertPlatform.handleMutations([
      {
        type: 'attributes',
        addedNodes: [],
        removedNodes: [],
        target: document.body,
        attributeName: 'class',
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null
      } as unknown as MutationRecord
    ]);
    expect(scheduleRestore).not.toHaveBeenCalled();
  });

  it('falls back from emoji search candidates to plain text matches in the base document', () => {
    const platform = new BilibiliVideoPlatform(createContext(document));
    document.body.innerHTML = '<div class="comment-wrap"><p>Alpha Beta</p></div>';

    const range = platform.findTextRange('Alpha [smile] Beta');
    expect(range?.toString()).toBe('Alpha Beta');
  });

  it('prefers range fallback text and event fallback html when both sources partially recover selection', () => {
    const platform = new BilibiliVideoPlatform(createContext(document));
    const range = document.createRange();
    const textNode = document.createTextNode('mixed source');
    document.body.appendChild(textNode);
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.textContent?.length ?? 0);
    const event = new MouseEvent('mouseup', { bubbles: true });

    const platformAny = platform as unknown as {
      extractBilibiliSelection: (range: Range) => { text: string; html: string } | null;
      extractBilibiliSelectionFromEvent: (
        event: MouseEvent,
        range: Range | null
      ) => { text: string; html: string; range?: Range } | null;
    };
    vi.spyOn(platformAny, 'extractBilibiliSelection').mockReturnValue({
      text: 'range text',
      html: ''
    });
    vi.spyOn(platformAny, 'extractBilibiliSelectionFromEvent').mockReturnValue({
      text: '',
      html: '<p>event html</p>',
      range
    });

    const result = platform.resolveSelection({
      range,
      selectedText: '',
      selectedHtml: '',
      event
    } as PlatformSelectionInput);

    expect(result).toMatchObject({
      text: 'range text',
      html: '<p>event html</p>'
    });
  });

  it('prefers range fallback html and event fallback text when selection recovery is split across sources', () => {
    const platform = new BilibiliVideoPlatform(createContext(document));
    const range = document.createRange();
    const textNode = document.createTextNode('mixed source inverse');
    document.body.appendChild(textNode);
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.textContent?.length ?? 0);
    const event = new MouseEvent('mouseup', { bubbles: true });

    const platformAny = platform as unknown as {
      extractBilibiliSelection: (range: Range) => { text: string; html: string } | null;
      extractBilibiliSelectionFromEvent: (
        event: MouseEvent,
        range: Range | null
      ) => { text: string; html: string; range?: Range } | null;
    };
    vi.spyOn(platformAny, 'extractBilibiliSelection').mockReturnValue({
      text: '',
      html: '<p>range html</p>'
    });
    vi.spyOn(platformAny, 'extractBilibiliSelectionFromEvent').mockReturnValue({
      text: 'event text',
      html: '',
      range
    });

    const result = platform.resolveSelection({
      range,
      selectedText: '',
      selectedHtml: '',
      event
    } as PlatformSelectionInput);

    expect(result).toMatchObject({
      text: 'event text',
      html: '<p>range html</p>'
    });
  });

  it('matches stripped emoji candidates in shadow dom and keeps plain candidates unchanged when no emoji exists', () => {
    const commentHost = document.createElement('bili-comment-renderer');
    const commentRoot = commentHost.attachShadow({ mode: 'open' });
    const richTextHost = document.createElement('bili-rich-text');
    const richRoot = richTextHost.attachShadow({ mode: 'open' });
    const content = document.createElement('div');
    content.className = 'rich-text-content';
    content.textContent = 'Alpha Beta';
    richRoot.appendChild(content);
    commentRoot.appendChild(richTextHost);
    document.body.appendChild(commentHost);

    const platform = new BilibiliVideoPlatform(createContext(document));
    const platformAny = platform as unknown as {
      buildSearchCandidates: (normalized: string) => string[];
    };

    expect(platformAny.buildSearchCandidates('Alpha Beta')).toEqual(['Alpha Beta']);
    expect(platformAny.buildSearchCandidates('Alpha [smile] Beta')).toEqual([
      'Alpha [smile] Beta',
      'Alpha Beta'
    ]);
    expect(platform.findTextRange('Alpha [smile] Beta')?.toString()).toBe('Alpha Beta');
  });

  it('renders tables wrapped inside pre blocks as tables instead of plain fences', () => {
    const host = document.createElement('div');
    host.id = 'comment';
    host.innerHTML =
      '<pre><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table></pre>';
    document.body.appendChild(host);

    const platform = new BilibiliVideoPlatform(createContext(document));
    const range = platform.findTextRange('1');

    expect(range?.toString()).toBe('1');
  });
});
