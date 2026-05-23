/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { DEFAULT_SESSION_MESSAGES } from '@content/video/sessionMessages';
import { VideoSessionDomController } from '@content/video/sessionDom';
import { VideoSessionState } from '@content/video/sessionState';
import { VideoHintManager } from '@content/video/videoHintManager';
import type { VideoSessionView } from '@content/video/application/videoSessionView';

type TestView = VideoSessionView & {
  updateCount: Mock<VideoSessionView['updateCount']>;
  setCaptures: Mock<VideoSessionView['setCaptures']>;
  updateHint: Mock<VideoSessionView['updateHint']>;
  updateTexts: Mock<VideoSessionView['updateTexts']>;
  beginEditingCapture: Mock<VideoSessionView['beginEditingCapture']>;
  stopEditing: Mock<VideoSessionView['stopEditing']>;
  collapse: Mock<NonNullable<VideoSessionView['collapse']>>;
  destroy: Mock<VideoSessionView['destroy']>;
};

function createView(): TestView {
  return {
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
});
