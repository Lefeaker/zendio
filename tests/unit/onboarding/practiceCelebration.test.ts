/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPracticeCelebration } from '../../../src/onboarding/practiceCelebration';

function rig(reduced = false) {
  const motion = Object.assign(new EventTarget(), { matches: reduced });
  const removeListener = vi.spyOn(motion, 'removeEventListener');
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => motion)
  );
  const effect = createPracticeCelebration();
  const anchor = document.createElement('button');
  document.body.append(anchor, effect.layer);
  return { effect, anchor, motion, removeListener };
}

describe('practice completion celebration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.replaceChildren();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('does not celebrate restored achievements or repeat them after later renders', () => {
    const { effect, anchor } = rig();
    effect.sync(['selected', 'saved'], anchor);
    effect.sync(['selected', 'saved'], anchor);
    expect(effect.layer.childElementCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    effect.dispose();
  });
  it('briefly celebrates each new operation once and fully removes the effect', () => {
    const { effect, anchor } = rig();
    effect.sync([], anchor);
    effect.sync(['selected'], anchor);
    expect(effect.layer.dataset.milestone).toBe('selected');
    expect(effect.layer.childElementCount).toBeGreaterThan(0);
    const firstParticle = effect.layer.firstChild;
    effect.sync(['selected'], anchor);
    expect(effect.layer.firstChild).toBe(firstParticle);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1500);
    expect(effect.layer.childElementCount).toBe(0);
    effect.sync([], anchor);
    effect.sync(['selected'], anchor);
    expect(effect.layer.childElementCount).toBe(0);
    effect.sync(['selected', 'saved'], anchor);
    expect(effect.layer.dataset.milestone).toBe('saved');
    effect.dispose();
    expect(effect.layer.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('honors reduced motion and cancels immediately when the preference changes', () => {
    const { effect, anchor, motion, removeListener } = rig(true);
    effect.sync([], anchor);
    effect.sync(['selected'], anchor);
    expect(effect.layer.childElementCount).toBe(0);
    motion.matches = false;
    effect.sync(['selected', 'saved'], anchor);
    expect(effect.layer.childElementCount).toBeGreaterThan(0);
    motion.matches = true;
    motion.dispatchEvent(new Event('change'));
    expect(effect.layer.childElementCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    effect.dispose();
    expect(removeListener).toHaveBeenCalled();
  });
});
