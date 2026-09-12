/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireDocumentMutationHub,
  DocumentMutationHub
} from '@content/runtime/documentMutationHub';
import { mutationRecord, setGlobal } from '../../../utils/typeHelpers';
import type { DocumentMutationErrorReporter } from '@content/runtime/documentMutationTypes';

class RecordingMutationObserver extends MutationObserver {
  static instances: RecordingMutationObserver[] = [];
  public readonly observe = vi.fn();
  public readonly disconnect = vi.fn();

  constructor(public readonly callback: MutationCallback) {
    super(callback);
    RecordingMutationObserver.instances.push(this);
  }
}

describe('DocumentMutationHub', () => {
  let restoreMutationObserver: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    RecordingMutationObserver.instances = [];
    restoreMutationObserver = setGlobal('MutationObserver', RecordingMutationObserver);
    document.body.innerHTML = '<main id="root"></main>';
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    restoreMutationObserver?.();
    document.body.innerHTML = '';
  });

  it('acquires one hub identity per Document', () => {
    const otherDocument = document.implementation.createHTMLDocument('other');

    expect(acquireDocumentMutationHub(document)).toBe(acquireDocumentMutationHub(document));
    expect(acquireDocumentMutationHub(otherDocument)).not.toBe(
      acquireDocumentMutationHub(document)
    );
  });

  it('connects one body observer and disconnects only after the last idempotent disposer', () => {
    const hub = new DocumentMutationHub(document);
    const first = hub.subscribe({
      subscriberId: 'first',
      filter: () => true,
      callback: vi.fn()
    });
    const second = hub.subscribe({
      subscriberId: 'second',
      filter: () => true,
      callback: vi.fn()
    });
    const observer = RecordingMutationObserver.instances[0];

    expect(RecordingMutationObserver.instances).toHaveLength(1);
    expect(observer?.observe).toHaveBeenCalledWith(document.body, {
      childList: true,
      subtree: true
    });

    first();
    first();
    expect(observer?.disconnect).not.toHaveBeenCalled();
    second();
    second();
    expect(observer?.disconnect).toHaveBeenCalledTimes(1);
  });

  it('filters before independently coalescing each subscriber and key', async () => {
    const hub = new DocumentMutationHub(document);
    const callback = vi.fn<(records: readonly MutationRecord[]) => void>();
    const peerCallback = vi.fn();
    const firstTarget = document.createElement('div');
    firstTarget.id = 'first';
    const secondTarget = document.createElement('div');
    secondTarget.id = 'second';
    hub.subscribe({
      subscriberId: 'keyed',
      filter: (record) => record.type === 'childList',
      coalescingKey: (record) => (record.target as Element).id,
      delayMs: 20,
      callback
    });
    hub.subscribe({
      subscriberId: 'peer',
      filter: (record) => record.target === firstTarget,
      coalescingKey: 'peer',
      delayMs: 20,
      callback: peerCallback
    });
    const observer = RecordingMutationObserver.instances[0];
    const first = mutationRecord({ type: 'childList', target: firstTarget });
    const second = mutationRecord({ type: 'childList', target: secondTarget });

    observer?.callback([first, second], observer);
    observer?.callback([first], observer);
    await vi.advanceTimersByTimeAsync(20);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback.mock.calls.map(([records]) => records)).toEqual([[first, first], [second]]);
    expect(peerCallback).toHaveBeenCalledWith([first, first]);
  });

  it('isolates filter and callback failures without poisoning later delivery', async () => {
    const reportError = vi.fn<DocumentMutationErrorReporter>();
    const hub = new DocumentMutationHub(document, reportError);
    const filter = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('filter failed');
      })
      .mockReturnValue(true);
    const callback = vi
      .fn<(records: readonly MutationRecord[]) => void>()
      .mockImplementationOnce(() => {
        throw new Error('callback failed');
      });
    const peer = vi.fn();
    hub.subscribe({ subscriberId: 'unstable', filter, callback });
    hub.subscribe({ subscriberId: 'peer', filter: () => true, callback: peer });
    const observer = RecordingMutationObserver.instances[0];
    const record = mutationRecord({ type: 'childList' });

    observer?.callback([record], observer);
    await vi.advanceTimersByTimeAsync(0);
    expect(peer).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();

    observer?.callback([record], observer);
    await vi.advanceTimersByTimeAsync(0);
    observer?.callback([record], observer);
    await vi.advanceTimersByTimeAsync(0);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(peer).toHaveBeenCalledTimes(3);
    expect(reportError.mock.calls.map(([, context]) => context.phase)).toEqual([
      'filter',
      'callback'
    ]);
  });

  it('cancels queued work and ignores a late callback from a disconnected generation', async () => {
    const hub = new DocumentMutationHub(document);
    const callback = vi.fn();
    const dispose = hub.subscribe({
      subscriberId: 'late-work',
      filter: () => true,
      delayMs: 50,
      callback
    });
    const staleObserver = RecordingMutationObserver.instances[0];
    const record = mutationRecord({ type: 'childList' });

    staleObserver?.callback([record], staleObserver);
    dispose();
    await vi.advanceTimersByTimeAsync(50);
    staleObserver?.callback([record], staleObserver);
    await vi.advanceTimersByTimeAsync(50);

    expect(callback).not.toHaveBeenCalled();
    hub.subscribe({ subscriberId: 'replacement', filter: () => true, callback });
    expect(RecordingMutationObserver.instances).toHaveLength(2);
  });
});
