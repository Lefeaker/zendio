import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OptionsRepository } from '@shared/interfaces/optionsRepository';
import {
  DEFAULT_FRAGMENT_CONFIG,
  createModifierState,
  loadFragmentConfig,
  normalizeModifierKeys,
  resetModifierState,
  shouldTriggerSelectionWithModifiers,
  syncModifierState
} from '@content/clipper/services/fragmentConfig';

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

  it('includes keyboard shortcuts in default config', () => {
    expect(DEFAULT_FRAGMENT_CONFIG.keyboardShortcutsEnabled).toBe(true);
  });

  it('loads fragment config from the explicitly wired repository', async () => {
    const repository: OptionsRepository = {
      load: vi.fn().mockResolvedValue({
        fragmentClipper: {
          useFootnoteFormat: false,
          captureContext: false,
          selectionModifierEnabled: true,
          selectionModifierKeys: ['meta'],
          keyboardShortcutsEnabled: false
        }
      }),
      save: vi.fn(() => Promise.resolve(undefined)),
      snapshot: vi.fn(() => null),
      subscribe: vi.fn(() => () => undefined),
      reset: vi.fn(() => undefined)
    };

    const config = await loadFragmentConfig(repository);

    expect(repository.load).toHaveBeenCalledTimes(1);
    expect(config.selectionModifierEnabled).toBe(true);
    expect(config.selectionModifierKeys).toEqual(['meta']);
    expect(config.keyboardShortcutsEnabled).toBe(false);
  });

  it('falls back to defaults when no repository is passed', async () => {
    const config = await loadFragmentConfig();

    expect(config).toEqual(DEFAULT_FRAGMENT_CONFIG);
  });

  it('does not self-resolve platform services inside fragmentConfig', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/content/clipper/services/fragmentConfig.ts'),
      'utf8'
    );

    expect(source).not.toContain('TOKENS.platformServices');
    expect(source).not.toContain('getService<PlatformServices>');
  });
});
