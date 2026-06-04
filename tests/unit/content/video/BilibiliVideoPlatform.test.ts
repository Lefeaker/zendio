/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { BilibiliVideoPlatform } from '@content/video/platforms/bilibiliPlatform';
import {
  BilibiliShadowObserver,
  isBilibiliCommentRegionNode,
  isBilibiliDanmakuNode
} from '@content/video/platforms/bilibiliPlatformObserver';
import {
  flattenBilibiliContentNode,
  parseBilibiliDataContent,
  resolveBilibiliRichTextContainer,
  serializeBilibiliRichTextFragment
} from '@content/video/platforms/bilibiliRichText';
import type { PlatformSelectionInput, VideoPlatformContext } from '@content/video/platforms';

interface VideoPlatformContextMocks {
  highlightSelection: Mock<(...args: [Range, string, string]) => string | undefined>;
  decorateHighlight: Mock<(...args: [HTMLElement]) => void>;
  scheduleFragmentHighlightRestore: Mock<(...args: []) => void>;
  getElementByIdDeep: Mock<(...args: [string]) => HTMLElement | null>;
  querySelectorDeep: Mock<(...args: [string]) => Element | null>;
  observeWithFragmentObserver: Mock<(...args: [Node, MutationObserverInit]) => void>;
  registerShadowSelectionBridge: Mock<(...args: [ShadowRoot]) => void>;
  ensureHighlightStyles: Mock<(...args: [ShadowRoot]) => void>;
}

type VideoPlatformContextWithMocks = VideoPlatformContext & {
  __mocks: VideoPlatformContextMocks;
};

function createContext(doc: Document): VideoPlatformContextWithMocks {
  const mocks: VideoPlatformContextMocks = {
    highlightSelection: vi.fn<(...args: [Range, string, string]) => string | undefined>(
      () => 'wrapper-1'
    ),
    decorateHighlight: vi.fn<(...args: [HTMLElement]) => void>(),
    scheduleFragmentHighlightRestore: vi.fn<(...args: []) => void>(),
    getElementByIdDeep: vi.fn<(...args: [string]) => HTMLElement | null>(() => null),
    querySelectorDeep: vi.fn<(...args: [string]) => Element | null>(() => null),
    observeWithFragmentObserver: vi.fn<(...args: [Node, MutationObserverInit]) => void>(),
    registerShadowSelectionBridge: vi.fn<(...args: [ShadowRoot]) => void>(),
    ensureHighlightStyles: vi.fn<(...args: [ShadowRoot]) => void>()
  };

  return {
    doc,
    ...mocks,
    querySelectorDeep: <T extends Element>(selector: string): T | null =>
      mocks.querySelectorDeep(selector) as T | null,
    __mocks: mocks
  };
}

function withScheduledRestore(
  context: VideoPlatformContextWithMocks,
  scheduleRestore: VideoPlatformContextMocks['scheduleFragmentHighlightRestore']
): VideoPlatformContextWithMocks {
  context.scheduleFragmentHighlightRestore = scheduleRestore;
  context.__mocks.scheduleFragmentHighlightRestore = scheduleRestore;
  return context;
}

function mountBiliCommentsFixture(): {
  commentsHost: HTMLElement;
  root: ShadowRoot;
  thread: HTMLElement;
  comment: HTMLElement;
  richText: HTMLElement;
  content: HTMLElement;
} {
  const host = document.createElement('bili-comments');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  const contents = document.createElement('div');
  contents.id = 'contents';
  const thread = document.createElement('bili-comment-thread-renderer');
  const threadRoot = thread.attachShadow({ mode: 'open' });
  const comment = document.createElement('bili-comment-renderer');
  const commentRoot = comment.attachShadow({ mode: 'open' });
  const richText = document.createElement('bili-rich-text');
  const richTextRoot = richText.attachShadow({ mode: 'open' });
  const content = document.createElement('p');
  content.id = 'contents';
  content.innerHTML = '<span>fixture comment</span>';
  richTextRoot.append(content);
  commentRoot.append(richText);
  threadRoot.append(comment);
  contents.append(thread);
  root.append(contents);
  return { commentsHost: host, root, thread, comment, richText, content };
}

function createBilibiliRichTextHost(html: string): HTMLElement {
  const host = document.createElement('bili-rich-text');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<p id="contents">${html}</p>`;
  return host;
}

function mountBiliCommentWithRichText(html: string): {
  commentsHost: HTMLElement;
  richText: HTMLElement;
  content: HTMLElement;
} {
  const commentsHost = document.createElement('bili-comments');
  const commentsRoot = commentsHost.attachShadow({ mode: 'open' });
  const thread = document.createElement('bili-comment-thread-renderer');
  const threadRoot = thread.attachShadow({ mode: 'open' });
  const comment = document.createElement('bili-comment-renderer');
  const commentRoot = comment.attachShadow({ mode: 'open' });
  const richText = createBilibiliRichTextHost(html);
  const content = richText.shadowRoot?.querySelector<HTMLElement>('#contents');
  if (!content) {
    throw new Error('Failed to create Bilibili rich text fixture content');
  }

  commentRoot.append(richText);
  threadRoot.append(comment);
  commentsRoot.append(thread);
  document.body.append(commentsHost);

  return { commentsHost, richText, content };
}

describe('BilibiliVideoPlatform', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = '';
    vi.useRealTimers();
  });

  it('activates on bilibili hosts and formats bilibili titles', () => {
    const platform = new BilibiliVideoPlatform(createContext(document));

    expect(
      platform.shouldActivate({ location: { hostname: 'www.bilibili.com' } } as Document)
    ).toBe(true);
    expect(platform.formatVideoTitle('测试视频___哔哩哔哩_bilibili')).toBe('测试视频');
    expect(platform.formatVideoTitle('   ')).toBeNull();
  });

  it('builds timestamp urls with active episode fallback', () => {
    document.body.innerHTML =
      '<div class="video-episode-card__entry is-active" data-index="2"></div>';
    const platform = new BilibiliVideoPlatform(createContext(document));

    const url = platform.buildTimestampUrl(135, {
      canonicalUrl: 'https://www.bilibili.com/video/BV1xx411c7mD',
      currentUrl: document.location.href,
      videoId: 'BV1xx411c7mD'
    });

    expect(url).toBe('https://www.bilibili.com/video/BV1xx411c7mD?t=135&p=3');
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

  it('schedules restore when comment hosts are added through mutations', () => {
    vi.useFakeTimers();
    const scheduleRestore = vi.fn();
    const context = withScheduledRestore(createContext(document), scheduleRestore);
    const platform = new BilibiliVideoPlatform(context);

    platform.handleMutations([
      {
        type: 'childList',
        addedNodes: [document.createElement('bili-comment-renderer')],
        removedNodes: [],
        target: document.body,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null
      } as unknown as MutationRecord
    ]);

    expect(scheduleRestore).not.toHaveBeenCalled();
    vi.advanceTimersByTime(110);
    expect(scheduleRestore).toHaveBeenCalledTimes(1);
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

  it('observes comment shadow roots and delegates highlight/restore through base behavior', () => {
    const context = createContext(document);
    const platform = new BilibiliVideoPlatform(context);

    const commentHost = document.createElement('bili-comment-renderer');
    const commentRoot = commentHost.attachShadow({ mode: 'open' });
    const richTextHost = document.createElement('bili-rich-text');
    const richTextRoot = richTextHost.attachShadow({ mode: 'open' });
    const content = document.createElement('div');
    content.className = 'rich-text-content';
    content.textContent = 'Observed text';
    richTextRoot.appendChild(content);
    commentRoot.appendChild(richTextHost);
    document.body.appendChild(commentHost);

    const observer = new MutationObserver(() => undefined);
    platform.observeDomChanges(observer);

    const range = document.createRange();
    const textNode = content.firstChild;
    if (!textNode) {
      throw new Error('Expected shadow text node');
    }
    range.setStart(textNode, 0);
    range.setEnd(textNode, 'Observed'.length);

    expect(platform.highlight(range, 'capture-1', 'https://example.com/#:~:text=Observed')).toBe(
      'wrapper-1'
    );
    const {
      ensureHighlightStyles,
      registerShadowSelectionBridge,
      observeWithFragmentObserver,
      highlightSelection
    } = context.__mocks;
    expect(ensureHighlightStyles).toHaveBeenCalledWith(commentRoot);
    expect(registerShadowSelectionBridge).toHaveBeenCalledWith(commentRoot);
    expect(observeWithFragmentObserver).toHaveBeenCalledWith(commentRoot, {
      childList: true,
      subtree: true
    });
    expect(ensureHighlightStyles.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(highlightSelection).toHaveBeenCalled();

    const existing = document.createElement('mark');
    existing.id = 'existing-wrapper';
    context.__mocks.getElementByIdDeep.mockReturnValue(existing);
    const restored = platform.restoreHighlight({
      kind: 'fragment',
      id: 'fragment-1',
      comment: '',
      selectedText: 'Observed text',
      selectedHtml: '<p>Observed text</p>',
      fragmentUrl: 'https://example.com/#:~:text=Observed%20text',
      createdAt: 1,
      wrapperId: 'existing-wrapper'
    });

    expect(restored).toBe('existing-wrapper');
    expect(context.__mocks.decorateHighlight).toHaveBeenCalledWith(existing);
    expect(context.__mocks.scheduleFragmentHighlightRestore).toHaveBeenCalled();
  });

  it('observes bili-comments root and nested comment shadow roots through scoped discovery', () => {
    const context = createContext(document);
    const platform = new BilibiliVideoPlatform(context);
    const { root, thread, comment, richText, content } = mountBiliCommentsFixture();
    const observer = new MutationObserver(() => undefined);
    platform.observeDomChanges(observer);

    const range = document.createRange();
    const textNode = content.querySelector('span')?.firstChild;
    if (!textNode) {
      throw new Error('Expected nested Bilibili fixture text');
    }
    range.setStart(textNode, 0);
    range.setEnd(textNode, 'fixture'.length);

    expect(platform.highlight(range, 'capture-bili-comments', 'https://example.com/')).toBe(
      'wrapper-1'
    );

    const registeredRoots = new Set(
      context.__mocks.registerShadowSelectionBridge.mock.calls.map(
        ([registeredRoot]) => registeredRoot
      )
    );
    expect(isBilibiliCommentRegionNode(root.getElementById('contents'))).toBe(true);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(root);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(thread.shadowRoot);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(comment.shadowRoot);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(richText.shadowRoot);
    expect(registeredRoots.size).toBe(4);
  });

  it('registers Bilibili comment shadow roots for selection even without fragment captures', () => {
    const context = createContext(document);
    const { root, thread, comment, richText } = mountBiliCommentsFixture();
    const observer = new BilibiliShadowObserver(document, context);

    observer.ensureObservedRoots();

    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(root);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(thread.shadowRoot);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(comment.shadowRoot);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(richText.shadowRoot);
  });

  it('lets the platform proactively register Bilibili selection shadow roots on session start', () => {
    const context = createContext(document);
    const { root, richText } = mountBiliCommentsFixture();
    const platform = new BilibiliVideoPlatform(context);

    platform.observeSelectionRoots();

    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(root);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(richText.shadowRoot);
    expect(context.__mocks.observeWithFragmentObserver).toHaveBeenCalledWith(root, {
      childList: true,
      subtree: true
    });
  });

  it('batches comment-root mutation refreshes to one restore', () => {
    vi.useFakeTimers();
    const scheduleRestore = vi.fn();
    const context = createContext(document);
    const platform = new BilibiliVideoPlatform(withScheduledRestore(context, scheduleRestore));
    platform.observeDomChanges({} as MutationObserver);

    const first = document.createElement('bili-comment-renderer');
    const second = document.createElement('bili-comment-reply-renderer');
    document.body.append(first, second);

    platform.handleMutations([
      {
        type: 'childList',
        addedNodes: [first, second],
        removedNodes: [],
        target: document.body,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null
      } as unknown as MutationRecord
    ]);

    vi.advanceTimersByTime(120);

    expect(scheduleRestore).toHaveBeenCalledTimes(1);
  });

  it('does not refresh comment roots for danmaku-only mutation bursts', () => {
    vi.useFakeTimers();
    const scheduleRestore = vi.fn();
    const context = createContext(document);
    const platform = new BilibiliVideoPlatform(withScheduledRestore(context, scheduleRestore));
    const region = document.createElement('div');
    region.id = 'comment';
    const commentHost = document.createElement('bili-comment-renderer');
    commentHost.attachShadow({ mode: 'open' });
    region.append(commentHost);
    document.body.append(region);
    platform.observeDomChanges({} as MutationObserver);

    const danmakuWrap = document.createElement('div');
    danmakuWrap.className = 'bpx-player-render-dm-wrap';
    for (let index = 0; index < 20; index += 1) {
      const danmaku = document.createElement('span');
      danmaku.className = 'bili-danmaku-x-dm';
      danmaku.textContent = `dm-${index}`;
      danmakuWrap.append(danmaku);
    }
    document.body.append(danmakuWrap);

    platform.handleMutations([
      {
        type: 'childList',
        addedNodes: Array.from(danmakuWrap.childNodes),
        removedNodes: [],
        target: danmakuWrap,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null
      } as unknown as MutationRecord
    ]);
    vi.advanceTimersByTime(120);

    expect(context.__mocks.observeWithFragmentObserver).not.toHaveBeenCalled();
    expect(scheduleRestore).not.toHaveBeenCalled();
  });

  it('clears pending shadow-host polling when disposed', () => {
    vi.useFakeTimers();
    const baseContext = createContext(document);
    const scheduleRestore = vi.fn();
    const platform = new BilibiliVideoPlatform(withScheduledRestore(baseContext, scheduleRestore));

    const observer = new MutationObserver(() => undefined);
    platform.observeDomChanges(observer);

    const pendingHost = document.createElement('bili-comment-renderer');
    const region = document.createElement('div');
    region.id = 'comment';
    region.appendChild(pendingHost);
    document.body.appendChild(region);

    platform.handleMutations([
      {
        type: 'childList',
        addedNodes: [pendingHost],
        removedNodes: [],
        target: region,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null
      } as unknown as MutationRecord
    ]);

    platform.dispose();
    vi.advanceTimersByTime(1000);

    expect(scheduleRestore).not.toHaveBeenCalled();
  });

  it('polls pending comment hosts until a shadow root becomes available', () => {
    vi.useFakeTimers();
    const context = createContext(document);
    const platform = new BilibiliVideoPlatform(context);
    const observer = new MutationObserver(() => undefined);
    platform.observeDomChanges(observer);

    const region = document.createElement('div');
    region.id = 'comment';
    const host = document.createElement('bili-rich-text');
    region.appendChild(host);
    document.body.appendChild(region);

    platform.handleMutations([
      {
        type: 'childList',
        addedNodes: [host],
        removedNodes: [],
        target: region,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null
      } as unknown as MutationRecord
    ]);

    vi.advanceTimersByTime(130);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<div class="rich-text-content">late shadow</div>';
    vi.advanceTimersByTime(400);

    expect(context.__mocks.ensureHighlightStyles).toHaveBeenCalledWith(root);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(root);
    expect(context.__mocks.observeWithFragmentObserver).toHaveBeenCalledWith(root, {
      childList: true,
      subtree: true
    });
    expect(context.__mocks.scheduleFragmentHighlightRestore).toHaveBeenCalled();
  });

  it('ignores shadow hosts that are outside comment regions', () => {
    const context = createContext(document);
    const platform = new BilibiliVideoPlatform(context);
    const observer = new MutationObserver(() => undefined);
    platform.observeDomChanges(observer);

    const host = document.createElement('bili-rich-text');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<div class="rich-text-content">outside region</div>';
    document.body.appendChild(host);

    platform.handleMutations([
      {
        type: 'childList',
        addedNodes: [host],
        removedNodes: [],
        target: document.body,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null
      } as unknown as MutationRecord
    ]);

    expect(context.__mocks.ensureHighlightStyles).not.toHaveBeenCalled();
    expect(context.__mocks.observeWithFragmentObserver).not.toHaveBeenCalled();
  });

  it('does not schedule restore for disconnected pending hosts', () => {
    vi.useFakeTimers();
    const scheduleRestore = vi.fn();
    const context = createContext(document);
    const platform = new BilibiliVideoPlatform(withScheduledRestore(context, scheduleRestore));
    const observer = new MutationObserver(() => undefined);
    platform.observeDomChanges(observer);

    const region = document.createElement('div');
    region.id = 'comment';
    const host = document.createElement('bili-comment-renderer');
    region.appendChild(host);
    document.body.appendChild(region);

    platform.handleMutations([
      {
        type: 'childList',
        addedNodes: [host],
        removedNodes: [],
        target: region,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null
      } as unknown as MutationRecord
    ]);
    host.remove();
    vi.advanceTimersByTime(600);

    expect(context.__mocks.ensureHighlightStyles).not.toHaveBeenCalled();
    expect(context.__mocks.observeWithFragmentObserver).not.toHaveBeenCalled();
    expect(scheduleRestore).toHaveBeenCalledTimes(1);
  });

  it('falls back to existing wrapper id when restoreHighlight cannot find text again', () => {
    const context = createContext(document);
    context.__mocks.getElementByIdDeep.mockReturnValue(null);
    context.__mocks.querySelectorDeep.mockReturnValue(null);
    const platform = new BilibiliVideoPlatform(context);

    const restored = platform.restoreHighlight({
      kind: 'fragment',
      id: 'fragment-missing',
      comment: '',
      selectedText: 'missing text',
      selectedHtml: '<p>missing text</p>',
      fragmentUrl: 'https://example.com/#:~:text=missing',
      createdAt: 1,
      wrapperId: 'missing-wrapper'
    });

    expect(restored).toBe('missing-wrapper');
  });

  it('returns null when no bilibili selection text can be resolved', () => {
    const platform = new BilibiliVideoPlatform(createContext(document));

    const result = platform.resolveSelection({
      range: null,
      selectedText: '   ',
      selectedHtml: '   '
    } as PlatformSelectionInput);

    expect(result).toBeNull();
    expect(platform.findTextRange('   ')).toBeNull();
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

  it('searches observed Bilibili comment roots before unrelated document shadow roots', () => {
    const targetText = 'scoped restore target';
    const unrelatedHost = document.createElement('bili-avatar');
    const unrelatedRoot = unrelatedHost.attachShadow({ mode: 'open' });
    unrelatedRoot.innerHTML = `<span>${targetText}</span>`;
    document.body.append(unrelatedHost);

    const { commentsHost, content } = mountBiliCommentWithRichText(`<span>${targetText}</span>`);
    const platform = new BilibiliVideoPlatform(createContext(document));
    const platformAny = platform as unknown as {
      ensureShadowHostObservation: (host: Element) => void;
    };
    platform.observeDomChanges({} as MutationObserver);
    platformAny.ensureShadowHostObservation(commentsHost);

    const range = platform.findTextRange(targetText);

    expect(range?.startContainer.getRootNode()).toBe(content.getRootNode());
    expect(range?.toString()).toBe(targetText);
  });

  it('does not restore from unrelated page body text outside Bilibili comment regions', () => {
    const targetText = 'outside body restore target';
    document.body.innerHTML = `<main><p>${targetText}</p></main>`;
    const platform = new BilibiliVideoPlatform(createContext(document));

    expect(platform.findTextRange(targetText)).toBeNull();
  });

  it('does not restore from unrelated page shadow roots outside Bilibili comment regions', () => {
    const targetText = 'outside shadow restore target';
    const host = document.createElement('section');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<p>${targetText}</p>`;
    document.body.append(host);
    const platform = new BilibiliVideoPlatform(createContext(document));

    expect(platform.findTextRange(targetText)).toBeNull();
  });

  it('does not restore from unrelated bili-rich-text shadow roots outside Bilibili comment regions', () => {
    const targetText = 'outside rich text target';
    const host = document.createElement('bili-rich-text');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<p>${targetText}</p>`;
    document.body.append(host);
    const platform = new BilibiliVideoPlatform(createContext(document));

    expect(platform.findTextRange(targetText)).toBeNull();
  });

  it('restores from bili-rich-text shadow roots inside legacy Bilibili comment containers', () => {
    const targetText = 'inside legacy comment rich text target';
    const wrapper = document.createElement('div');
    wrapper.id = 'comment';
    const host = document.createElement('bili-rich-text');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<p>${targetText}</p>`;
    wrapper.append(host);
    document.body.append(wrapper);
    const platform = new BilibiliVideoPlatform(createContext(document));
    const range = platform.findTextRange(targetText);

    expect(range?.toString()).toBe(targetText);
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

  it('returns null for invalid timestamp base urls and ignores unrelated mutations', () => {
    vi.useFakeTimers();
    const scheduleRestore = vi.fn();
    const platform = new BilibiliVideoPlatform(
      withScheduledRestore(createContext(document), scheduleRestore)
    );

    expect(
      platform.buildTimestampUrl(15, {
        canonicalUrl: 'not-a-url',
        currentUrl: 'still-bad',
        videoId: null
      })
    ).toBeNull();

    platform.handleMutations([
      {
        type: 'childList',
        addedNodes: [document.createElement('div')],
        removedNodes: [],
        target: document.body,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null
      } as unknown as MutationRecord
    ]);

    vi.advanceTimersByTime(110);
    expect(scheduleRestore).not.toHaveBeenCalled();
  });

  it('ignores non-comment hosts during mutation refresh and clears observer state on dispose', () => {
    vi.useFakeTimers();
    const context = createContext(document);
    const platform = new BilibiliVideoPlatform(context);
    const observer = {} as MutationObserver;

    platform.observeDomChanges(observer);
    platform.handleMutations([
      {
        type: 'childList',
        addedNodes: [document.createElement('section')],
        removedNodes: [],
        target: document.body,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null
      } as unknown as MutationRecord
    ]);

    expect(context.__mocks.scheduleFragmentHighlightRestore).not.toHaveBeenCalled();
    platform.dispose();
    vi.advanceTimersByTime(400);
    expect(context.__mocks.scheduleFragmentHighlightRestore).not.toHaveBeenCalled();
  });

  it('ignores Bilibili danmaku nodes for fragment observation', () => {
    const context = createContext(document);
    const platform = new BilibiliVideoPlatform(context);
    const observer = {} as MutationObserver;
    const danmaku = document.createElement('div');
    danmaku.className = 'bpx-player-render-dm-wrap';
    danmaku.innerHTML = '<span class="bili-danmaku-x-dm">dm</span>';
    document.body.appendChild(danmaku);

    platform.observeDomChanges(observer);
    platform.handleMutations([
      {
        type: 'childList',
        addedNodes: [danmaku],
        removedNodes: [],
        target: document.body,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null
      } as unknown as MutationRecord
    ]);

    expect(isBilibiliDanmakuNode(danmaku.querySelector('.bili-danmaku-x-dm'))).toBe(true);
    expect(isBilibiliCommentRegionNode(danmaku)).toBe(false);
    expect(context.__mocks.observeWithFragmentObserver).not.toHaveBeenCalled();
    expect(context.__mocks.scheduleFragmentHighlightRestore).not.toHaveBeenCalled();
  });

  it('returns undefined when restoreHighlight cannot resolve wrapper or text range', () => {
    const context = createContext(document);
    context.__mocks.getElementByIdDeep.mockReturnValue(null);
    const platform = new BilibiliVideoPlatform(context);

    const result = platform.restoreHighlight({
      id: 'missing-capture',
      fragmentUrl: '#missing-capture',
      selectedText: 'missing text',
      selectedHtml: '<p>missing text</p>',
      timestamp: 12,
      createdAt: Date.now()
    } as never);

    expect(result).toBeUndefined();
  });

  it('does not activate on non-bilibili hosts and preserves existing page param in timestamp urls', () => {
    const platform = new BilibiliVideoPlatform(createContext(document));

    expect(platform.shouldActivate({ location: { hostname: 'example.com' } } as Document)).toBe(
      false
    );
    expect(
      platform.buildTimestampUrl(45, {
        canonicalUrl: 'https://www.bilibili.com/video/BV1xx411c7mD?p=4',
        currentUrl: document.location.href,
        videoId: 'BV1xx411c7mD'
      })
    ).toBe('https://www.bilibili.com/video/BV1xx411c7mD?p=4&t=45');
  });

  it('returns undefined when highlight or restore cannot resolve a fragment target', () => {
    const context = createContext(document);
    context.__mocks.highlightSelection.mockReturnValue(undefined);
    context.__mocks.getElementByIdDeep.mockReturnValue(null);
    context.__mocks.querySelectorDeep.mockReturnValue(null);
    const platform = new BilibiliVideoPlatform(context);

    const range = document.createRange();
    const textNode = document.createTextNode('orphan text');
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.textContent?.length ?? 0);

    expect(
      platform.highlight(range, 'capture-missing', 'https://example.com/#:~:text=missing')
    ).toBeUndefined();
    expect(
      platform.restoreHighlight({
        kind: 'fragment',
        id: 'fragment-none',
        comment: '',
        selectedText: 'still missing',
        selectedHtml: '<p>still missing</p>',
        fragmentUrl: 'https://example.com/#:~:text=still%20missing',
        createdAt: 1
      })
    ).toBeUndefined();
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

  it('uses current url when canonical url is missing, keeps page param, and returns null for empty formatted titles', () => {
    const platform = new BilibiliVideoPlatform(createContext(document));
    const activeEpisode = document.createElement('div');
    activeEpisode.className = 'video-episode-card__entry is-active';
    activeEpisode.setAttribute('data-index', '0');
    document.body.appendChild(activeEpisode);

    expect(
      platform.buildTimestampUrl(33, {
        canonicalUrl: '',
        currentUrl: 'https://www.bilibili.com/video/BV1xx411c7mD?p=2',
        videoId: 'BV1xx411c7mD'
      })
    ).toBe('https://www.bilibili.com/video/BV1xx411c7mD?p=2&t=33');
    expect(platform.formatVideoTitle('____哔哩哔哩')).toBeNull();
  });

  it('keeps polling state stable for repeated pending hosts and ignores disconnected hosts before restore', () => {
    vi.useFakeTimers();
    const scheduleRestore = vi.fn();
    const platform = new BilibiliVideoPlatform(
      withScheduledRestore(createContext(document), scheduleRestore)
    );
    const host = document.createElement('bili-rich-text');
    const wrapper = document.createElement('div');
    wrapper.className = 'comment-wrap';
    wrapper.appendChild(host);
    document.body.appendChild(wrapper);

    const platformAny = platform as unknown as {
      ensureShadowHostObservation: (host: Element) => void;
    };

    platform.observeDomChanges({} as MutationObserver);
    platformAny.ensureShadowHostObservation(host);
    platformAny.ensureShadowHostObservation(host);
    host.remove();

    vi.advanceTimersByTime(2000);
    expect(scheduleRestore).not.toHaveBeenCalled();

    platform.handleMutations([
      {
        type: 'childList',
        addedNodes: [host],
        removedNodes: [],
        target: document.body,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null
      } as unknown as MutationRecord
    ]);
    vi.advanceTimersByTime(120);
    expect(scheduleRestore).toHaveBeenCalledTimes(1);
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

  it('restores existing fragment wrappers by data attribute when wrapper id is missing', () => {
    const context = createContext(document);
    context.__mocks.getElementByIdDeep.mockReturnValue(null);
    context.__mocks.querySelectorDeep.mockImplementation((selector: string) => {
      if (selector === 'mark[data-video-fragment-id="fragment-data-hit"]') {
        const wrapper = document.createElement('mark');
        wrapper.setAttribute('data-video-fragment-id', 'fragment-data-hit');
        return wrapper;
      }
      return null;
    });
    const platform = new BilibiliVideoPlatform(context);

    const restored = platform.restoreHighlight({
      kind: 'fragment',
      id: 'fragment-data-hit',
      comment: '',
      selectedText: 'unused',
      selectedHtml: '<p>unused</p>',
      fragmentUrl: 'https://example.com/#:~:text=unused',
      createdAt: 1
    });

    expect(restored).toBe('fragment-data-hit-wrapper');
    expect(context.__mocks.decorateHighlight).toHaveBeenCalledTimes(1);
    expect(context.__mocks.scheduleFragmentHighlightRestore).toHaveBeenCalledTimes(1);
  });

  it('drops pending shadow hosts after polling exhausts without a shadow root', () => {
    vi.useFakeTimers();
    const context = createContext(document);
    const platform = new BilibiliVideoPlatform(context);
    platform.observeDomChanges({} as MutationObserver);

    const wrapper = document.createElement('div');
    wrapper.id = 'comment';
    const host = document.createElement('bili-rich-text');
    wrapper.appendChild(host);
    document.body.appendChild(wrapper);

    platform.handleMutations([
      {
        type: 'childList',
        addedNodes: [host],
        removedNodes: [],
        target: wrapper,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null
      } as unknown as MutationRecord
    ]);

    vi.advanceTimersByTime(5000);

    expect(context.__mocks.ensureHighlightStyles).not.toHaveBeenCalled();
    expect(context.__mocks.observeWithFragmentObserver).not.toHaveBeenCalled();
  });

  it('falls back to text-range restore when wrapper lookup misses but text exists', () => {
    document.body.innerHTML = '<div id="comment"><p>Recovered fragment text</p></div>';
    const context = createContext(document);
    context.__mocks.getElementByIdDeep.mockReturnValue(null);
    context.__mocks.querySelectorDeep.mockReturnValue(null);
    context.__mocks.highlightSelection.mockReturnValue('restored-by-text');
    const platform = new BilibiliVideoPlatform(context);

    const restored = platform.restoreHighlight({
      kind: 'fragment',
      id: 'fragment-text-hit',
      comment: '',
      selectedText: 'Recovered fragment text',
      selectedHtml: '<p>Recovered fragment text</p>',
      fragmentUrl: 'https://example.com/#:~:text=Recovered%20fragment%20text',
      wrapperId: 'missing-wrapper',
      createdAt: 1
    });

    expect(restored).toBe('restored-by-text');
    expect(context.__mocks.highlightSelection).toHaveBeenCalledTimes(1);
    expect(context.__mocks.scheduleFragmentHighlightRestore).toHaveBeenCalledTimes(1);
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

  it('treats generic added nodes with comment descendants as potential hosts and schedules a single restore', () => {
    vi.useFakeTimers();
    const scheduleRestore = vi.fn();
    const context = createContext(document);
    const platform = new BilibiliVideoPlatform(withScheduledRestore(context, scheduleRestore));

    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<div class="comment-shell"><span class="comment-body">hello</span></div>';
    document.body.appendChild(wrapper);

    platform.handleMutations([
      {
        type: 'childList',
        addedNodes: [wrapper],
        removedNodes: [],
        target: document.body,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null
      } as unknown as MutationRecord
    ]);

    vi.advanceTimersByTime(120);
    expect(scheduleRestore).toHaveBeenCalledTimes(1);
  });

  it('keeps trimmed raw titles when bilibili suffix stripping does not apply', () => {
    const platform = new BilibiliVideoPlatform(createContext(document));
    expect(platform.formatVideoTitle('  Plain Raw Title  ')).toBe('Plain Raw Title');
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
