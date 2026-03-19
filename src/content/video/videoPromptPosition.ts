export type PromptSide = 'left' | 'right';

export const EDGE_MARGIN = 24;
export const DRAG_BOUNDARY_PADDING = 12;
export const DRAG_ACTIVATE_DISTANCE = 3;

export function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function computeSnapSide(left: number, width: number, viewportWidth: number): PromptSide {
  const centerX = left + width / 2;
  return centerX < viewportWidth / 2 ? 'left' : 'right';
}

export interface TentativePositionInput {
  originLeft: number;
  originTop: number;
  deltaX: number;
  deltaY: number;
  viewportWidth: number;
  viewportHeight: number;
  width: number;
  height: number;
}

export function computeTentativePosition({
  originLeft,
  originTop,
  deltaX,
  deltaY,
  viewportWidth,
  viewportHeight,
  width,
  height
}: TentativePositionInput): { left: number; top: number } {
  const maxLeft = Math.max(DRAG_BOUNDARY_PADDING, viewportWidth - width - DRAG_BOUNDARY_PADDING);
  const maxTop = Math.max(DRAG_BOUNDARY_PADDING, viewportHeight - height - DRAG_BOUNDARY_PADDING);

  const nextLeft = clamp(originLeft + deltaX, DRAG_BOUNDARY_PADDING, maxLeft);
  const nextTop = clamp(originTop + deltaY, DRAG_BOUNDARY_PADDING, maxTop);

  return { left: nextLeft, top: nextTop };
}

export interface DockedPlacement {
  side: PromptSide;
  top: number;
  left: number;
  right: number | null;
}

export interface DockedPlacementInput {
  preferredSide?: PromptSide;
  tentativeLeft: number;
  tentativeTop: number;
  elementWidth: number;
  elementHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

export function computeDockedPlacement({
  preferredSide,
  tentativeLeft,
  tentativeTop,
  elementWidth,
  elementHeight,
  viewportWidth,
  viewportHeight
}: DockedPlacementInput): DockedPlacement {
  const maxLeft = Math.max(DRAG_BOUNDARY_PADDING, viewportWidth - elementWidth - DRAG_BOUNDARY_PADDING);
  const maxTop = Math.max(DRAG_BOUNDARY_PADDING, viewportHeight - elementHeight - DRAG_BOUNDARY_PADDING);
  const dockLeft = Math.max(DRAG_BOUNDARY_PADDING, EDGE_MARGIN);
  const dockRight = Math.max(DRAG_BOUNDARY_PADDING, EDGE_MARGIN);

  const clampedLeft = clamp(tentativeLeft, DRAG_BOUNDARY_PADDING, maxLeft);
  const clampedTop = clamp(tentativeTop, DRAG_BOUNDARY_PADDING, maxTop);

  let side: PromptSide;
  if (preferredSide === 'left' || preferredSide === 'right') {
    side = preferredSide;
  } else {
    side = computeSnapSide(clampedLeft, elementWidth, viewportWidth);
  }

  if (side === 'left') {
    const snappedLeft = clamp(dockLeft, DRAG_BOUNDARY_PADDING, maxLeft);
    return {
      side,
      top: clampedTop,
      left: snappedLeft,
      right: null
    };
  }

  const snappedLeft = clamp(viewportWidth - elementWidth - dockRight, DRAG_BOUNDARY_PADDING, maxLeft);
  const rightOffset = Math.max(DRAG_BOUNDARY_PADDING, viewportWidth - snappedLeft - elementWidth);
  return {
    side: 'right',
    top: clampedTop,
    left: snappedLeft,
    right: rightOffset
  };
}
