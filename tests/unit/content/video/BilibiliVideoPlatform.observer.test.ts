/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BilibiliVideoPlatform } from '@content/video/platforms/bilibiliPlatform';
import {
  BilibiliShadowObserver,
  isBilibiliCommentRegionNode,
  isBilibiliDanmakuNode
} from '@content/video/platforms/bilibiliPlatformObserver';
import {
  createContext,
  mountBiliCommentsFixture,
  withScheduledRestore
} from './bilibiliVideoPlatformFixtures';
import { asType, mutationRecord } from '../../../utils/typeHelpers';
import { FragmentHighlightCoordinator } from '@content/video/fragmentHighlightCoordinator';
import type { FragmentHighlighter } from '@content/video/fragmentHighlighter';
import type { VideoFragmentCapture } from '@content/video/types';

describe('BilibiliVideoPlatform observer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = '';
    vi.useRealTimers();
  });

  it('keeps comment-host body discovery separate from global restore ownership', () => {
    vi.useFakeTimers();
    const scheduleRestore = vi.fn();
    const context = withScheduledRestore(createContext(document), scheduleRestore);
    new BilibiliVideoPlatform(context);

    context.__mocks.emitDocumentMutations([
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
    expect(scheduleRestore).not.toHaveBeenCalled();
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
    expect(observeWithFragmentObserver).toHaveBeenCalledWith(expect.any(Object), commentRoot, {
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

  it('discovers a late nested comment root through the one scoped observer with zero fragments', () => {
    const context = createContext(document);
    const outer = document.createElement('bili-comments');
    const outerRoot = outer.attachShadow({ mode: 'open' });
    document.body.append(outer);
    const observer = new BilibiliShadowObserver(document, context);
    const nested = document.createElement('bili-comment-renderer');
    const nestedRoot = nested.attachShadow({ mode: 'open' });
    outerRoot.append(nested);

    context.__mocks.emitScopedMutations([
      mutationRecord({
        type: 'childList',
        addedNodes: outerRoot.childNodes,
        target: outerRoot
      })
    ]);

    expect(context.__mocks.scopedObservers).toHaveLength(1);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(nestedRoot);
    expect(observer.getObservedCommentRootsForSearch()).toContain(nestedRoot);
  });

  it('routes non-danmaku scoped-root churn through the bounded fragment restore owner', () => {
    const scheduleRestore = vi.fn();
    const context = withScheduledRestore(createContext(document), scheduleRestore);
    const outer = document.createElement('bili-comments');
    const root = outer.attachShadow({ mode: 'open' });
    document.body.append(outer);
    new BilibiliShadowObserver(document, context);
    const replacement = document.createElement('span');
    root.append(replacement);

    context.__mocks.emitScopedMutations([
      mutationRecord({
        type: 'childList',
        addedNodes: root.childNodes,
        target: root
      })
    ]);

    expect(scheduleRestore).toHaveBeenCalledTimes(1);
  });

  it('registers Bilibili comment shadow roots for selection even without fragment captures', () => {
    const context = createContext(document);
    const { commentsHost, root, thread, comment, richText } = mountBiliCommentsFixture();
    const observer = new BilibiliShadowObserver(document, context);

    observer.ensureObservedRoots();

    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(root);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(thread.shadowRoot);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(comment.shadowRoot);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(richText.shadowRoot);
    commentsHost.remove();
    expect(observer.getObservedCommentRootsForSearch()).toEqual([]);
    expect(context.__mocks.unregisterShadowSelectionBridge).toHaveBeenCalledWith(root);
    expect(context.__mocks.unregisterShadowSelectionBridge).toHaveBeenCalledWith(thread.shadowRoot);
    expect(context.__mocks.unregisterShadowSelectionBridge).toHaveBeenCalledWith(
      comment.shadowRoot
    );
    expect(context.__mocks.unregisterShadowSelectionBridge).toHaveBeenCalledWith(
      richText.shadowRoot
    );
    const registeredRootCount = context.__mocks.registerShadowSelectionBridge.mock.calls.length;
    observer.dispose();
    observer.dispose();
    const lateHost = document.createElement('bili-comment-renderer');
    lateHost.attachShadow({ mode: 'open' });
    root.append(lateHost);
    context.__mocks.emitScopedMutations([
      mutationRecord({
        type: 'childList',
        addedNodes: root.childNodes,
        target: root
      })
    ]);
    expect(context.__mocks.scopedObservers[0]?.disconnect).toHaveBeenCalledTimes(2);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledTimes(
      registeredRootCount
    );
  });

  it('unregisters detached roots and registers the same root again after reconnect', async () => {
    vi.useFakeTimers();
    const context = createContext(document);
    const host = document.createElement('bili-comment-renderer');
    const root = host.attachShadow({ mode: 'open' });
    document.body.append(host);
    const platform = new BilibiliVideoPlatform(context);

    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(root);
    host.remove();
    const removedHost = document.createDocumentFragment();
    removedHost.append(host);
    context.__mocks.emitDocumentMutations([
      mutationRecord({
        type: 'childList',
        removedNodes: removedHost.childNodes,
        target: document.body
      })
    ]);
    await vi.advanceTimersByTimeAsync(100);
    expect(context.__mocks.unregisterShadowSelectionBridge).toHaveBeenCalledWith(root);

    document.body.append(host);
    context.__mocks.emitDocumentMutations([
      mutationRecord({
        type: 'childList',
        addedNodes: document.body.childNodes,
        target: document.body
      })
    ]);
    await vi.advanceTimersByTimeAsync(100);

    expect(context.__mocks.scopedObservers).toHaveLength(1);
    expect(
      context.__mocks.registerShadowSelectionBridge.mock.calls.filter(
        ([registeredRoot]) => registeredRoot === root
      )
    ).toHaveLength(2);
    platform.dispose();
    expect(
      context.__mocks.unregisterShadowSelectionBridge.mock.calls.filter(
        ([unregisteredRoot]) => unregisteredRoot === root
      )
    ).toHaveLength(2);
  });

  it('observes late-attached Bilibili shadow roots through scoped polling', () => {
    vi.useFakeTimers();
    const context = createContext(document);
    const observer = new BilibiliShadowObserver(document, context);
    const region = document.createElement('div');
    region.id = 'comment';
    const host = document.createElement('bili-rich-text');
    region.appendChild(host);
    document.body.appendChild(region);

    observer.ensureShadowHostObservationForTests(host);

    vi.advanceTimersByTime(130);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<div class="rich-text-content">late observer shadow</div>';
    vi.advanceTimersByTime(200);

    expect(context.__mocks.ensureHighlightStyles).toHaveBeenCalledWith(root);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(root);
    expect(context.__mocks.observeWithFragmentObserver).toHaveBeenCalledWith(
      expect.any(Object),
      root,
      {
        childList: true,
        subtree: true
      }
    );
  });

  it('discovers a shadow root that appears in the final attempt-20 polling window', () => {
    vi.useFakeTimers();
    const context = createContext(document);
    const observer = new BilibiliShadowObserver(document, context);
    const region = document.createElement('div');
    region.id = 'comment';
    const host = document.createElement('bili-rich-text');
    region.append(host);
    document.body.append(region);

    observer.ensureShadowHostObservationForTests(host);
    vi.advanceTimersByTime(3160);
    const root = host.attachShadow({ mode: 'open' });
    root.textContent = 'final polling window';
    vi.advanceTimersByTime(160);

    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(root);
    expect(context.__mocks.observeWithFragmentObserver).toHaveBeenCalledWith(
      expect.any(Object),
      root,
      { childList: true, subtree: true }
    );
  });

  it('cancels pending late-shadow polling work when the observer is disposed', () => {
    vi.useFakeTimers();
    const context = createContext(document);
    const observer = new BilibiliShadowObserver(document, context);
    const region = document.createElement('div');
    region.id = 'comment';
    const host = document.createElement('bili-comment-renderer');
    region.appendChild(host);
    document.body.appendChild(region);

    observer.ensureShadowHostObservationForTests(host);
    observer.dispose();

    vi.advanceTimersByTime(130);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<div class="rich-text-content">disposed late shadow</div>';
    vi.advanceTimersByTime(500);

    expect(context.__mocks.ensureHighlightStyles).not.toHaveBeenCalled();
    expect(context.__mocks.registerShadowSelectionBridge).not.toHaveBeenCalled();
    expect(context.__mocks.observeWithFragmentObserver).not.toHaveBeenCalled();
  });

  it('removes completed shadow-host timeout handles before later dispose runs', () => {
    vi.useFakeTimers();
    const context = createContext(document);
    const observer = new BilibiliShadowObserver(document, context);
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const region = document.createElement('div');
    region.id = 'comment';
    const host = document.createElement('bili-rich-text');
    region.appendChild(host);
    document.body.appendChild(region);

    observer.ensureShadowHostObservationForTests(host);

    vi.advanceTimersByTime(130);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<div class="rich-text-content">cleanup shadow</div>';
    vi.advanceTimersByTime(200);

    observer.dispose();

    expect(context.__mocks.ensureHighlightStyles).toHaveBeenCalledWith(root);
    expect(clearTimeoutSpy).not.toHaveBeenCalled();
  });

  it('lets the platform proactively register Bilibili selection shadow roots on session start', () => {
    const context = createContext(document);
    const { root, richText } = mountBiliCommentsFixture();
    const platform = new BilibiliVideoPlatform(context);

    platform.observeSelectionRoots();

    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(root);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(richText.shadowRoot);
    expect(context.__mocks.observeWithFragmentObserver).toHaveBeenCalledWith(
      expect.any(Object),
      root,
      {
        childList: true,
        subtree: true
      }
    );
  });

  it('routes complete nested Bilibili host add and replacement through one restore owner', async () => {
    vi.useFakeTimers();
    const context = createContext(document);
    const capture: VideoFragmentCapture = {
      kind: 'fragment',
      id: 'fragment-body-record',
      comment: '',
      selectedText: 'fixture comment',
      selectedHtml: '<p>fixture comment</p>',
      fragmentUrl: 'https://example.com/#:~:text=fixture%20comment',
      wrapperId: 'missing-wrapper',
      createdAt: 1
    };
    const ensureCaptureHighlight = vi.fn();
    const coordinator = new FragmentHighlightCoordinator({
      documentMutationHub: context.documentMutationHub,
      highlighter: asType<FragmentHighlighter>({ getElementByIdDeep: vi.fn(() => null) }),
      getFragments: () => [capture],
      ensureCaptureHighlight
    });
    const scheduleRestore = vi.spyOn(coordinator, 'scheduleRestore');
    withScheduledRestore(
      context,
      vi.fn(() => coordinator.scheduleRestore())
    );
    coordinator.start();
    new BilibiliVideoPlatform(context);
    const initial = mountBiliCommentsFixture();

    context.__mocks.emitDocumentMutations([
      mutationRecord({
        type: 'childList',
        addedNodes: document.body.childNodes,
        target: document.body
      })
    ]);
    await vi.advanceTimersByTimeAsync(100);
    expect(scheduleRestore).toHaveBeenCalledTimes(1);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(initial.root);
    expect(ensureCaptureHighlight).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    expect(ensureCaptureHighlight).toHaveBeenCalledWith(capture);

    scheduleRestore.mockClear();
    ensureCaptureHighlight.mockClear();
    initial.commentsHost.remove();
    const removedHost = document.createDocumentFragment();
    removedHost.append(initial.commentsHost);
    const replacement = mountBiliCommentsFixture();
    context.__mocks.emitDocumentMutations([
      mutationRecord({
        type: 'childList',
        addedNodes: document.body.childNodes,
        removedNodes: removedHost.childNodes,
        target: document.body
      })
    ]);
    await vi.advanceTimersByTimeAsync(100);
    expect(scheduleRestore).toHaveBeenCalledTimes(1);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(replacement.root);
    await vi.advanceTimersByTimeAsync(20);
    expect(ensureCaptureHighlight).toHaveBeenCalledTimes(1);
  });

  it('does not refresh comment roots for danmaku-only mutation bursts', () => {
    vi.useFakeTimers();
    const scheduleRestore = vi.fn();
    const context = createContext(document);
    new BilibiliVideoPlatform(withScheduledRestore(context, scheduleRestore));
    const region = document.createElement('div');
    region.id = 'comment';
    const commentHost = document.createElement('bili-comment-renderer');
    commentHost.attachShadow({ mode: 'open' });
    region.append(commentHost);
    document.body.append(region);
    const danmakuWrap = document.createElement('div');
    danmakuWrap.className = 'bpx-player-render-dm-wrap';
    for (let index = 0; index < 20; index += 1) {
      const danmaku = document.createElement('span');
      danmaku.className = 'bili-danmaku-x-dm';
      danmaku.textContent = `dm-${index}`;
      danmakuWrap.append(danmaku);
    }
    document.body.append(danmakuWrap);

    context.__mocks.emitDocumentMutations([
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

    const pendingHost = document.createElement('bili-comment-renderer');
    const region = document.createElement('div');
    region.id = 'comment';
    region.appendChild(pendingHost);
    document.body.appendChild(region);

    baseContext.__mocks.emitDocumentMutations([
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
    new BilibiliVideoPlatform(context);
    const region = document.createElement('div');
    region.id = 'comment';
    const host = document.createElement('bili-rich-text');
    region.appendChild(host);
    document.body.appendChild(region);

    context.__mocks.emitDocumentMutations([
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
    expect(context.__mocks.observeWithFragmentObserver).toHaveBeenCalledWith(
      expect.any(Object),
      root,
      {
        childList: true,
        subtree: true
      }
    );
    expect(context.__mocks.scheduleFragmentHighlightRestore).toHaveBeenCalled();
  });

  it('ignores shadow hosts that are outside comment regions', () => {
    const context = createContext(document);
    new BilibiliVideoPlatform(context);
    const host = document.createElement('bili-rich-text');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<div class="rich-text-content">outside region</div>';
    document.body.appendChild(host);

    context.__mocks.emitDocumentMutations([
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
    new BilibiliVideoPlatform(withScheduledRestore(context, scheduleRestore));
    const region = document.createElement('div');
    region.id = 'comment';
    const host = document.createElement('bili-comment-renderer');
    region.appendChild(host);
    document.body.appendChild(region);

    context.__mocks.emitDocumentMutations([
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
    expect(scheduleRestore).not.toHaveBeenCalled();
  });

  it('ignores non-comment hosts during mutation refresh and clears observer state on dispose', () => {
    vi.useFakeTimers();
    const context = createContext(document);
    const platform = new BilibiliVideoPlatform(context);
    context.__mocks.emitDocumentMutations([
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
    new BilibiliVideoPlatform(context);
    const danmaku = document.createElement('div');
    danmaku.className = 'bpx-player-render-dm-wrap';
    danmaku.innerHTML = '<span class="bili-danmaku-x-dm">dm</span>';
    document.body.appendChild(danmaku);

    context.__mocks.emitDocumentMutations([
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

  it('keeps polling state stable for repeated pending hosts and ignores disconnected hosts before restore', () => {
    vi.useFakeTimers();
    const scheduleRestore = vi.fn();
    const context = withScheduledRestore(createContext(document), scheduleRestore);
    const platform = new BilibiliVideoPlatform(context);
    const host = document.createElement('bili-rich-text');
    const wrapper = document.createElement('div');
    wrapper.className = 'comment-wrap';
    wrapper.appendChild(host);
    document.body.appendChild(wrapper);

    const platformAny = platform as unknown as {
      ensureShadowHostObservation: (host: Element) => void;
    };

    platformAny.ensureShadowHostObservation(host);
    platformAny.ensureShadowHostObservation(host);
    host.remove();

    vi.advanceTimersByTime(2000);
    expect(scheduleRestore).not.toHaveBeenCalled();

    context.__mocks.emitDocumentMutations([
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
    expect(scheduleRestore).not.toHaveBeenCalled();
  });

  it('drops pending shadow hosts after polling exhausts without a shadow root', () => {
    vi.useFakeTimers();
    const context = createContext(document);
    const observer = new BilibiliShadowObserver(document, context);
    const wrapper = document.createElement('div');
    wrapper.id = 'comment';
    const host = document.createElement('bili-rich-text');
    wrapper.appendChild(host);
    document.body.appendChild(wrapper);

    observer.ensureShadowHostObservationForTests(host);
    vi.advanceTimersByTime(3320);
    const root = host.attachShadow({ mode: 'open' });
    vi.advanceTimersByTime(1000);

    expect(context.__mocks.ensureHighlightStyles).not.toHaveBeenCalled();
    expect(context.__mocks.observeWithFragmentObserver).not.toHaveBeenCalled();
    observer.ensureShadowHostObservationForTests(host);
    expect(context.__mocks.registerShadowSelectionBridge).toHaveBeenCalledWith(root);
  });

  it('treats generic added nodes with comment descendants as discovery-only body work', () => {
    vi.useFakeTimers();
    const scheduleRestore = vi.fn();
    const context = createContext(document);
    new BilibiliVideoPlatform(withScheduledRestore(context, scheduleRestore));

    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<div class="comment-shell"><span class="comment-body">hello</span></div>';
    document.body.appendChild(wrapper);

    context.__mocks.emitDocumentMutations([
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
    expect(scheduleRestore).not.toHaveBeenCalled();
  });
});
