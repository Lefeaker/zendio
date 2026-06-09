/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FragmentHighlightCoordinator } from '@content/video/fragmentHighlightCoordinator';
import type { FragmentHighlighter } from '@content/video/fragmentHighlighter';
import { mutationRecord, asType, setGlobal } from '../../../utils/typeHelpers';
import type { VideoFragmentCapture } from '@content/video/types';

class TestMutationObserver extends MutationObserver {
  static instances: TestMutationObserver[] = [];
  public readonly observe = vi.fn();
  public readonly disconnect = vi.fn();

  constructor(public readonly callback: MutationCallback) {
    super(callback);
    TestMutationObserver.instances.push(this);
  }
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

describe('FragmentHighlightCoordinator', () => {
  let restoreMutationObserver: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    TestMutationObserver.instances = [];
    restoreMutationObserver = setGlobal('MutationObserver', TestMutationObserver);
    document.body.innerHTML = '<main></main>';
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    restoreMutationObserver?.();
    restoreMutationObserver = null;
    document.body.innerHTML = '';
  });

  it('does not start observation when there are no fragments to restore', () => {
    const coordinator = new FragmentHighlightCoordinator({
      doc: document,
      highlighter: asType<FragmentHighlighter>({
        getElementByIdDeep: vi.fn(),
        decorateElement: vi.fn()
      }),
      getFragments: () => [],
      ensureCaptureHighlight: vi.fn()
    });

    coordinator.start();

    expect(TestMutationObserver.instances).toHaveLength(0);
  });

  it('starts observing, forwards mutations to adapter, and schedules restore on childList changes when fragments exist', () => {
    const capture = createFragmentCapture({ id: 'frag-1', wrapperId: 'missing-wrapper' });
    const handleMutations = vi.fn();
    const observeDomChanges = vi.fn();
    const ensureCaptureHighlight = vi.fn();
    const highlighter = { getElementByIdDeep: vi.fn(() => null), decorateElement: vi.fn() };
    const coordinator = new FragmentHighlightCoordinator({
      doc: document,
      highlighter: asType<FragmentHighlighter>(highlighter),
      getFragments: () => [capture],
      ensureCaptureHighlight
    });

    coordinator.updateAdapter(asType({ handleMutations, observeDomChanges }));
    coordinator.start();

    const observer = TestMutationObserver.instances[0];
    expect(observer.observe).toHaveBeenCalledTimes(1);
    expect(observer.observe).toHaveBeenCalledWith(document.body, {
      childList: true,
      subtree: true
    });
    expect(observeDomChanges).toHaveBeenCalledWith(observer);

    observer.callback([mutationRecord({ type: 'childList' })], observer);
    expect(handleMutations).toHaveBeenCalled();
    vi.advanceTimersByTime(121);
    expect(ensureCaptureHighlight).toHaveBeenCalledWith(capture);
  });

  it('decorates existing connected highlight wrappers during restore', () => {
    const element = document.createElement('mark');
    document.body.appendChild(element);
    const decorateElement = vi.fn();
    const coordinator = new FragmentHighlightCoordinator({
      doc: document,
      highlighter: asType<FragmentHighlighter>({
        getElementByIdDeep: vi.fn(() => element),
        decorateElement
      }),
      getFragments: () => [createFragmentCapture({ id: 'frag-2', wrapperId: 'existing-wrapper' })],
      ensureCaptureHighlight: vi.fn()
    });

    coordinator.start();
    coordinator.scheduleRestore();
    vi.advanceTimersByTime(121);

    expect(decorateElement).toHaveBeenCalledWith(element);
  });

  it('debounces repeated restore scheduling into a single restore pass', () => {
    const capture = createFragmentCapture({ id: 'frag-debounce', wrapperId: 'missing' });
    const ensureCaptureHighlight = vi.fn();
    const coordinator = new FragmentHighlightCoordinator({
      doc: document,
      highlighter: asType<FragmentHighlighter>({
        getElementByIdDeep: vi.fn(() => null),
        decorateElement: vi.fn()
      }),
      getFragments: () => [capture],
      ensureCaptureHighlight
    });

    coordinator.start();
    coordinator.scheduleRestore();
    coordinator.scheduleRestore();
    coordinator.scheduleRestore();
    vi.advanceTimersByTime(119);

    expect(ensureCaptureHighlight).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2);

    expect(ensureCaptureHighlight).toHaveBeenCalledTimes(1);
    expect(ensureCaptureHighlight).toHaveBeenCalledWith(capture);
  });

  it('stops observation and clears pending restore timers', () => {
    const coordinator = new FragmentHighlightCoordinator({
      doc: document,
      highlighter: asType<FragmentHighlighter>({
        getElementByIdDeep: vi.fn(),
        decorateElement: vi.fn()
      }),
      getFragments: () => [createFragmentCapture({ id: 'frag-3' })],
      ensureCaptureHighlight: vi.fn()
    });

    coordinator.start();
    coordinator.scheduleRestore();
    const observer = TestMutationObserver.instances[0];

    coordinator.stop();
    vi.advanceTimersByTime(200);

    expect(observer.disconnect).toHaveBeenCalled();
  });

  it('stops observation when fragment captures disappear before a pending restore runs', () => {
    const fragments = [createFragmentCapture({ id: 'frag-stop', wrapperId: 'missing' })];
    const ensureCaptureHighlight = vi.fn();
    const coordinator = new FragmentHighlightCoordinator({
      doc: document,
      highlighter: asType<FragmentHighlighter>({
        getElementByIdDeep: vi.fn(() => null),
        decorateElement: vi.fn()
      }),
      getFragments: () => fragments,
      ensureCaptureHighlight
    });

    coordinator.start();
    coordinator.scheduleRestore();
    const observer = TestMutationObserver.instances[0];

    fragments.splice(0, fragments.length);
    coordinator.stopIfNoFragments();
    vi.advanceTimersByTime(200);

    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(ensureCaptureHighlight).not.toHaveBeenCalled();
  });

  it('lets platform adapters request scoped shadow-root observation through the coordinator observer', () => {
    const host = document.createElement('bili-rich-text');
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    const capture = createFragmentCapture({ id: 'frag-scope', wrapperId: 'missing' });
    const observeDomChanges = vi.fn();
    const coordinator = new FragmentHighlightCoordinator({
      doc: document,
      highlighter: asType<FragmentHighlighter>({
        getElementByIdDeep: vi.fn(),
        decorateElement: vi.fn()
      }),
      getFragments: () => [capture],
      ensureCaptureHighlight: vi.fn()
    });
    observeDomChanges.mockImplementation(() => {
      coordinator.observeWithCoordinator(root, { childList: true, subtree: true });
    });

    coordinator.updateAdapter(asType({ handleMutations: vi.fn(), observeDomChanges }));
    coordinator.start();

    const observer = TestMutationObserver.instances[0];
    expect(observer.observe).toHaveBeenNthCalledWith(1, document.body, {
      childList: true,
      subtree: true
    });
    expect(observer.observe).toHaveBeenNthCalledWith(2, root, {
      childList: true,
      subtree: true
    });
  });
});
