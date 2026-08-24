import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import {
  DEFAULT_FRAGMENT_CONFIG,
  loadFragmentConfig,
  normalizeModifierKeys
} from '@content/clipper/services/fragmentConfig';

describe('fragmentConfig helpers', () => {
  it('normalizes modifier key arrays to a single selection', () => {
    const normalized = normalizeModifierKeys(['meta', 'ctrl', 'Cmd', 'ALT']);
    expect(normalized).toEqual(['meta']);
  });

  it('provides a stable default fragment config', () => {
    expect(DEFAULT_FRAGMENT_CONFIG.selectionTriggerMode).toBe('modifier');
    expect(DEFAULT_FRAGMENT_CONFIG.selectionModifierKeys).toEqual(['shift']);
  });

  it('includes keyboard shortcuts in default config', () => {
    expect(DEFAULT_FRAGMENT_CONFIG.keyboardShortcutsEnabled).toBe(true);
  });

  it('loads fragment config from the explicitly wired repository', async () => {
    const repository: Pick<IOptionsRepository, 'get'> = {
      get: vi.fn(() =>
        Promise.resolve(
          mergeOptions({
            fragmentClipper: {
              useFootnoteFormat: false,
              captureContext: false,
              selectionTriggerMode: 'modifier',
              selectionModifierKeys: ['meta'],
              keyboardShortcutsEnabled: false
            }
          })
        )
      )
    };

    const config = await loadFragmentConfig(repository);

    expect(repository.get).toHaveBeenCalledTimes(1);
    expect(config.selectionTriggerMode).toBe('modifier');
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
    expect(source).not.toContain('shared/interfaces/optionsRepository');
    expect(source).not.toContain('repository.load');
    expect(source).not.toContain('repository.save');
  });
});
