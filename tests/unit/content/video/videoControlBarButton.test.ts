/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureVideoControlBarButton } from '@content/video/videoControlBarButton';
import { toControlBarCaptureOptions } from '@content/video/videoPromptControlBarAdapter';
import { createVideoPromptControlTargetLifecycle } from '@content/video/videoPromptControlTargetLifecycle';

function queryRequired<T extends Element>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

function clickControlBarButton(): void {
  queryRequired<HTMLButtonElement>('.aiob-video-control-bar-button').click();
}

function getPopoverNoteInput(): { popover: HTMLElement; input: HTMLInputElement } {
  const popover = queryRequired<HTMLElement>('.aiob-video-control-bar-popover');
  return {
    popover,
    input: queryRequired<HTMLInputElement>('.aiob-video-control-bar-popover__note-input', popover)
  };
}

function mountYoutubeControls(): HTMLElement {
  document.body.innerHTML = '<div class="ytp-right-controls"></div>';
  return queryRequired<HTMLElement>('.ytp-right-controls');
}

function mountControlledVideo(initiallyPaused: boolean): {
  video: HTMLVideoElement;
  pauseSpy: ReturnType<typeof vi.fn>;
  playSpy: ReturnType<typeof vi.fn>;
  setPaused: (value: boolean) => void;
} {
  const video = document.createElement('video');
  let paused = initiallyPaused;
  Object.defineProperty(video, 'paused', {
    get: () => paused,
    configurable: true
  });
  const pauseSpy = vi.fn(() => {
    paused = true;
  });
  const playSpy = vi.fn(() => {
    paused = false;
    return Promise.resolve();
  });
  Object.defineProperty(video, 'pause', {
    value: pauseSpy,
    configurable: true
  });
  Object.defineProperty(video, 'play', {
    value: playSpy,
    configurable: true
  });
  document.body.appendChild(video);
  return {
    video,
    pauseSpy,
    playSpy,
    setPaused: (value: boolean): void => {
      paused = value;
    }
  };
}

function mountControlTargetLifecycle(
  preferences = {
    autoPauseEnabled: true,
    captureScreenshotEnabled: true
  }
): ReturnType<typeof createVideoPromptControlTargetLifecycle> {
  mountYoutubeControls();
  return createVideoPromptControlTargetLifecycle({
    getDocument: () => document,
    getWindow: () => window,
    getUrl: () => 'https://www.youtube.com/watch?v=abc123',
    getLabel: () => '开启视频笔记',
    getShortcut: () => '',
    getPreferences: () => preferences,
    setPreferences: vi.fn(),
    getIconUrl: () => null,
    onPrimaryAction: vi.fn(),
    onTargetObserved: vi.fn(),
    incrementSyncCount: vi.fn()
  });
}

describe('ensureVideoControlBarButton', () => {
  beforeEach(() => {
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
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

    clickControlBarButton();

    const { popover, input } = getPopoverNoteInput();
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
    const hostKeydown = vi.fn();
    document.addEventListener('keydown', hostKeydown);

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

    clickControlBarButton();
    const { input } = getPopoverNoteInput();
    input.value = 'important timestamp';
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    input.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(hostKeydown).not.toHaveBeenCalled();
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

    document.removeEventListener('keydown', hostKeydown);
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

    clickControlBarButton();
    const { input } = getPopoverNoteInput();

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

    clickControlBarButton();
    const hostCaptureKeydown = vi.fn();
    const hostCaptureKeyup = vi.fn();
    const hostCaptureKeypress = vi.fn();
    document.addEventListener('keydown', hostCaptureKeydown, true);
    document.addEventListener('keyup', hostCaptureKeyup, true);
    document.addEventListener('keypress', hostCaptureKeypress, true);
    const { input } = getPopoverNoteInput();

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

  it('keeps unowned Escape from reaching host page shortcuts', () => {
    mountYoutubeControls();
    const hostKeydown = vi.fn();
    const hostKeyup = vi.fn();
    const hostKeypress = vi.fn();
    document.addEventListener('keydown', hostKeydown);
    document.addEventListener('keyup', hostKeyup);
    document.addEventListener('keypress', hostKeypress);
    const onPrimaryAction = vi.fn();

    ensureVideoControlBarButton({
      doc: document,
      url: 'https://www.youtube.com/watch?v=abc123',
      label: '开启视频笔记',
      shortcut: '',
      preferences: {
        autoPauseEnabled: true,
        captureScreenshotEnabled: true
      },
      onPrimaryAction
    });

    clickControlBarButton();
    const { input } = getPopoverNoteInput();
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
      composed: true
    });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    input.dispatchEvent(event);
    input.dispatchEvent(
      new KeyboardEvent('keypress', { key: 'Escape', bubbles: true, composed: true })
    );
    input.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Escape', bubbles: true, composed: true })
    );

    expect(preventDefaultSpy).not.toHaveBeenCalled();
    expect(onPrimaryAction).not.toHaveBeenCalled();
    expect(hostKeydown).not.toHaveBeenCalled();
    expect(hostKeypress).not.toHaveBeenCalled();
    expect(hostKeyup).not.toHaveBeenCalled();
    expect(document.querySelector('.aiob-video-control-bar-popover')).toBeTruthy();

    document.removeEventListener('keydown', hostKeydown);
    document.removeEventListener('keyup', hostKeyup);
    document.removeEventListener('keypress', hostKeypress);
  });

  it('keeps unowned Escape from reaching later capture listeners', () => {
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

    clickControlBarButton();
    const hostCaptureKeydown = vi.fn();
    const hostCaptureKeyup = vi.fn();
    const hostCaptureKeypress = vi.fn();
    document.addEventListener('keydown', hostCaptureKeydown, true);
    document.addEventListener('keyup', hostCaptureKeyup, true);
    document.addEventListener('keypress', hostCaptureKeypress, true);
    const { input } = getPopoverNoteInput();

    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true })
    );
    input.dispatchEvent(
      new KeyboardEvent('keypress', { key: 'Escape', bubbles: true, composed: true })
    );
    input.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Escape', bubbles: true, composed: true })
    );

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

    clickControlBarButton();
    expect(document.querySelector('.aiob-video-control-bar-popover')).toBeTruthy();

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    expect(document.querySelector('.aiob-video-control-bar-popover')).toBeNull();
    expect(onPopoverDismiss).toHaveBeenCalledWith({
      autoPauseEnabled: true,
      captureScreenshotEnabled: true
    });
    expect(onPrimaryAction).not.toHaveBeenCalled();
  });

  it('notifies dismiss and removes the outside pointer listener when the button toggles the popover closed', () => {
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

    const button = queryRequired<HTMLButtonElement>('.aiob-video-control-bar-button');
    button.click();
    button.click();

    expect(document.querySelector('.aiob-video-control-bar-popover')).toBeNull();
    expect(onPopoverDismiss).toHaveBeenCalledTimes(1);
    expect(onPopoverDismiss).toHaveBeenCalledWith({
      autoPauseEnabled: true,
      captureScreenshotEnabled: true
    });

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    expect(onPopoverDismiss).toHaveBeenCalledTimes(1);
    expect(onPrimaryAction).not.toHaveBeenCalled();
  });

  it('restores playback on outside dismiss only when the popover paused a playing video', () => {
    const lifecycle = mountControlTargetLifecycle();
    const { pauseSpy, playSpy } = mountControlledVideo(false);

    lifecycle.syncButton();
    clickControlBarButton();

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).not.toHaveBeenCalled();

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('restores playback when the control-bar button toggles an open popover closed', () => {
    const lifecycle = mountControlTargetLifecycle();
    const { video, pauseSpy, playSpy, setPaused } = mountControlledVideo(false);

    lifecycle.syncButton();
    const button = queryRequired<HTMLButtonElement>('.aiob-video-control-bar-button');
    button.click();
    button.click();

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalledTimes(1);

    setPaused(false);
    video.dispatchEvent(new Event('play'));

    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it('does not resume an initially paused video after outside dismiss', () => {
    const lifecycle = mountControlTargetLifecycle();
    const { pauseSpy, playSpy } = mountControlledVideo(true);

    lifecycle.syncButton();
    clickControlBarButton();
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    expect(pauseSpy).not.toHaveBeenCalled();
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('re-pauses synthetic playback while the popover lease is active', () => {
    const lifecycle = mountControlTargetLifecycle();
    const { video, pauseSpy, setPaused } = mountControlledVideo(false);

    lifecycle.syncButton();
    clickControlBarButton();
    setPaused(false);
    video.dispatchEvent(new Event('play'));

    expect(pauseSpy).toHaveBeenCalledTimes(2);

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  });

  it('restores playback after submitting a popover note when auto pause paused playback', () => {
    const onPrimaryAction = vi.fn();
    mountYoutubeControls();
    const lifecycle = createVideoPromptControlTargetLifecycle({
      getDocument: () => document,
      getWindow: () => window,
      getUrl: () => 'https://www.youtube.com/watch?v=abc123',
      getLabel: () => '开启视频笔记',
      getShortcut: () => '',
      getPreferences: () => ({
        autoPauseEnabled: true,
        captureScreenshotEnabled: true
      }),
      setPreferences: vi.fn(),
      getIconUrl: () => null,
      onPrimaryAction,
      onTargetObserved: vi.fn(),
      incrementSyncCount: vi.fn()
    });
    const { pauseSpy, playSpy } = mountControlledVideo(false);

    lifecycle.syncButton();
    clickControlBarButton();
    const input = queryRequired<HTMLInputElement>('[data-aiob-video-control-bar-note-input="true"]');
    input.value = 'submit note';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(onPrimaryAction).toHaveBeenCalledWith(
      {
        autoPauseEnabled: true,
        captureScreenshotEnabled: true
      },
      {
        comment: 'submit note',
        source: 'note-input'
      }
    );
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps the popover playback lease active until an async primary action settles', async () => {
    let resolvePrimaryAction = (): void => {
      throw new Error('primary action promise was not initialized');
    };
    const primaryActionPromise = new Promise<void>((resolve) => {
      resolvePrimaryAction = () => resolve();
    });
    const onPrimaryAction = vi.fn(() => primaryActionPromise);
    mountYoutubeControls();
    const lifecycle = createVideoPromptControlTargetLifecycle({
      getDocument: () => document,
      getWindow: () => window,
      getUrl: () => 'https://www.youtube.com/watch?v=abc123',
      getLabel: () => '开启视频笔记',
      getShortcut: () => '',
      getPreferences: () => ({
        autoPauseEnabled: true,
        captureScreenshotEnabled: true
      }),
      setPreferences: vi.fn(),
      getIconUrl: () => null,
      onPrimaryAction,
      onTargetObserved: vi.fn(),
      incrementSyncCount: vi.fn()
    });
    const { video, pauseSpy, playSpy, setPaused } = mountControlledVideo(false);

    lifecycle.syncButton();
    clickControlBarButton();
    const input = document.querySelector<HTMLInputElement>(
      '[data-aiob-video-control-bar-note-input="true"]'
    );
    if (!input) {
      throw new Error('control-bar popover did not open');
    }
    input.value = 'submit note';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    setPaused(false);
    video.dispatchEvent(new Event('play'));

    expect(pauseSpy).toHaveBeenCalledTimes(2);
    expect(playSpy).not.toHaveBeenCalled();

    resolvePrimaryAction();
    await primaryActionPromise;
    await Promise.resolve();

    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('does not pause or resume while auto pause is disabled', () => {
    const lifecycle = mountControlTargetLifecycle({
      autoPauseEnabled: false,
      captureScreenshotEnabled: true
    });
    const { pauseSpy, playSpy } = mountControlledVideo(false);

    lifecycle.syncButton();
    clickControlBarButton();
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    expect(pauseSpy).not.toHaveBeenCalled();
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('does not ask the video session to resume playback for submitted control-bar notes', () => {
    expect(
      toControlBarCaptureOptions(
        {
          autoPauseEnabled: true,
          captureScreenshotEnabled: false
        },
        {
          comment: 'note',
          source: 'note-input'
        }
      )
    ).toEqual({
      comment: 'note',
      pauseVideo: false,
      captureScreenshot: false,
      beginEditing: false,
      resumePlayback: false,
      collapseAfterCapture: true
    });
  });
});
