import type { Messages } from '../../i18n';
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
  getIconUrl?: () => string | null;
  onPrimaryAction: () => void;
  onDismiss: () => void;
}

export interface PromptElementResult {
  container: HTMLDivElement;
  bubble: HTMLButtonElement;
}

export function createPromptElement(options: PromptElementOptions): PromptElementResult {
  const container = document.createElement('div');
  container.id = options.id;
  container.className =
    'fixed bottom-6 right-6 z-[2147483645] pointer-events-none font-sans text-[#f5f6ff] overflow-visible transition-all duration-[0.24s] ease-[cubic-bezier(0.22,0.61,0.36,1)] group';

  const bubble = document.createElement('button');
  bubble.type = 'button';
  bubble.className =
    'aiob-video-prompt__bubble relative inline-flex min-h-[38px] max-w-[240px] items-center gap-2 rounded-full border-none px-[8px] py-[4px] pointer-events-auto bg-[#181c34]/96 cursor-grab touch-none shadow-[0_0_0_2px_rgba(124,92,255,0.45),0_0_18px_rgba(87,205,255,0.35)] transition-transform duration-250 ease-out isolate hover:-translate-y-[1px] hover:scale-[1.02] hover:shadow-[0_0_0_3px_rgba(124,92,255,0.55),0_0_24px_rgba(87,205,255,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7c5cff]/90 focus-visible:outline-offset-3 focus-visible:-translate-y-[1px] focus-visible:scale-[1.02] focus-visible:shadow-[0_0_0_3px_rgba(124,92,255,0.55),0_0_24px_rgba(87,205,255,0.45)] before:content-[""] before:absolute before:inset-[-8px] before:rounded-[inherit] before:bg-[radial-gradient(circle_at_50%_50%,rgba(124,92,255,0.32)_0%,rgba(87,205,255,0.12)_55%,rgba(47,51,92,0)_80%)] before:opacity-75 before:transition-opacity before:duration-250 before:ease-out before:-z-10 hover:before:opacity-100 focus-visible:before:opacity-100';
  bubble.dataset.ignoreClick = 'false';
  bubble.setAttribute('aria-label', options.label);
  bubble.addEventListener('click', () => {
    if (bubble.dataset.ignoreClick === 'true') {
      bubble.dataset.ignoreClick = 'false';
      return;
    }
    options.onPrimaryAction();
  });
  bubble.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    options.onDismiss();
  });

  const icon = document.createElement('span');
  icon.className =
    'aiob-video-prompt__icon shrink-0 w-[30px] h-[30px] rounded-full bg-[#1e2140]/90 bg-center bg-no-repeat bg-[length:70%]';

  const hint = document.createElement('span');
  hint.className =
    'aiob-video-prompt__hint min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold leading-4 tracking-[0.01em] text-[#f5f6ff]';
  hint.dataset.baseTitle = options.label;
  hint.textContent = options.shortcut
    ? `${options.label} · ${options.shortcut}`
    : options.label;

  try {
    const iconUrl = options.getIconUrl?.();
    if (iconUrl) {
      icon.style.setProperty('--aiob-video-prompt-icon', `url("${iconUrl}")`);
      icon.style.backgroundImage = `url("${iconUrl}")`;
    }
  } catch {
    // ignore runtime icon failures
  }
  bubble.append(icon, hint);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className =
    'aiob-video-prompt__close absolute -top-2 -right-2 w-5 h-5 rounded-full border-none p-0 bg-[#181c34]/95 text-[#f5f6ff] text-[14px] leading-5 text-center cursor-pointer shadow-[0_6px_14px_rgba(17,22,45,0.35)] opacity-0 scale-80 transition-all duration-200 ease-out pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:scale-100 group-focus-within:pointer-events-auto hover:bg-[#2d3458]/95 focus-visible:bg-[#2d3458]/95';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', options.messages.videoPromptDismiss);
  closeBtn.addEventListener('click', () => options.onDismiss());

  container.append(bubble, closeBtn);

  return {
    container,
    bubble
  };
}

export interface DragHandlersOptions {
  container: HTMLDivElement;
  bubble: HTMLButtonElement;
  applySideClass: (element: HTMLDivElement, side: PromptSide) => void;
  setPromptSide: (side: PromptSide, element?: HTMLDivElement | null) => void;
  applyStoredPosition: (element: HTMLDivElement) => void;
  updateDebugValues: (values: Partial<{ elementTop: number | null; elementLeft: number | null; side: PromptSide }>) => void;
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
    container.classList.add('aiob-video-prompt--dragging', 'transition-none');
    bubble.classList.add('transition-none', 'cursor-grabbing');
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
    if (typeof bubble.hasPointerCapture === 'function' && bubble.hasPointerCapture(event.pointerId)) {
      try {
        bubble.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }
    container.classList.remove('aiob-video-prompt--dragging', 'transition-none');
    bubble.classList.remove('transition-none', 'cursor-grabbing');

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
  const bubble = root.querySelector<HTMLButtonElement>('.aiob-video-prompt__bubble');
  if (bubble) {
    bubble.setAttribute('aria-label', label);
  }
  const hint = root.querySelector<HTMLSpanElement>('.aiob-video-prompt__hint');
  if (hint) {
    hint.dataset.baseTitle = label;
    const baseTitle = label || hint.dataset.baseTitle || hint.textContent || '';
    hint.textContent = shortcut ? `${baseTitle} · ${shortcut}` : baseTitle;
  }
}
