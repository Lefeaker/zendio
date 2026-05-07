/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FragmentHighlightCoordinator } from '@content/video/fragmentHighlightCoordinator';
import type { FragmentHighlighter } from '@content/video/fragmentHighlighter';
import { mutationRecord, asType } from '../../../utils/typeHelpers';
import type { VideoFragmentCapture } from '@content/video/types';

class TestMutationObserver {
  static instances: TestMutationObserver[] = [];
  public readonly observe = vi.fn();
  public readonly disconnect = vi.fn();

  constructor(public readonly callback: MutationCallback) {
    TestMutationObserver.instances.push(this);
  }
}

describe('FragmentHighlightCoordinator', () => {
  const originalObserver = globalThis.MutationObserver;

  beforeEach(() => {
    vi.useFakeTimers();
    TestMutationObserver.instances = [];
    // @ts-expect-error test shim
    globalThis.MutationObserver = TestMutationObserver;
    document.body.innerHTML = '<main></main>';
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    globalThis.MutationObserver = originalObserver;
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
    const capture = asType<VideoFragmentCapture>({ id: 'frag-1', wrapperId: 'missing-wrapper' });
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
    expect(observer.observe).toHaveBeenCalledWith(
      expect.any(Node),
      expect.objectContaining({ childList: true })
    );
    expect(observeDomChanges).toHaveBeenCalledWith(asType<MutationObserver>(observer));

    observer.callback([mutationRecord({ type: 'childList' })], asType(observer));
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
      getFragments: () => [{ id: 'frag-2', wrapperId: 'existing-wrapper' } as VideoFragmentCapture],
      ensureCaptureHighlight: vi.fn()
    });

    coordinator.start();
    coordinator.scheduleRestore();
    vi.advanceTimersByTime(121);

    expect(decorateElement).toHaveBeenCalledWith(element);
  });

  it('stops observation and clears pending restore timers', () => {
    const coordinator = new FragmentHighlightCoordinator({
      doc: document,
      highlighter: asType<FragmentHighlighter>({
        getElementByIdDeep: vi.fn(),
        decorateElement: vi.fn()
      }),
      getFragments: () => [{ id: 'frag-3' } as VideoFragmentCapture],
      ensureCaptureHighlight: vi.fn()
    });

    coordinator.start();
    coordinator.scheduleRestore();
    const observer = TestMutationObserver.instances[0];

    coordinator.stop();
    vi.advanceTimersByTime(200);

    expect(observer.disconnect).toHaveBeenCalled();
  });
});
