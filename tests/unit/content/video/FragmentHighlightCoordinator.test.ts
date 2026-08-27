/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FragmentHighlightCoordinator } from '@content/video/fragmentHighlightCoordinator';
import type { FragmentHighlighter } from '@content/video/fragmentHighlighter';
import type {
  DocumentMutationHubApi,
  DocumentMutationSubscriptionOptions
} from '@content/runtime/documentMutationTypes';
import { mutationRecord, asType } from '../../../utils/typeHelpers';
import type { VideoFragmentCapture } from '@content/video/types';
import type { VideoPlatformAdapter } from '@content/video/platforms';

function asNodeList(nodes: Node[]): NodeList {
  return nodes as unknown as NodeList;
}

function createFragmentCapture(
  overrides: Partial<VideoFragmentCapture> = {}
): VideoFragmentCapture {
  return {
    kind: 'fragment',
    id: 'frag-default',
    comment: '',
    selectedText: 'Selected text',
    selectedHtml: '<p>Selected text</p>',
    fragmentUrl: 'https://video.example/watch#:~:text=Selected%20text',
    createdAt: 1,
    ...overrides
  };
}

function createHubHarness(): {
  hub: DocumentMutationHubApi;
  subscribe: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  emit(records: MutationRecord[]): void;
  readOptions(): DocumentMutationSubscriptionOptions | null;
} {
  let options: DocumentMutationSubscriptionOptions | null = null;
  const dispose = vi.fn();
  const subscribe = vi.fn((nextOptions: DocumentMutationSubscriptionOptions) => {
    options = nextOptions;
    return dispose;
  });
  return {
    hub: { subscribe },
    subscribe,
    dispose,
    emit: (records) => {
      if (!options) return;
      const relevant = records.filter((record) => options?.filter(record));
      if (relevant.length > 0) options.callback(relevant);
    },
    readOptions: () => options
  };
}

describe('FragmentHighlightCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<main></main>';
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('does not subscribe when there are no fragments to restore', () => {
    const hub = createHubHarness();
    const coordinator = new FragmentHighlightCoordinator({
      documentMutationHub: hub.hub,
      highlighter: asType<FragmentHighlighter>({
        getElementByIdDeep: vi.fn(),
        decorateElement: vi.fn()
      }),
      getFragments: () => [],
      ensureCaptureHighlight: vi.fn()
    });

    coordinator.start();

    expect(hub.subscribe).not.toHaveBeenCalled();
  });

  it('subscribes once, rejects danmaku before coalescing, and restores relevant changes', () => {
    const capture = createFragmentCapture({ id: 'frag-1', wrapperId: 'missing-wrapper' });
    const hub = createHubHarness();
    const ensureCaptureHighlight = vi.fn();
    const coordinator = new FragmentHighlightCoordinator({
      documentMutationHub: hub.hub,
      highlighter: asType<FragmentHighlighter>({
        getElementByIdDeep: vi.fn(() => null),
        decorateElement: vi.fn()
      }),
      getFragments: () => [capture],
      ensureCaptureHighlight
    });
    const danmaku = document.createElement('div');
    danmaku.className = 'bpx-player-render-dm-wrap';

    coordinator.ensureStartedForFragments();
    coordinator.ensureStartedForFragments();
    hub.emit([mutationRecord({ type: 'childList', addedNodes: asNodeList([danmaku]) })]);
    expect(ensureCaptureHighlight).not.toHaveBeenCalled();

    hub.emit([
      mutationRecord({
        type: 'childList',
        addedNodes: asNodeList([document.createElement('article')])
      })
    ]);

    expect(hub.subscribe).toHaveBeenCalledTimes(1);
    expect(hub.readOptions()).toMatchObject({
      subscriberId: 'video-fragment-highlights',
      coalescingKey: 'restore',
      delayMs: 120
    });
    expect(ensureCaptureHighlight).toHaveBeenCalledWith(capture);
  });

  it('decorates existing connected highlight wrappers during restore', () => {
    const wrapper = document.createElement('mark');
    document.body.append(wrapper);
    const capture = createFragmentCapture({ id: 'frag-existing', wrapperId: 'wrapper-existing' });
    const hub = createHubHarness();
    const highlighter = {
      getElementByIdDeep: vi.fn(() => wrapper),
      decorateElement: vi.fn()
    };
    const coordinator = new FragmentHighlightCoordinator({
      documentMutationHub: hub.hub,
      highlighter: asType<FragmentHighlighter>(highlighter),
      getFragments: () => [capture],
      ensureCaptureHighlight: vi.fn()
    });

    coordinator.start();
    hub.emit([
      mutationRecord({
        type: 'childList',
        addedNodes: asNodeList([document.createElement('article')])
      })
    ]);

    expect(highlighter.decorateElement).toHaveBeenCalledWith(wrapper);
  });

  it('debounces explicit restore requests and cancels them on stop', async () => {
    const capture = createFragmentCapture({ id: 'frag-debounce', wrapperId: 'missing' });
    const ensureCaptureHighlight = vi.fn();
    const hub = createHubHarness();
    const coordinator = new FragmentHighlightCoordinator({
      documentMutationHub: hub.hub,
      highlighter: asType<FragmentHighlighter>({ getElementByIdDeep: vi.fn(() => null) }),
      getFragments: () => [capture],
      ensureCaptureHighlight
    });

    coordinator.start();
    coordinator.scheduleRestore();
    coordinator.scheduleRestore();
    coordinator.stop();
    await vi.advanceTimersByTimeAsync(120);

    expect(ensureCaptureHighlight).not.toHaveBeenCalled();
    expect(hub.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes the fragment subscriber when captures disappear before delivery', () => {
    const fragments = [createFragmentCapture({ id: 'frag-stop', wrapperId: 'missing' })];
    const hub = createHubHarness();
    const ensureCaptureHighlight = vi.fn();
    const coordinator = new FragmentHighlightCoordinator({
      documentMutationHub: hub.hub,
      highlighter: asType<FragmentHighlighter>({ getElementByIdDeep: vi.fn(() => null) }),
      getFragments: () => fragments,
      ensureCaptureHighlight
    });

    coordinator.start();
    fragments.splice(0, fragments.length);
    hub.emit([
      mutationRecord({
        type: 'childList',
        addedNodes: asNodeList([document.createElement('article')])
      })
    ]);

    expect(hub.dispose).toHaveBeenCalledTimes(1);
    expect(ensureCaptureHighlight).not.toHaveBeenCalled();
  });

  it('schedules one bounded restore when a new adapter becomes authoritative', async () => {
    const capture = createFragmentCapture({ id: 'frag-adapter', wrapperId: 'missing' });
    const ensureCaptureHighlight = vi.fn();
    const coordinator = new FragmentHighlightCoordinator({
      documentMutationHub: createHubHarness().hub,
      highlighter: asType<FragmentHighlighter>({ getElementByIdDeep: vi.fn(() => null) }),
      getFragments: () => [capture],
      ensureCaptureHighlight
    });

    coordinator.updateAdapter(asType<VideoPlatformAdapter>({ platform: 'bilibili' }));
    await vi.advanceTimersByTimeAsync(120);

    expect(ensureCaptureHighlight).toHaveBeenCalledWith(capture);
  });
});
