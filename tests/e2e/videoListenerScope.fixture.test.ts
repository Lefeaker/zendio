/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureVideoControlBarButton,
  removeVideoControlBarButton
} from '../../src/content/video/videoControlBarButton';
import { findVideoControlTarget } from '../../src/content/video/videoPromptObserver';
import { SelectionCaptureController } from '../../src/content/video/selectionCaptureController';
import { VideoFragmentSelectionController } from '../../src/content/video/videoFragmentSelectionController';
import type { PendingSelectionTracker } from '../../src/content/video/pendingSelectionTracker';
import type { VideoPlatformAdapter } from '../../src/content/video/platforms';
import { asType, selection as mkSelection } from '../utils/typeHelpers';

function createRangeSelection(text = 'Selected text'): { range: Range; selection: Selection } {
  document.body.insertAdjacentHTML('beforeend', `<p id="selectable">${text}</p>`);
  const textNode = document.getElementById('selectable')?.firstChild;
  if (!(textNode instanceof Text)) {
    throw new Error('missing text node');
  }
  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, text.length);
  return {
    range,
    selection: mkSelection({
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => range,
      toString: () => text,
      removeAllRanges: vi.fn()
    })
  };
}

describe('video listener scope jsdom fixtures', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    vi.clearAllMocks();
  });

  it('inserts one YouTube control-bar logo and opens the panel from the logo', () => {
    document.body.innerHTML = '<div class="ytp-right-controls"></div>';
    const onPrimaryAction = vi.fn(() => {
      const panel = document.createElement('section');
      panel.dataset.stitchSurface = 'video';
      document.body.appendChild(panel);
    });

    expect(
      ensureVideoControlBarButton({
        doc: document,
        url: 'https://www.youtube.com/watch?v=abc',
        label: 'Clip video',
        shortcut: 'Alt+V',
        onPrimaryAction
      })
    ).toBe(true);

    const button = document.querySelector<HTMLButtonElement>(
      '[data-aiob-video-control-bar-button="true"]'
    );
    expect(button).toBeTruthy();
    expect(button?.classList.contains('aiob-video-control-bar-button--youtube')).toBe(true);
    expect(document.getElementById('aiob-video-control-bar-button-style')?.textContent).toContain(
      'translateY(2px)'
    );
    button?.click();
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-stitch-surface="video"]')).toBeTruthy();
  });

  it('keeps the Bilibili logo stable while danmaku nodes churn', () => {
    document.body.innerHTML =
      '<div class="bpx-player-control-bottom-right"></div><div class="bpx-player-render-dm-wrap"></div>';
    const onPrimaryAction = vi.fn();

    ensureVideoControlBarButton({
      doc: document,
      url: 'https://www.bilibili.com/video/BV1abc/',
      label: 'Clip video',
      shortcut: '',
      onPrimaryAction
    });

    const danmakuRoot = document.querySelector('.bpx-player-render-dm-wrap');
    for (let index = 0; index < 50; index += 1) {
      const dm = document.createElement('span');
      dm.className = 'bili-danmaku-x-dm';
      dm.textContent = `dm-${index}`;
      danmakuRoot?.appendChild(dm);
    }

    expect(document.querySelectorAll('[data-aiob-video-control-bar-button="true"]')).toHaveLength(
      1
    );
    const button = document.querySelector<HTMLButtonElement>(
      '[data-aiob-video-control-bar-button="true"]'
    );
    expect(button?.classList.contains('aiob-video-control-bar-button--bilibili')).toBe(true);
    expect(document.getElementById('aiob-video-control-bar-button-style')?.textContent).toContain(
      'width: 25px !important'
    );
    expect(findVideoControlTarget(document, 'https://www.bilibili.com/video/BV1abc/')).toBe(
      document.querySelector('.bpx-player-control-bottom-right')
    );
    expect(onPrimaryAction).not.toHaveBeenCalled();
  });

  it('ignores text selection until the configured modifier is active', () => {
    const { range, selection } = createRangeSelection('Modifier selected text');
    const pendingSelection = {
      capture: vi.fn(),
      consume: vi.fn((): Range | null => range),
      reset: vi.fn(),
      hasActiveRange: vi.fn(() => false),
      scheduleClear: vi.fn()
    };
    const onSelectionAccepted = vi.fn();
    const fragmentSelectionController = new VideoFragmentSelectionController(
      {
        doc: document,
        pendingSelection: asType<PendingSelectionTracker>(pendingSelection),
        getFragmentConfig: () => ({
          useFootnoteFormat: false,
          captureContext: true,
          contextLength: 100,
          contextMode: 'chars',
          selectionModifierEnabled: true,
          selectionModifierKeys: ['shift'],
          keyboardShortcutsEnabled: true
        }),
        getPlatformAdapter: () =>
          asType<VideoPlatformAdapter>({
            resolveSelection: vi.fn(() => ({
              text: 'Modifier selected text',
              html: '<p>Modifier selected text</p>',
              range
            }))
          })
      },
      { onSelectionAccepted }
    );
    const controller = new SelectionCaptureController({
      doc: document,
      pendingSelection: asType<PendingSelectionTracker>(pendingSelection),
      shouldTrackSelection: () => fragmentSelectionController.shouldTrackSelection(),
      suppressSelectionCapture: () => false,
      isRangeInsideUi: () => false,
      getDocumentSelection: () => selection,
      onSelectionActivated: (payload) =>
        fragmentSelectionController.processActivatedSelection(payload)
    });

    controller.start();
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    expect(pendingSelection.capture).not.toHaveBeenCalled();
    expect(onSelectionAccepted).not.toHaveBeenCalled();

    fragmentSelectionController.handleKeyDown(new KeyboardEvent('keydown', { shiftKey: true }));
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, shiftKey: true }));

    expect(pendingSelection.capture).toHaveBeenCalled();
    expect(onSelectionAccepted).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedText: 'Modifier selected text'
      })
    );
    controller.stop();
    removeVideoControlBarButton(document);
  });
});
