/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { DEFAULT_SESSION_MESSAGES } from '@content/video/sessionMessages';
import { VideoSessionDomController } from '@content/video/sessionDom';
import { VideoSessionState } from '@content/video/sessionState';
import { VideoHintManager } from '@content/video/videoHintManager';
import type { VideoSessionView } from '@content/video/application/videoSessionView';

type TestView = VideoSessionView & {
  element?: HTMLElement;
  snapshotCommentDrafts?: Mock<NonNullable<VideoSessionView['snapshotCommentDrafts']>>;
  hydrateCommentDrafts?: Mock<NonNullable<VideoSessionView['hydrateCommentDrafts']>>;
  updateCount: Mock<VideoSessionView['updateCount']>;
  setCaptures: Mock<VideoSessionView['setCaptures']>;
  updateHint: Mock<VideoSessionView['updateHint']>;
  updateTexts: Mock<VideoSessionView['updateTexts']>;
  beginEditingCapture: Mock<VideoSessionView['beginEditingCapture']>;
  stopEditing: Mock<VideoSessionView['stopEditing']>;
  collapse: Mock<NonNullable<VideoSessionView['collapse']>>;
  destroy: Mock<VideoSessionView['destroy']>;
};

function createView(
  overrides: {
    element?: HTMLElement;
    snapshotCommentDrafts?: Mock<NonNullable<VideoSessionView['snapshotCommentDrafts']>>;
    hydrateCommentDrafts?: Mock<NonNullable<VideoSessionView['hydrateCommentDrafts']>>;
  } = {}
): TestView {
  return {
    ...(overrides.element ? { element: overrides.element } : {}),
    ...(overrides.snapshotCommentDrafts
      ? { snapshotCommentDrafts: overrides.snapshotCommentDrafts }
      : {}),
    ...(overrides.hydrateCommentDrafts
      ? { hydrateCommentDrafts: overrides.hydrateCommentDrafts }
      : {}),
    updateCount: vi.fn<VideoSessionView['updateCount']>(),
    setCaptures: vi.fn<VideoSessionView['setCaptures']>(),
    updateHint: vi.fn<VideoSessionView['updateHint']>(),
    updateTexts: vi.fn<VideoSessionView['updateTexts']>(),
    beginEditingCapture: vi.fn<VideoSessionView['beginEditingCapture']>(),
    stopEditing: vi.fn<VideoSessionView['stopEditing']>(),
    collapse: vi.fn<NonNullable<VideoSessionView['collapse']>>(),
    destroy: vi.fn<VideoSessionView['destroy']>()
  };
}

describe('VideoSessionDomController', () => {
  it('registers and tears down interaction listeners', () => {
    const view = createView();
    const docAddSpy = vi.spyOn(document, 'addEventListener');
    const docRemoveSpy = vi.spyOn(document, 'removeEventListener');
    const blurAddSpy = vi.spyOn(window, 'addEventListener');
    const blurRemoveSpy = vi.spyOn(window, 'removeEventListener');
    const controller = new VideoSessionDomController(
      document,
      { createView: vi.fn(() => view) },
      new VideoHintManager(() => DEFAULT_SESSION_MESSAGES)
    );
    const handlers = {
      onMouseDown: vi.fn(),
      onKeyDown: vi.fn(),
      onKeyUp: vi.fn(),
      onWindowBlur: vi.fn()
    };

    controller.registerInteractionHandlers(handlers);
    controller.removeInteractionHandlers();

    expect(docAddSpy).toHaveBeenCalledWith('mousedown', handlers.onMouseDown, true);
    expect(docAddSpy).toHaveBeenCalledWith('keydown', handlers.onKeyDown, true);
    expect(docAddSpy).toHaveBeenCalledWith('keyup', handlers.onKeyUp, true);
    expect(blurAddSpy).toHaveBeenCalledWith('blur', handlers.onWindowBlur, true);
    expect(docRemoveSpy).toHaveBeenCalledWith('mousedown', handlers.onMouseDown, true);
    expect(docRemoveSpy).toHaveBeenCalledWith('keydown', handlers.onKeyDown, true);
    expect(docRemoveSpy).toHaveBeenCalledWith('keyup', handlers.onKeyUp, true);
    expect(blurRemoveSpy).toHaveBeenCalledWith('blur', handlers.onWindowBlur, true);
  });

  it('syncs panel ordering and hint text through the presenter boundary', () => {
    const view = createView();
    const controller = new VideoSessionDomController(
      document,
      { createView: vi.fn(() => view) },
      new VideoHintManager(() => DEFAULT_SESSION_MESSAGES)
    );
    const state = new VideoSessionState('gradient');
    state.videoElement = document.createElement('video');
    document.body.innerHTML = '<main><mark id="fragment-node"></mark></main>';
    state.captures = [
      {
        kind: 'timestamp',
        id: 'timestamp-1',
        timeSec: 12,
        comment: '',
        url: 'https://video.example/watch?t=12',
        createdAt: 1
      },
      {
        kind: 'fragment',
        id: 'fragment-1',
        comment: '',
        selectedText: 'Alpha fragment',
        selectedHtml: '<p>Alpha fragment</p>',
        fragmentUrl: 'https://video.example/watch#:~:text=Alpha',
        wrapperId: 'fragment-node',
        createdAt: 2
      }
    ];

    controller.mountPanel(
      {
        onAddCapture: vi.fn(),
        onFinish: vi.fn(),
        onCancel: vi.fn(),
        onDeleteCapture: vi.fn(),
        onSubmitCaptureEdit: vi.fn(),
        onToggleScreenshot: vi.fn(),
        onFocusCapture: vi.fn()
      },
      DEFAULT_SESSION_MESSAGES.panel
    );
    controller.syncPanel(state, (capture) => document.getElementById(capture.wrapperId ?? ''));
    controller.applyHint('ready', state);

    expect(view.updateCount).toHaveBeenLastCalledWith(2);
    expect(view.setCaptures).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'timestamp-1', kind: 'timestamp' }),
      expect.objectContaining({ id: 'fragment-1', kind: 'fragment' })
    ]);
    expect(view.updateHint).toHaveBeenLastCalledWith(DEFAULT_SESSION_MESSAGES.hintReady);
  });

  it('can mount the panel in a collapsed state before the first capture sync', () => {
    const view = createView();
    const controller = new VideoSessionDomController(
      document,
      { createView: vi.fn(() => view) },
      new VideoHintManager(() => DEFAULT_SESSION_MESSAGES)
    );

    controller.mountPanel(
      {
        onAddCapture: vi.fn(),
        onFinish: vi.fn(),
        onCancel: vi.fn(),
        onDeleteCapture: vi.fn(),
        onSubmitCaptureEdit: vi.fn(),
        onToggleScreenshot: vi.fn(),
        onFocusCapture: vi.fn()
      },
      DEFAULT_SESSION_MESSAGES.panel,
      { initialCollapsed: true }
    );

    expect(view.collapse).toHaveBeenCalledTimes(1);
    expect(view.collapse.mock.invocationCallOrder[0]).toBeLessThan(
      view.setCaptures.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
  });

  it('keeps unrelated draft state when another rendered capture input changes', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const captureOneInput = document.createElement('input');
    captureOneInput.dataset.captureInput = 'capture-1';
    captureOneInput.setAttribute('data-capture-input', 'capture-1');
    captureOneInput.value = 'capture 1 live edit';
    const captureFiveInput = document.createElement('input');
    captureFiveInput.dataset.captureInput = 'capture-5';
    captureFiveInput.setAttribute('data-capture-input', 'capture-5');
    captureFiveInput.value = 'Capture 5 saved preview...';
    shadow.append(captureOneInput, captureFiveInput);

    const view = createView({
      element: host,
      snapshotCommentDrafts: vi.fn(() => ({
        'capture-1': captureOneInput.value,
        'capture-5': 'Capture 5 full draft that must survive another input event.'
      }))
    });
    const controller = new VideoSessionDomController(
      document,
      { createView: vi.fn(() => view) },
      new VideoHintManager(() => DEFAULT_SESSION_MESSAGES)
    );
    const onChange = vi.fn();

    controller.mountPanel(
      {
        onAddCapture: vi.fn(),
        onFinish: vi.fn(),
        onCancel: vi.fn(),
        onDeleteCapture: vi.fn(),
        onSubmitCaptureEdit: vi.fn(),
        onToggleScreenshot: vi.fn(),
        onFocusCapture: vi.fn()
      },
      DEFAULT_SESSION_MESSAGES.panel
    );
    controller.setCommentDrafts({
      'capture-5': 'Capture 5 full draft that must survive another input event.'
    });
    controller.watchCommentDrafts(onChange);

    captureOneInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

    expect(onChange).toHaveBeenLastCalledWith({
      'capture-1': 'capture 1 live edit',
      'capture-5': 'Capture 5 full draft that must survive another input event.'
    });
  });

  it('forwards scoped stopEditing calls through the view boundary', () => {
    const view = createView();
    const controller = new VideoSessionDomController(
      document,
      { createView: vi.fn(() => view) },
      new VideoHintManager(() => DEFAULT_SESSION_MESSAGES)
    );

    controller.mountPanel(
      {
        onAddCapture: vi.fn(),
        onFinish: vi.fn(),
        onCancel: vi.fn(),
        onDeleteCapture: vi.fn(),
        onSubmitCaptureEdit: vi.fn(),
        onToggleScreenshot: vi.fn(),
        onFocusCapture: vi.fn()
      },
      DEFAULT_SESSION_MESSAGES.panel
    );

    controller.stopEditing('capture-1');

    expect(view.stopEditing).toHaveBeenCalledWith('capture-1');
  });
});
