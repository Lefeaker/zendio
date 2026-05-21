/* @vitest-environment jsdom */

import { describe, expect, it, beforeEach } from 'vitest';
import { DragController } from '@content/clipper/shared/dragController';

describe('DragController', () => {
  let handle: HTMLElement;
  let moves: Array<{ x: number; y: number }>;
  let endedCount = 0;

  beforeEach(() => {
    document.body.innerHTML = '<div id="handle"></div>';
    handle = document.getElementById('handle')!;
    moves = [];
    endedCount = 0;
  });

  it('tracks pointer movement and calls onMove', () => {
    const controller = new DragController({
      handle,
      onMove: (pos) => moves.push(pos)
    });
    controller.attach();

    handle.dispatchEvent(
      new PointerEvent('pointerdown', { button: 0, clientX: 100, clientY: 100 })
    );
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 120, clientY: 130 }));
    document.dispatchEvent(new PointerEvent('pointerup'));

    expect(moves.length).toBeGreaterThan(0);
    const last = moves.at(-1);
    expect(last?.x).toBe(20);
    expect(last?.y).toBe(30);

    controller.detach();
  });

  it('ignores non-primary buttons and triggers onEnd', () => {
    const controller = new DragController({
      handle,
      onMove: (pos) => moves.push(pos),
      onEnd: () => {
        endedCount += 1;
      }
    });
    controller.attach();

    handle.dispatchEvent(new PointerEvent('pointerdown', { button: 1, clientX: 0, clientY: 0 }));
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10 }));
    expect(moves.length).toBe(0);

    handle.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 0, clientY: 0 }));
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 15, clientY: 15 }));
    document.dispatchEvent(new PointerEvent('pointerup'));

    expect(endedCount).toBe(1);
    controller.detach();
  });

  it('handles pointer cancel and lost pointer capture gracefully', () => {
    const controller = new DragController({
      handle,
      onMove: (pos) => moves.push(pos),
      onEnd: () => {
        endedCount += 1;
      }
    });
    controller.attach();

    handle.dispatchEvent(
      new PointerEvent('pointerdown', { button: 0, clientX: 10, clientY: 10, pointerId: 21 })
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 30, clientY: 30, pointerId: 21 })
    );
    const moveCountAfterDrag = moves.length;
    document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 21 }));

    expect(endedCount).toBe(1);
    document.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 40, clientY: 40, pointerId: 21 })
    );
    expect(moves.length).toBe(moveCountAfterDrag);

    handle.dispatchEvent(
      new PointerEvent('pointerdown', { button: 0, clientX: 50, clientY: 60, pointerId: 7 })
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 55, clientY: 70, pointerId: 7 })
    );
    handle.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 7 }));

    expect(endedCount).toBe(2);

    controller.detach();
  });
});
