import { describe, expect, it, vi } from 'vitest';
import type { CompleteOptions } from '@shared/types/options';
import { DEFAULT_OPTIONS } from '@shared/config/defaultOptions';
import {
  applyProductionStitchAuthoritativeRebase,
  resolveAuthoritativeRebaseScopes
} from '@options/app/productionStitchAuthoritativeRebase';

const clone = <T>(value: T): T => structuredClone(value);

describe('production Stitch authoritative rebase', () => {
  it('maps canonical changed paths to finite section scopes without invariant recovery', () => {
    expect(
      resolveAuthoritativeRebaseScopes([
        ['interfaceTheme'],
        ['fragmentClipper', 'captureContext'],
        ['templates', 'article']
      ])
    ).toEqual(['theme', 'capture-behavior', 'output']);
  });

  it('updates mutable owners and invalidates only affected scopes', () => {
    const next = clone(DEFAULT_OPTIONS as CompleteOptions);
    next.interfaceTheme = 'dark';
    const resetOptions = vi.fn();
    const render = vi.fn();

    applyProductionStitchAuthoritativeRebase({ resetOptions, render }, next, {
      changedPaths: [['interfaceTheme']],
      dirtyPathKeys: []
    });

    expect(resetOptions).toHaveBeenCalledWith(next);
    expect(render).toHaveBeenCalledWith(['theme']);
    expect(render).not.toHaveBeenCalledWith('all-invariant-recovery');
  });

  it('keeps a dirty YAML widget mounted during an unrelated output rebase', () => {
    expect(resolveAuthoritativeRebaseScopes([['templates', 'article']], ['yamlConfig'])).toEqual(
      []
    );
  });
});
