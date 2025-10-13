import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FRAGMENT_CONFIG,
  createModifierState,
  normalizeModifierKeys,
  resetModifierState,
  shouldTriggerSelectionWithModifiers,
  syncModifierState
} from '../../src/content/clipper/services/fragmentConfig';

describe('fragmentConfig helpers', () => {
  it('allows selection when modifier requirement disabled', () => {
    const permitted = shouldTriggerSelectionWithModifiers(
      { selectionModifierEnabled: false, selectionModifierKeys: [] },
      { altKey: false, metaKey: false, ctrlKey: false, shiftKey: false }
    );
    expect(permitted).toBe(true);
  });

  it('prevents selection when required keys are missing', () => {
    const permitted = shouldTriggerSelectionWithModifiers(
      { selectionModifierEnabled: true, selectionModifierKeys: ['meta'] },
      { altKey: false, metaKey: false, ctrlKey: false, shiftKey: false }
    );
    expect(permitted).toBe(false);
  });

  it('requires all configured modifier keys', () => {
    const permitted = shouldTriggerSelectionWithModifiers(
      { selectionModifierEnabled: true, selectionModifierKeys: ['alt', 'ctrl'] },
      { altKey: true, metaKey: true, ctrlKey: false, shiftKey: false }
    );
    expect(permitted).toBe(false);
    const allowed = shouldTriggerSelectionWithModifiers(
      { selectionModifierEnabled: true, selectionModifierKeys: ['alt', 'ctrl'] },
      { altKey: true, metaKey: false, ctrlKey: true, shiftKey: false }
    );
    expect(allowed).toBe(true);
  });

  it('normalizes modifier key arrays', () => {
    const normalized = normalizeModifierKeys(['meta', 'ctrl', 'Cmd', 'ALT']);
    expect(normalized).toEqual(['meta', 'ctrl']);
  });

  it('provides a stable default fragment config', () => {
    expect(DEFAULT_FRAGMENT_CONFIG.selectionModifierEnabled).toBe(false);
    expect(DEFAULT_FRAGMENT_CONFIG.selectionModifierKeys).toEqual([]);
  });

  it('syncs and resets modifier state', () => {
    const state = createModifierState();
    syncModifierState(state, { altKey: true, ctrlKey: true });
    expect(state.altKey).toBe(true);
    expect(state.ctrlKey).toBe(true);
    expect(state.metaKey).toBe(false);
    resetModifierState(state);
    expect(state.altKey).toBe(false);
    expect(state.ctrlKey).toBe(false);
  });
});
