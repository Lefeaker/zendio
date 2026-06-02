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

  it('keeps ordinary note input keys from reaching host page shortcuts', () => {
    mountYoutubeControls();
    const hostKeydown = vi.fn();
    const hostKeyup = vi.fn();
    const hostKeypress = vi.fn();
    document.addEventListener('keydown', hostKeydown);
    document.addEventListener('keyup', hostKeyup);
    document.addEventListener('keypress', hostKeypress);

    ensureVideoControlBarButton({
      doc: document,
      url: 'https://www.youtube.com/watch?v=abc123',
      label: '开启视频笔记',
      shortcut: '',
      preferences: {
        autoPauseEnabled: true,
        captureScreenshotEnabled: true
      },
      onPrimaryAction: vi.fn()
    });

    document.querySelector<HTMLButtonElement>('.aiob-video-control-bar-button')?.click();
    const popover = document.querySelector<HTMLElement>('.aiob-video-control-bar-popover')!;
    const input = popover.querySelector<HTMLInputElement>(
      '.aiob-video-control-bar-popover__note-input'
    )!;

    for (const key of ['l', ' ', 'm']) {
      input.value = key;
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
      input.dispatchEvent(new KeyboardEvent('keypress', { key, bubbles: true, composed: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, composed: true }));
    }

    expect(hostKeydown).not.toHaveBeenCalled();
    expect(hostKeypress).not.toHaveBeenCalled();
    expect(hostKeyup).not.toHaveBeenCalled();
    expect(input.value).toBe('m');

    document.removeEventListener('keydown', hostKeydown);
    document.removeEventListener('keyup', hostKeyup);
    document.removeEventListener('keypress', hostKeypress);
  });

  it('keeps ordinary note input keys from reaching later capture listeners', () => {
    mountYoutubeControls();

    ensureVideoControlBarButton({
      doc: document,
      url: 'https://www.youtube.com/watch?v=abc123',
      label: '开启视频笔记',
      shortcut: '',
      preferences: {
        autoPauseEnabled: true,
        captureScreenshotEnabled: true
      },
      onPrimaryAction: vi.fn()
    });

    document.querySelector<HTMLButtonElement>('.aiob-video-control-bar-button')?.click();
    const hostCaptureKeydown = vi.fn();
    const hostCaptureKeyup = vi.fn();
    const hostCaptureKeypress = vi.fn();
    document.addEventListener('keydown', hostCaptureKeydown, true);
    document.addEventListener('keyup', hostCaptureKeyup, true);
    document.addEventListener('keypress', hostCaptureKeypress, true);
    const popover = document.querySelector<HTMLElement>('.aiob-video-control-bar-popover')!;
    const input = popover.querySelector<HTMLInputElement>(
      '.aiob-video-control-bar-popover__note-input'
    )!;

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true, composed: true }));
    input.dispatchEvent(new KeyboardEvent('keypress', { key: 'l', bubbles: true, composed: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'l', bubbles: true, composed: true }));

    expect(hostCaptureKeydown).not.toHaveBeenCalled();
    expect(hostCaptureKeypress).not.toHaveBeenCalled();
    expect(hostCaptureKeyup).not.toHaveBeenCalled();

    document.removeEventListener('keydown', hostCaptureKeydown, true);
    document.removeEventListener('keyup', hostCaptureKeyup, true);
    document.removeEventListener('keypress', hostCaptureKeypress, true);
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
