/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SESSION_MESSAGES } from '@content/video/sessionMessages';
import { VideoSessionDomController } from '@content/video/sessionDom';
import { VideoSessionState } from '@content/video/sessionState';
import { VideoHintManager } from '@content/video/videoHintManager';
import type { VideoSessionView } from '@content/video/application/videoSessionView';

type TestView = VideoSessionView & {
  updateCount: ReturnType<typeof vi.fn>;
  setCaptures: ReturnType<typeof vi.fn>;
  updateHint: ReturnType<typeof vi.fn>;
  updateTexts: ReturnType<typeof vi.fn>;
  beginEditingCapture: ReturnType<typeof vi.fn>;
  stopEditing: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

function createView(): TestView {
  return {
    updateCount: vi.fn(),
    setCaptures: vi.fn(),
    updateHint: vi.fn(),
    updateTexts: vi.fn(),
    beginEditingCapture: vi.fn(),
    stopEditing: vi.fn(),
    destroy: vi.fn()
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

    controller.mountPanel({
      onAddCapture: vi.fn(),
      onFinish: vi.fn(),
      onCancel: vi.fn(),
      onDeleteCapture: vi.fn(),
      onSubmitCaptureEdit: vi.fn(),
      onFocusCapture: vi.fn()
    }, DEFAULT_SESSION_MESSAGES.panel);
    controller.syncPanel(state, (capture) => document.getElementById(capture.wrapperId ?? '') as HTMLElement | null);
    controller.applyHint('ready', state);

    expect(view.updateCount).toHaveBeenLastCalledWith(2);
    expect(view.setCaptures).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'timestamp-1', kind: 'timestamp' }),
      expect.objectContaining({ id: 'fragment-1', kind: 'fragment' })
    ]);
    expect(view.updateHint).toHaveBeenLastCalledWith(DEFAULT_SESSION_MESSAGES.hintReady);
  });
});
