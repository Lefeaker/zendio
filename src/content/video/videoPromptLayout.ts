import {
  clamp,
  computeDockedPlacement,
  computeSnapSide,
  EDGE_MARGIN,
  DRAG_BOUNDARY_PADDING,
  type PromptSide
} from './videoPromptPosition';
export interface PromptLayoutState {
  left: number;
  top: number;
  side: PromptSide;
  hasCustomPosition: boolean;
}
export function createPromptLayoutState(): PromptLayoutState {
  return {
    left: EDGE_MARGIN,
    top: EDGE_MARGIN,
    side: 'right',
    hasCustomPosition: false
  };
}
export function setLayoutState(state: PromptLayoutState, patch: Partial<PromptLayoutState>): void {
  if (typeof patch.left === 'number') {
    state.left = patch.left;
  }
  if (typeof patch.top === 'number') {
    state.top = patch.top;
  }
  if (typeof patch.hasCustomPosition === 'boolean') {
    state.hasCustomPosition = patch.hasCustomPosition;
  }
  if (patch.side) {
    state.side = patch.side;
  }
}
export function getLayoutStateSnapshot(state: PromptLayoutState): PromptLayoutState {
  return { ...state };
}
export function applySideClass(element: HTMLDivElement, side: PromptSide): void {
  if (side === 'left') {
    element.classList.add('aiob-video-prompt--left');
    element.classList.remove('aiob-video-prompt--right');
    const hint = element.querySelector('.aiob-video-prompt__hint');
    if (hint) {
      hint.classList.remove('right-full', 'left-auto', '-translate-x-3');
      hint.classList.add('right-auto', 'left-full', 'translate-x-3');
    }
  } else {
    element.classList.add('aiob-video-prompt--right');
    element.classList.remove('aiob-video-prompt--left');
    const hint = element.querySelector('.aiob-video-prompt__hint');
    if (hint) {
      hint.classList.remove('right-auto', 'left-full', 'translate-x-3');
      hint.classList.add('right-full', 'left-auto', '-translate-x-3');
    }
  }
}
export function setPromptSide(
  state: PromptLayoutState,
  side: PromptSide,
  element: HTMLDivElement | null
): void {
  state.side = side;
  if (element) {
    applySideClass(element, side);
  }
}
export function applyStoredPosition(state: PromptLayoutState, element: HTMLDivElement): void {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth || rect.width + EDGE_MARGIN * 2;
  const viewportHeight = window.innerHeight || rect.height + EDGE_MARGIN * 2;
  if (state.hasCustomPosition) {
    const placement = computeDockedPlacement({
      preferredSide: state.side,
      tentativeLeft: state.left,
      tentativeTop: state.top,
      elementWidth: rect.width,
      elementHeight: rect.height,
      viewportWidth,
      viewportHeight
    });
    element.style.top = `${placement.top}px`;
    element.style.bottom = 'auto';
    if (placement.side === 'left') {
      element.style.left = `${placement.left}px`;
      element.style.right = 'auto';
    } else {
      element.style.left = 'auto';
      element.style.right = `${placement.right ?? EDGE_MARGIN}px`;
    }
    state.left = placement.left;
    state.top = placement.top;
    setPromptSide(state, placement.side, element);
  } else {
    element.style.left = 'auto';
    element.style.right = `${EDGE_MARGIN}px`;
    element.style.top = 'auto';
    element.style.bottom = `${EDGE_MARGIN}px`;
    const inferredLeft = viewportWidth - EDGE_MARGIN - rect.width;
    const inferredTop = viewportHeight - EDGE_MARGIN - rect.height;
    const maxLeft = Math.max(DRAG_BOUNDARY_PADDING, viewportWidth - rect.width - DRAG_BOUNDARY_PADDING);
    const maxTop = Math.max(DRAG_BOUNDARY_PADDING, viewportHeight - rect.height - DRAG_BOUNDARY_PADDING);
    state.left = clamp(inferredLeft, DRAG_BOUNDARY_PADDING, maxLeft);
    state.top = clamp(inferredTop, DRAG_BOUNDARY_PADDING, maxTop);
    setPromptSide(state, 'right', element);
  }
}
export function adjustLayoutForResize(state: PromptLayoutState, element: HTMLDivElement): void {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth || rect.width + EDGE_MARGIN * 2;
  const viewportHeight = window.innerHeight || rect.height + EDGE_MARGIN * 2;
  const maxLeft = Math.max(DRAG_BOUNDARY_PADDING, viewportWidth - rect.width - DRAG_BOUNDARY_PADDING);
  const maxTop = Math.max(DRAG_BOUNDARY_PADDING, viewportHeight - rect.height - DRAG_BOUNDARY_PADDING);
  if (state.hasCustomPosition) {
    state.left = clamp(state.left, DRAG_BOUNDARY_PADDING, maxLeft);
    state.top = clamp(state.top, DRAG_BOUNDARY_PADDING, maxTop);
  }
  applyStoredPosition(state, element);
}
export function deriveSideFromPosition(x: number): PromptSide {
  const viewportWidth =
    typeof window !== 'undefined' && window.innerWidth
      ? window.innerWidth
      : Math.max(x * 2 + EDGE_MARGIN * 2, EDGE_MARGIN * 4);
  return computeSnapSide(x, 0, viewportWidth);
}
