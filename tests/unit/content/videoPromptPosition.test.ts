/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import { __videoPromptTestUtils } from '@content/video/videoPromptTestHarness';

const {
  clamp,
  computeTentativePosition,
  computeSnapSide,
  applySideClass,
  setPromptSide,
  computeDockedPlacement,
  EDGE_MARGIN,
  DRAG_BOUNDARY_PADDING,
  DRAG_ACTIVATE_DISTANCE
} = __videoPromptTestUtils;

describe('video prompt positioning helpers', () => {
  it('clamp keeps value within inclusive range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it('computeTentativePosition enforces drag boundaries', () => {
    const result = computeTentativePosition({
      originLeft: 24,
      originTop: 24,
      deltaX: -200,
      deltaY: -200,
      viewportWidth: 200,
      viewportHeight: 200,
      width: 40,
      height: 40
    });

    expect(result.left).toBe(DRAG_BOUNDARY_PADDING);
    expect(result.top).toBe(DRAG_BOUNDARY_PADDING);
  });

  it('computeTentativePosition caps movement at available viewport', () => {
    const result = computeTentativePosition({
      originLeft: 24,
      originTop: 24,
      deltaX: 500,
      deltaY: 500,
      viewportWidth: 300,
      viewportHeight: 280,
      width: 40,
      height: 40
    });

    const expectedLeft = Math.max(DRAG_BOUNDARY_PADDING, 300 - 40 - DRAG_BOUNDARY_PADDING);
    const expectedTop = Math.max(DRAG_BOUNDARY_PADDING, 280 - 40 - DRAG_BOUNDARY_PADDING);

    expect(result.left).toBe(expectedLeft);
    expect(result.top).toBe(expectedTop);
  });

  it('computeSnapSide prefers nearest horizontal edge', () => {
    expect(computeSnapSide(EDGE_MARGIN, 40, 800)).toBe('left');
    expect(computeSnapSide(800 - EDGE_MARGIN - 40, 40, 800)).toBe('right');

    // Equidistant from center should default to right edge
    const centerLeft = 400 - 20;
    expect(computeSnapSide(centerLeft, 40, 800)).toBe('right');
  });

  it('applySideClass toggles helper classes correctly', () => {
    const element = document.createElement('div');
    applySideClass(element, 'left');
    expect(element.classList.contains('video-floating-prompt--left')).toBe(true);
    expect(element.classList.contains('video-floating-prompt--right')).toBe(false);

    applySideClass(element, 'right');
    expect(element.classList.contains('video-floating-prompt--left')).toBe(false);
    expect(element.classList.contains('video-floating-prompt--right')).toBe(true);
  });

  it('setPromptSide persists and updates classes', () => {
    const element = document.createElement('div');
    setPromptSide('left', element);
    expect(element.classList.contains('video-floating-prompt--left')).toBe(true);

    setPromptSide('right', element);
    expect(element.classList.contains('video-floating-prompt--right')).toBe(true);
  });

  it('exposes drag constants for downstream validation', () => {
    expect(EDGE_MARGIN).toBeGreaterThan(0);
    expect(DRAG_BOUNDARY_PADDING).toBeGreaterThan(0);
    expect(DRAG_ACTIVATE_DISTANCE).toBeGreaterThan(0);
  });

  it('computeDockedPlacement snaps to left edge with margin', () => {
    const placement = computeDockedPlacement({
      preferredSide: 'left',
      tentativeLeft: 200,
      tentativeTop: 100,
      elementWidth: 40,
      elementHeight: 40,
      viewportWidth: 800,
      viewportHeight: 600
    });

    expect(placement.side).toBe('left');
    expect(placement.left).toBe(Math.max(DRAG_BOUNDARY_PADDING, EDGE_MARGIN));
    expect(placement.top).toBe(100);
    expect(placement.right).toBeNull();
  });

  it('computeDockedPlacement snaps to right edge when nearer', () => {
    const placement = computeDockedPlacement({
      tentativeLeft: 600,
      tentativeTop: 200,
      elementWidth: 40,
      elementHeight: 40,
      viewportWidth: 800,
      viewportHeight: 600
    });

    expect(placement.side).toBe('right');
    const expectedLeft = 800 - 40 - Math.max(DRAG_BOUNDARY_PADDING, EDGE_MARGIN);
    expect(placement.left).toBe(expectedLeft);
    expect(placement.right).toBe(Math.max(DRAG_BOUNDARY_PADDING, EDGE_MARGIN));
  });

  it('computeDockedPlacement clamps top within viewport', () => {
    const placement = computeDockedPlacement({
      tentativeLeft: 50,
      tentativeTop: 3000,
      elementWidth: 40,
      elementHeight: 40,
      viewportWidth: 320,
      viewportHeight: 400
    });

    const expectedTop = Math.max(DRAG_BOUNDARY_PADDING, 400 - 40 - DRAG_BOUNDARY_PADDING);
    expect(placement.top).toBe(expectedTop);
  });
});
