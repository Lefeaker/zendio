/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initClipFlow, queueNextClipAnalyticsSource } from '@content/runtime/clipFlow';
import type { ContentRuntimeState } from '@content/runtime/contentRuntimeState';
import type { ContentSelectionTracker } from '@content/runtime/contentSelectionTracker';
import type { SelectionPromptLifecycleHandlers } from '@content/runtime/clipFlowTypes';

function createRuntimeState(mode: 'full' | 'selection'): ContentRuntimeState {
  let clipMode = mode;
  return {
    getClipMode: () => clipMode,
    setClipMode: (next) => {
      clipMode = next;
    },
    getFragmentClipperConfig: () => ({
      useFootnoteFormat: false,
      captureContext: false,
      contextLength: 0,
      contextMode: 'chars',
      selectionModifierEnabled: false,
      selectionModifierKeys: [],
      keyboardShortcutsEnabled: false
    }),
    getAutoSelectionInFlight: () => false,
    setAutoSelectionInFlight: vi.fn(),
    getModifierState: vi.fn() as never,
    isSelectionModifierActive: () => false,
    setSelectionModifierActive: vi.fn(),
    getLastSelectionSnapshot: () => null,
    setLastSelectionSnapshot: vi.fn(),
    resetSelectionTracking: vi.fn(),
    startOptionsLifecycle: vi.fn(),
    stopOptionsLifecycle: vi.fn(),
    refreshFragmentConfig: vi.fn(async () => undefined)
  };
}

function createSelectionTracker(selection: Selection): ContentSelectionTracker {
  return {
    resolveActiveSelection: vi.fn(() => ({ selection, root: document })),
    restoreSelectionFromSnapshot: vi.fn(() => null),
    getLastSelectionSnapshot: vi.fn(() => null),
    setLastSelectionSnapshot: vi.fn(),
    handleSelectionChange: vi.fn(),
    handleSelectStart: vi.fn(),
    captureSelectionSnapshot: vi.fn(),
    findActiveSelection: vi.fn(),
    isSelectionInsideUi: vi.fn(() => false),
    isSelectionEditable: vi.fn(() => false)
  } as never;
}

function createSelection(): Selection {
  return {
    rangeCount: 1,
    isCollapsed: false,
    toString: () => 'selected text'
  } as Selection;
}

function getTrackEvents(send: ReturnType<typeof vi.fn>) {
  return send.mock.calls
    .map(([message]) => message)
    .filter(
      (
        message
      ): message is {
        type: 'TRACK_USAGE_EVENT';
        event: string;
        params?: Record<string, unknown>;
      } => typeof message === 'object' && message !== null && message.type === 'TRACK_USAGE_EVENT'
    );
}

function expectPrivacySafeAnalytics(
  trackEvents: Array<{ event: string; params?: Record<string, unknown> }>
) {
  for (const event of trackEvents) {
    expect(event.params ?? {}).not.toHaveProperty('url');
    expect(event.params ?? {}).not.toHaveProperty('title');
    expect(event.params ?? {}).not.toHaveProperty('selectedText');
    expect(event.params ?? {}).not.toHaveProperty('selectedTextPreview');
    expect(event.params ?? {}).not.toHaveProperty('fragmentUrl');
    expect(event.params ?? {}).not.toHaveProperty('markdown');
    expect(event.params ?? {}).not.toHaveProperty('notePath');
    expect(event.params ?? {}).not.toHaveProperty('fileName');
  }
}

describe('clipFlow support progress', () => {
  beforeEach(() => {
    document.body.innerHTML = '<article>selected text</article>';
    window.history.replaceState(null, '', '/article');
  });

  it('does not show support progress while the selection dialog is only open or cancelled', async () => {
    const showSupportProgress = vi.fn();
    const flow = initClipFlow({
      document,
      messaging: { send: vi.fn() },
      runtimeState: createRuntimeState('selection'),
      selectionTracker: createSelectionTracker(createSelection()),
      selectionController: {
        handleSelectionClip: vi.fn(async () => null),
        handleVideoSelectionClip: vi.fn()
      },
      extractorRegistry: { extract: vi.fn() } as never,
      showSupportProgress
    });

    await flow.handleClip();

    expect(showSupportProgress).not.toHaveBeenCalled();
  });

  it('shows support progress only after a selection clip is confirmed', async () => {
    const showSupportProgress = vi.fn();
    const send = vi.fn(async () => undefined);
    queueNextClipAnalyticsSource('menu');
    const flow = initClipFlow({
      document,
      messaging: { send: send as never },
      runtimeState: createRuntimeState('selection'),
      selectionTracker: createSelectionTracker(createSelection()),
      selectionController: {
        handleSelectionClip: vi.fn(
          async (
            _document: Document,
            _url: string,
            _selection: Selection,
            promptLifecycle?: SelectionPromptLifecycleHandlers
          ) => {
            promptLifecycle?.onPromptSubmitted?.();
            return {
              markdown: '# selected',
              type: 'clipper'
            };
          }
        ),
        handleVideoSelectionClip: vi.fn()
      },
      extractorRegistry: { extract: vi.fn() } as never,
      showSupportProgress
    });

    await flow.handleClip();

    expect(showSupportProgress).toHaveBeenCalledWith({
      value: 16,
      label: '正在发送选区剪藏'
    });
    expect(send).toHaveBeenCalledWith({
      type: 'CLIP_RESULT',
      payload: { markdown: '# selected', type: 'clipper' }
    });

    const trackEvents = getTrackEvents(send);
    const operationId = trackEvents[0]?.params?.operation_id;
    expect(trackEvents).toEqual([
      expect.objectContaining({
        event: 'clip_started',
        params: expect.objectContaining({
          operation_id: expect.stringMatching(/^op_[a-z0-9]{6,24}$/),
          source: 'menu',
          content_type: 'selection'
        })
      }),
      expect.objectContaining({
        event: 'clip_prompt_opened',
        params: expect.objectContaining({
          operation_id: operationId,
          content_type: 'selection'
        })
      }),
      expect.objectContaining({
        event: 'clip_prompt_submitted',
        params: expect.objectContaining({
          operation_id: operationId,
          content_type: 'selection'
        })
      }),
      expect.objectContaining({
        event: 'extraction_completed',
        params: expect.objectContaining({
          operation_id: operationId,
          content_type: 'selection',
          duration_bucket: 'under_100ms'
        })
      })
    ]);
    expect(trackEvents.map((event) => event.event)).not.toEqual(
      expect.arrayContaining([
        'clip_cancelled',
        'clip_extraction_completed',
        'clip_dispatch_failed',
        'clip_action_requested'
      ])
    );
    expectPrivacySafeAnalytics(trackEvents);
  });

  it('dispatches full-page clips through the extractor registry and messaging service', async () => {
    const send = vi.fn(async () => undefined);
    queueNextClipAnalyticsSource('toolbar');
    const extract = vi.fn(async () => ({
      markdown: '# article',
      type: 'article'
    }));
    const flow = initClipFlow({
      document,
      messaging: { send: send as never },
      runtimeState: createRuntimeState('full'),
      selectionTracker: createSelectionTracker(createSelection()),
      selectionController: {
        handleSelectionClip: vi.fn(),
        handleVideoSelectionClip: vi.fn()
      },
      extractorRegistry: { extract } as never
    });

    await flow.handleClip();

    expect(extract).toHaveBeenCalledWith({ url: location.href, document });
    expect(send).toHaveBeenCalledWith({
      type: 'CLIP_RESULT',
      payload: { markdown: '# article', type: 'article' }
    });

    const trackEvents = getTrackEvents(send);
    const operationId = trackEvents[0]?.params?.operation_id;
    expect(trackEvents).toEqual([
      expect.objectContaining({
        event: 'clip_started',
        params: expect.objectContaining({
          operation_id: expect.stringMatching(/^op_[a-z0-9]{6,24}$/),
          source: 'toolbar',
          content_type: 'article'
        })
      }),
      expect.objectContaining({
        event: 'extraction_completed',
        params: expect.objectContaining({
          operation_id: operationId,
          content_type: 'article',
          duration_bucket: 'under_100ms'
        })
      })
    ]);
    expectPrivacySafeAnalytics(trackEvents);
  });

  it('emits canonical prompt cancellation without dispatching clip payloads', async () => {
    const send = vi.fn(async () => undefined);
    const showSupportProgress = vi.fn();
    queueNextClipAnalyticsSource('menu');
    const flow = initClipFlow({
      document,
      messaging: { send: send as never },
      runtimeState: createRuntimeState('selection'),
      selectionTracker: createSelectionTracker(createSelection()),
      selectionController: {
        handleSelectionClip: vi.fn(
          async (
            _document: Document,
            _url: string,
            _selection: Selection,
            promptLifecycle?: SelectionPromptLifecycleHandlers
          ) => {
            promptLifecycle?.onPromptCancelled?.();
            return null;
          }
        ),
        handleVideoSelectionClip: vi.fn()
      },
      extractorRegistry: { extract: vi.fn() } as never,
      showSupportProgress
    });

    await flow.handleClip();

    const trackEvents = getTrackEvents(send);
    const operationId = trackEvents[0]?.params?.operation_id;
    expect(trackEvents).toEqual([
      expect.objectContaining({
        event: 'clip_started',
        params: expect.objectContaining({
          operation_id: expect.stringMatching(/^op_[a-z0-9]{6,24}$/),
          source: 'menu',
          content_type: 'selection'
        })
      }),
      expect.objectContaining({
        event: 'clip_prompt_opened',
        params: expect.objectContaining({
          operation_id: operationId,
          content_type: 'selection'
        })
      }),
      expect.objectContaining({
        event: 'clip_prompt_cancelled',
        params: expect.objectContaining({
          operation_id: operationId,
          content_type: 'selection'
        })
      })
    ]);
    expect(send).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CLIP_RESULT'
      })
    );
    expect(showSupportProgress).not.toHaveBeenCalled();
    expectPrivacySafeAnalytics(trackEvents);
  });

  it('does not let analytics transport failures block clip result dispatch', async () => {
    const send = vi.fn(async (message: { type: string }) => {
      if (message.type === 'TRACK_USAGE_EVENT') {
        throw new Error('analytics offline');
      }
      return undefined;
    });
    queueNextClipAnalyticsSource('toolbar');
    const flow = initClipFlow({
      document,
      messaging: { send: send as never },
      runtimeState: createRuntimeState('full'),
      selectionTracker: createSelectionTracker(createSelection()),
      selectionController: {
        handleSelectionClip: vi.fn(),
        handleVideoSelectionClip: vi.fn()
      },
      extractorRegistry: {
        extract: vi.fn(async () => ({
          markdown: '# article',
          type: 'article'
        }))
      } as never
    });

    await expect(flow.handleClip()).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledWith({
      type: 'CLIP_RESULT',
      payload: { markdown: '# article', type: 'article' }
    });
  });
});
