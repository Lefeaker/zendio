/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initClipFlow, queueNextClipAnalyticsSource } from '@content/runtime/clipFlow';
import type { ContentRuntimeState } from '@content/runtime/contentRuntimeState';
import type { ContentSelectionTracker } from '@content/runtime/contentSelectionTracker';
import type { SelectionPromptLifecycleHandlers } from '@content/runtime/clipFlowTypes';

type TrackUsageEventMessage = {
  type: 'ANALYTICS_EVENT';
  event: string;
  params?: Record<string, unknown>;
};

type SendMock = ReturnType<typeof vi.fn<(message: unknown) => Promise<void>>>;

function createSendMock(
  implementation: (message: unknown) => Promise<void> = () => Promise.resolve()
): SendMock {
  return vi.fn<(message: unknown) => Promise<void>>(implementation);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasMessageType(message: unknown, type: string): boolean {
  return isRecord(message) && message.type === type;
}

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

function getTrackEvents(send: SendMock): TrackUsageEventMessage[] {
  return send.mock.calls
    .map(([message]) => message)
    .filter(
      (message): message is TrackUsageEventMessage =>
        isRecord(message) && message.type === 'ANALYTICS_EVENT' && typeof message.event === 'string'
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
      messaging: { send: createSendMock() as never },
      runtimeState: createRuntimeState('selection'),
      selectionTracker: createSelectionTracker(createSelection()),
      selectionController: {
        handleSelectionClip: vi.fn(() => Promise.resolve(null)),
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
    const send = createSendMock();
    queueNextClipAnalyticsSource('menu');
    const flow = initClipFlow({
      document,
      messaging: { send: send as never },
      runtimeState: createRuntimeState('selection'),
      selectionTracker: createSelectionTracker(createSelection()),
      selectionController: {
        handleSelectionClip: vi.fn(
          (
            _document: Document,
            _url: string,
            _selection: Selection,
            promptLifecycle?: SelectionPromptLifecycleHandlers
          ) => {
            promptLifecycle?.onPromptSubmitted?.();
            return Promise.resolve({
              markdown: '# selected',
              type: 'clipper' as const
            });
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
      message: {
        key: 'supportProgressPreparingSelectionClip',
        fallback: 'Preparing selection clip'
      }
    });
    expect(send).toHaveBeenCalledWith({
      type: 'CLIP_RESULT',
      payload: { markdown: '# selected', type: 'clipper' }
    });

    const trackEvents = getTrackEvents(send);
    const operationId = trackEvents[0]?.params?.operation_id;
    expect(trackEvents.map((event) => event.event)).toEqual([
      'clip_started',
      'clip_prompt_opened',
      'clip_prompt_submitted',
      'extraction_completed'
    ]);
    expect(trackEvents[0]?.params?.operation_id).toEqual(
      expect.stringMatching(/^op_[a-z0-9]{6,24}$/)
    );
    expect(trackEvents[0]?.params).toMatchObject({
      source: 'menu',
      content_type: 'selection'
    });
    expect(trackEvents[1]?.params).toMatchObject({
      operation_id: operationId,
      content_type: 'selection'
    });
    expect(trackEvents[2]?.params).toMatchObject({
      operation_id: operationId,
      content_type: 'selection'
    });
    expect(trackEvents[3]?.params).toMatchObject({
      operation_id: operationId,
      content_type: 'selection',
      duration_bucket: 'under_100ms'
    });
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
    const send = createSendMock();
    const showSupportProgress = vi.fn();
    queueNextClipAnalyticsSource('toolbar');
    const extract = vi.fn(() =>
      Promise.resolve({
        markdown: '# article',
        type: 'article' as const
      })
    );
    const flow = initClipFlow({
      document,
      messaging: { send: send as never },
      runtimeState: createRuntimeState('full'),
      selectionTracker: createSelectionTracker(createSelection()),
      selectionController: {
        handleSelectionClip: vi.fn(),
        handleVideoSelectionClip: vi.fn()
      },
      extractorRegistry: { extract } as never,
      showSupportProgress
    });

    await flow.handleClip();

    expect(showSupportProgress).toHaveBeenCalledWith({
      value: 8,
      message: {
        key: 'supportProgressPreparingPageClip',
        fallback: 'Preparing page clip'
      }
    });
    expect(extract).toHaveBeenCalledWith({ url: location.href, document });
    expect(send).toHaveBeenCalledWith({
      type: 'CLIP_RESULT',
      payload: { markdown: '# article', type: 'article' }
    });

    const trackEvents = getTrackEvents(send);
    const operationId = trackEvents[0]?.params?.operation_id;
    expect(trackEvents.map((event) => event.event)).toEqual([
      'clip_started',
      'extraction_completed'
    ]);
    expect(trackEvents[0]?.params?.operation_id).toEqual(
      expect.stringMatching(/^op_[a-z0-9]{6,24}$/)
    );
    expect(trackEvents[0]?.params).toMatchObject({
      source: 'toolbar',
      content_type: 'article'
    });
    expect(trackEvents[1]?.params).toMatchObject({
      operation_id: operationId,
      content_type: 'article',
      duration_bucket: 'under_100ms'
    });
    expectPrivacySafeAnalytics(trackEvents);
  });

  it('emits extraction_failed analytics without displacing the existing clip error path', async () => {
    const send = createSendMock();
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
        extract: vi.fn(() =>
          Promise.reject(
            new Error(
              'Could not establish connection while clipping selected text: secret raw text'
            )
          )
        )
      } as never
    });

    await flow.handleClip();

    const trackEvents = getTrackEvents(send);
    const operationId = trackEvents[0]?.params?.operation_id;
    expect(trackEvents.map((event) => event.event)).toEqual(['clip_started', 'extraction_failed']);
    expect(trackEvents[0]?.params).toMatchObject({
      source: 'toolbar',
      content_type: 'article'
    });
    expect(trackEvents[1]?.params).toEqual({
      operation_id: operationId,
      content_type: 'article',
      failure_category: 'connection',
      duration_bucket: 'under_100ms'
    });
    expect(Object.keys(trackEvents[1]?.params ?? {}).sort()).toEqual([
      'content_type',
      'duration_bucket',
      'failure_category',
      'operation_id'
    ]);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CLIP_ERROR',
        error: expect.objectContaining({
          code: 'CONTENT_CLIP_FAILURE',
          domain: 'content'
        })
      })
    );
    expectPrivacySafeAnalytics(trackEvents);
  });

  it('emits canonical prompt cancellation without dispatching clip payloads', async () => {
    const send = createSendMock();
    const showSupportProgress = vi.fn();
    queueNextClipAnalyticsSource('menu');
    const flow = initClipFlow({
      document,
      messaging: { send: send as never },
      runtimeState: createRuntimeState('selection'),
      selectionTracker: createSelectionTracker(createSelection()),
      selectionController: {
        handleSelectionClip: vi.fn(
          (
            _document: Document,
            _url: string,
            _selection: Selection,
            promptLifecycle?: SelectionPromptLifecycleHandlers
          ) => {
            promptLifecycle?.onPromptCancelled?.();
            return Promise.resolve(null);
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
    expect(trackEvents.map((event) => event.event)).toEqual([
      'clip_started',
      'clip_prompt_opened',
      'clip_prompt_cancelled'
    ]);
    expect(trackEvents[0]?.params?.operation_id).toEqual(
      expect.stringMatching(/^op_[a-z0-9]{6,24}$/)
    );
    expect(trackEvents[0]?.params).toMatchObject({
      source: 'menu',
      content_type: 'selection'
    });
    expect(trackEvents[1]?.params).toMatchObject({
      operation_id: operationId,
      content_type: 'selection'
    });
    expect(trackEvents[2]?.params).toMatchObject({
      operation_id: operationId,
      content_type: 'selection'
    });
    expect(send).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CLIP_RESULT'
      })
    );
    expect(showSupportProgress).not.toHaveBeenCalled();
    expect(trackEvents.map((event) => event.event)).not.toContain('extraction_failed');
    expectPrivacySafeAnalytics(trackEvents);
  });

  it('does not let analytics transport failures block clip result dispatch', async () => {
    const send = createSendMock((message) => {
      if (hasMessageType(message, 'ANALYTICS_EVENT')) {
        return Promise.reject(new Error('analytics offline'));
      }
      return Promise.resolve();
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
        extract: vi.fn(() =>
          Promise.resolve({
            markdown: '# article',
            type: 'article' as const
          })
        )
      } as never
    });

    await expect(flow.handleClip()).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledWith({
      type: 'CLIP_RESULT',
      payload: { markdown: '# article', type: 'article' }
    });
  });
});
