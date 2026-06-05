import type { Messages } from '@i18n';
import { createVideoFloatingPromptSurfaceContent } from '@content/stitch/runtimeSurfaceContent';
import { renderStitchRuntimeSurface } from '@content/stitch/runtimeSurfaceRenderer';
import type { VideoPromptRuntimeTheme } from './videoPromptDependencies';
import type { DockedPlacement, PromptSide } from './videoPromptPosition';
import {
  computeTentativePosition,
  computeDockedPlacement,
  computeSnapSide,
  EDGE_MARGIN,
  DRAG_ACTIVATE_DISTANCE
} from './videoPromptPosition';

export interface PromptElementOptions {
  id: string;
  label: string;
  shortcut: string;
  messages: Messages;
  previewTheme?: VideoPromptRuntimeTheme;
  getIconUrl?: () => string | null;
  onPrimaryAction: () => void;
  onDismiss: () => void;
}

export interface PromptElementResult {
  container: HTMLElement;
  bubble: HTMLButtonElement;
}

export function createPromptElement(options: PromptElementOptions): PromptElementResult {
  const container = renderStitchRuntimeSurface({
    surfaceId: 'video-floating-prompt',
    ...(options.previewTheme ? { state: { previewTheme: options.previewTheme } } : {}),
    appData: createVideoFloatingPromptSurfaceContent({
      label: options.label,
      shortcut: options.shortcut,
      dismissLabel: options.messages.videoPromptDismiss
    }),
    actions: {
      'video-floating-prompt:primary': (event) => {
        const target =
          event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
        if (target?.dataset.ignoreClick === 'true') {
          target.dataset.ignoreClick = 'false';
          return;
        }
        options.onPrimaryAction();
      },
      'video-floating-prompt:dismiss': () => options.onDismiss()
    }
  });
  container.id = options.id;

  const bubble = container.querySelector<HTMLButtonElement>('.video-floating-prompt__bubble');
  if (!bubble) {
    throw new Error('Video floating prompt schema did not render a bubble action');
  }
  bubble.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    options.onDismiss();
  });

  const icon = container.querySelector<HTMLElement>('.video-floating-prompt__icon');
  try {
    const iconUrl = options.getIconUrl?.();
    if (iconUrl && icon) {
      icon.style.setProperty('--video-floating-prompt-icon', `url("${iconUrl}")`);
      icon.style.backgroundImage = `url("${iconUrl}")`;
    }
  } catch {
    // ignore runtime icon failures
  }

  return {
    container,
    bubble
  };
}

export interface DragHandlersOptions {
  container: HTMLElement;
  bubble: HTMLButtonElement;
  applySideClass: (element: HTMLElement, side: PromptSide) => void;
  setPromptSide: (side: PromptSide, element?: HTMLElement | null) => void;
  applyStoredPosition: (element: HTMLElement) => void;
  updateDebugValues: (
    values: Partial<{ elementTop: number | null; elementLeft: number | null; side: PromptSide }>
  ) => void;
  updateDebugPosition: () => void;
  onPositionCommitted: (placement: DockedPlacement) => void;
  savePromptPosition: () => void;
}

export function attachDragHandlers(options: DragHandlersOptions): void {
  const { container, bubble } = options;

  type DragState = {
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    width: number;
    height: number;
    moved: boolean;
  };

  let dragState: DragState | null = null;

  const handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    const rect = container.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      width: rect.width,
      height: rect.height,
      moved: false
    };
    try {
      bubble.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    container.classList.add(
      'video-floating-prompt--dragging',
      'video-floating-prompt--no-transition'
    );
    bubble.classList.add('video-floating-prompt__bubble--grabbing');
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;

    if (!dragState.moved) {
      const distance = Math.hypot(dx, dy);
      if (distance < DRAG_ACTIVATE_DISTANCE) {
        return;
      }
      dragState.moved = true;
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    }

    event.preventDefault();

    const viewportWidth = window.innerWidth || dragState.width + EDGE_MARGIN * 2;
    const viewportHeight = window.innerHeight || dragState.height + EDGE_MARGIN * 2;
    const { left: tentativeLeft, top: tentativeTop } = computeTentativePosition({
      originLeft: dragState.originLeft,
      originTop: dragState.originTop,
      deltaX: dx,
      deltaY: dy,
      viewportWidth,
      viewportHeight,
      width: dragState.width,
      height: dragState.height
    });

    container.style.left = `${tentativeLeft}px`;
    container.style.top = `${tentativeTop}px`;
    container.style.right = 'auto';
    container.style.bottom = 'auto';

    const tentativeSide = computeSnapSide(tentativeLeft, dragState.width, viewportWidth);
    options.applySideClass(container, tentativeSide);
    options.updateDebugValues({
      elementTop: tentativeTop,
      elementLeft: tentativeLeft,
      side: tentativeSide
    });
  };

  const handlePointerUp = (event: PointerEvent): void => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    if (
      typeof bubble.hasPointerCapture === 'function' &&
      bubble.hasPointerCapture(event.pointerId)
    ) {
      try {
        bubble.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }
    container.classList.remove(
      'video-floating-prompt--dragging',
      'video-floating-prompt--no-transition'
    );
    bubble.classList.remove('video-floating-prompt__bubble--grabbing');

    if (dragState.moved) {
      const rect = container.getBoundingClientRect();
      const viewportWidth = window.innerWidth || rect.width + EDGE_MARGIN * 2;
      const viewportHeight = window.innerHeight || rect.height + EDGE_MARGIN * 2;
      const placement = computeDockedPlacement({
        preferredSide: computeSnapSide(rect.left, rect.width, viewportWidth),
        tentativeLeft: rect.left,
        tentativeTop: rect.top,
        elementWidth: rect.width,
        elementHeight: rect.height,
        viewportWidth,
        viewportHeight
      });

      const hadAnimationSupport =
        typeof container.animate === 'function' &&
        !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

      options.onPositionCommitted(placement);
      options.setPromptSide(placement.side, container);
      container.style.top = `${placement.top}px`;
      container.style.bottom = 'auto';
      if (placement.side === 'left') {
        container.style.left = `${placement.left}px`;
        container.style.right = 'auto';
      } else {
        container.style.left = 'auto';
        container.style.right = `${placement.right ?? EDGE_MARGIN}px`;
      }

      if (hadAnimationSupport) {
        const finalRect = container.getBoundingClientRect();
        const deltaX = rect.left - finalRect.left;
        const deltaY = rect.top - finalRect.top;
        if (Math.hypot(deltaX, deltaY) > 0.5) {
          container.animate(
            [
              { transform: `translate(${deltaX}px, ${deltaY}px)` },
              { transform: 'translate(0, 0)' }
            ],
            {
              duration: 220,
              easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)'
            }
          );
        }
      }

      options.savePromptPosition();
      bubble.dataset.ignoreClick = 'true';
      window.setTimeout(() => {
        if (bubble.dataset.ignoreClick === 'true') {
          bubble.dataset.ignoreClick = 'false';
        }
      }, 0);
      options.updateDebugValues({
        elementTop: placement.top,
        elementLeft: placement.left,
        side: placement.side
      });
      options.updateDebugPosition();
    } else {
      options.applyStoredPosition(container);
      options.updateDebugPosition();
    }

    dragState = null;
  };

  bubble.addEventListener('pointerdown', handlePointerDown);
  bubble.addEventListener('pointermove', handlePointerMove);
  bubble.addEventListener('pointerup', handlePointerUp);
  bubble.addEventListener('pointercancel', handlePointerUp);
}

export function updatePromptLabels(root: HTMLElement, label: string, shortcut: string): void {
  const bubble = root.querySelector<HTMLButtonElement>('.video-floating-prompt__bubble');
  if (bubble) {
    bubble.setAttribute('aria-label', label);
  }
  const hint = root.querySelector<HTMLSpanElement>('.video-floating-prompt__hint');
  if (hint) {
    hint.dataset.baseTitle = label;
    const baseTitle = label || hint.dataset.baseTitle || hint.textContent || '';
    hint.textContent = shortcut ? `${baseTitle} · ${shortcut}` : baseTitle;
  }
}
