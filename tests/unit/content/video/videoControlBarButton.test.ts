/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureVideoControlBarButton } from '@content/video/videoControlBarButton';

function mountYoutubeControls(): HTMLElement {
  document.body.innerHTML = '<div class="ytp-right-controls"></div>';
  return document.querySelector<HTMLElement>('.ytp-right-controls')!;
}

describe('ensureVideoControlBarButton', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('opens a note-input popover without the legacy title or add button', () => {
    mountYoutubeControls();
    const onPrimaryAction = vi.fn();
    const onPopoverOpen = vi.fn();

    ensureVideoControlBarButton({
      doc: document,
      url: 'https://www.youtube.com/watch?v=abc123',
      label: '开启视频笔记',
      shortcut: '',
      preferences: {
        autoPauseEnabled: true,
        captureScreenshotEnabled: true
      },
      onPopoverOpen,
      onPrimaryAction
    });

    document.querySelector<HTMLButtonElement>('.aiob-video-control-bar-button')?.click();

    const popover = document.querySelector<HTMLElement>('.aiob-video-control-bar-popover');
    const input = popover?.querySelector<HTMLInputElement>(
      '.aiob-video-control-bar-popover__note-input'
    );
    expect(popover).toBeTruthy();
    expect(popover?.textContent).not.toContain('开启视频笔记');
    expect(popover?.textContent).not.toContain('添加视频笔记');
    expect(input).toBe(document.activeElement);
    expect(onPopoverOpen).toHaveBeenCalledWith({
      autoPauseEnabled: true,
      captureScreenshotEnabled: true
    });
    expect(document.getElementById('aiob-video-control-bar-button-style')?.textContent).toContain(
      'accent-color: var(--aiob-video-control-accent'
    );
  });

  it('submits the typed note on Enter with current preferences', () => {
    mountYoutubeControls();
    const onPrimaryAction = vi.fn();

    ensureVideoControlBarButton({
      doc: document,
      url: 'https://www.youtube.com/watch?v=abc123',
      label: '开启视频笔记',
      shortcut: '',
      preferences: {
        autoPauseEnabled: true,
        captureScreenshotEnabled: false
      },
      onPrimaryAction
    });

    document.querySelector<HTMLButtonElement>('.aiob-video-control-bar-button')?.click();
    const popover = document.querySelector<HTMLElement>('.aiob-video-control-bar-popover')!;
    const input = popover.querySelector<HTMLInputElement>(
      '.aiob-video-control-bar-popover__note-input'
    )!;
    input.value = 'important timestamp';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onPrimaryAction).toHaveBeenCalledWith(
      {
        autoPauseEnabled: true,
        captureScreenshotEnabled: false
      },
      {
        comment: 'important timestamp',
        source: 'note-input'
      }
    );
    expect(document.querySelector('.aiob-video-control-bar-popover')).toBeNull();
  });

  it('dismisses the popover on outside click and notifies the host with current preferences', () => {
    mountYoutubeControls();
    const onPrimaryAction = vi.fn();
    const onPopoverDismiss = vi.fn();

    ensureVideoControlBarButton({
      doc: document,
      url: 'https://www.youtube.com/watch?v=abc123',
      label: '开启视频笔记',
      shortcut: '',
      preferences: {
        autoPauseEnabled: true,
        captureScreenshotEnabled: true
      },
      onPopoverDismiss,
      onPrimaryAction
    });

    document.querySelector<HTMLButtonElement>('.aiob-video-control-bar-button')?.click();
    expect(document.querySelector('.aiob-video-control-bar-popover')).toBeTruthy();

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    expect(document.querySelector('.aiob-video-control-bar-popover')).toBeNull();
    expect(onPopoverDismiss).toHaveBeenCalledWith({
      autoPauseEnabled: true,
      captureScreenshotEnabled: true
    });
    expect(onPrimaryAction).not.toHaveBeenCalled();
  });
});
