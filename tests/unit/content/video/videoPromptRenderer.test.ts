/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachDragHandlers, createPromptElement, updatePromptLabels } from '@content/video/videoPromptRenderer';
import type { Messages } from '../../../../src/i18n';
import { asType } from '../../../utils/typeHelpers';

const promptMessages = asType<Messages>({
  videoPromptTitle: 'Clip video',
  videoPromptDismiss: 'Dismiss'
});

function mockRect(target: Element, rect: Partial<DOMRect>) {
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    width: rect.width ?? 38,
    height: rect.height ?? 38,
    top: rect.top ?? 0,
    left: rect.left ?? 0,
    right: (rect.left ?? 0) + (rect.width ?? 38),
    bottom: (rect.top ?? 0) + (rect.height ?? 38),
    toJSON: () => ({})
  } as DOMRect);
}

describe('videoPromptRenderer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('creates prompt element, handles primary click, dismiss, and label updates', () => {
    const onPrimaryAction = vi.fn();
    const onDismiss = vi.fn();
    const { container, bubble } = createPromptElement({
      id: 'video-prompt',
      label: 'Clip video',
      shortcut: '⌘⇧V',
      messages: promptMessages,
      getIconUrl: () => '/icon.svg',
      onPrimaryAction,
      onDismiss
    });
    document.body.appendChild(container);

    bubble.click();
    bubble.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    updatePromptLabels(container, 'Capture now', 'Alt+V');
    const icon = container.querySelector<HTMLElement>('.aiob-video-prompt__icon');

    expect(onPrimaryAction).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
    expect(icon?.style.getPropertyValue('--aiob-video-prompt-icon')).toContain('/icon.svg');
    expect(icon?.style.backgroundImage).toContain('/icon.svg');
    expect(container.querySelector('.aiob-video-prompt__hint')?.textContent).toBe('Capture now · Alt+V');
  });

  it('renders the configured label as readable prompt text by default', () => {
    const { container } = createPromptElement({
      id: 'video-prompt',
      label: 'Quick clip',
      shortcut: 'Alt+Q',
      messages: promptMessages,
      onPrimaryAction: vi.fn(),
      onDismiss: vi.fn()
    });

    const bubble = container.querySelector<HTMLButtonElement>('.aiob-video-prompt__bubble');
    const hint = container.querySelector<HTMLSpanElement>('.aiob-video-prompt__hint');

    expect(bubble?.textContent).toContain('Quick clip');
    expect(hint).not.toBeNull();
    expect(hint?.dataset.baseTitle).toBe('Quick clip');
    expect(hint?.textContent).toBe('Quick clip · Alt+Q');
  });

  it('ignores runtime icon failures and ignores clicks immediately after drag commit', () => {
    const onPrimaryAction = vi.fn();
    const { container, bubble } = createPromptElement({
      id: 'video-prompt',
      label: 'Clip video',
      shortcut: '',
      messages: promptMessages,
      getIconUrl: () => { throw new Error('boom'); },
      onPrimaryAction,
      onDismiss: vi.fn()
    });
    bubble.dataset.ignoreClick = 'true';

    bubble.click();

    expect(onPrimaryAction).not.toHaveBeenCalled();
    expect(bubble.dataset.ignoreClick).toBe('false');
    expect(container.id).toBe('video-prompt');
  });

  it('attaches drag handlers and commits snapped position after drag', () => {
    const container = document.createElement('div');
    const bubble = document.createElement('button');
    container.appendChild(bubble);
    document.body.appendChild(container);
    mockRect(container, { left: 200, top: 100, width: 40, height: 40 });
    Object.defineProperty(container, 'animate', {
      configurable: true,
      value: vi.fn(() => ({} as Animation))
    });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));

    const applySideClass = vi.fn();
    const setPromptSide = vi.fn();
    const applyStoredPosition = vi.fn();
    const updateDebugValues = vi.fn();
    const updateDebugPosition = vi.fn();
    const onPositionCommitted = vi.fn();
    const savePromptPosition = vi.fn();

    attachDragHandlers({
      container,
      bubble,
      applySideClass,
      setPromptSide,
      applyStoredPosition,
      updateDebugValues,
      updateDebugPosition,
      onPositionCommitted,
      savePromptPosition
    });

    bubble.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 210, clientY: 110 }));
    bubble.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 260, clientY: 170 }));
    mockRect(container, { left: 248, top: 160, width: 40, height: 40 });
    bubble.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 260, clientY: 170 }));
    vi.runAllTimers();

    expect(applySideClass).toHaveBeenCalled();
    expect(onPositionCommitted).toHaveBeenCalled();
    expect(setPromptSide).toHaveBeenCalled();
    expect(savePromptPosition).toHaveBeenCalled();
    expect(updateDebugPosition).toHaveBeenCalled();
  });

  it('re-applies stored position when pointer up occurs without enough movement', () => {
    const container = document.createElement('div');
    const bubble = document.createElement('button');
    container.appendChild(bubble);
    document.body.appendChild(container);
    mockRect(container, { left: 50, top: 40, width: 40, height: 40 });

    const applyStoredPosition = vi.fn();
    const updateDebugPosition = vi.fn();

    attachDragHandlers({
      container,
      bubble,
      applySideClass: vi.fn(),
      setPromptSide: vi.fn(),
      applyStoredPosition,
      updateDebugValues: vi.fn(),
      updateDebugPosition,
      onPositionCommitted: vi.fn(),
      savePromptPosition: vi.fn()
    });

    bubble.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 3, clientX: 55, clientY: 45 }));
    bubble.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 3, clientX: 56, clientY: 46 }));
    bubble.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 3, clientX: 56, clientY: 46 }));

    expect(applyStoredPosition).toHaveBeenCalledWith(container);
    expect(updateDebugPosition).toHaveBeenCalled();
  });

  it('ignores non-primary pointer starts and keeps drag callbacks silent', () => {
    const container = document.createElement('div');
    const bubble = document.createElement('button');
    container.appendChild(bubble);
    document.body.appendChild(container);
    mockRect(container, { left: 20, top: 20, width: 40, height: 40 });

    const applyStoredPosition = vi.fn();
    const onPositionCommitted = vi.fn();
    const savePromptPosition = vi.fn();

    attachDragHandlers({
      container,
      bubble,
      applySideClass: vi.fn(),
      setPromptSide: vi.fn(),
      applyStoredPosition,
      updateDebugValues: vi.fn(),
      updateDebugPosition: vi.fn(),
      onPositionCommitted,
      savePromptPosition
    });

    bubble.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 1, pointerId: 9, clientX: 20, clientY: 20 }));
    bubble.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 1, pointerId: 9, clientX: 120, clientY: 120 }));

    expect(onPositionCommitted).not.toHaveBeenCalled();
    expect(savePromptPosition).not.toHaveBeenCalled();
    expect(applyStoredPosition).not.toHaveBeenCalled();
  });

});
