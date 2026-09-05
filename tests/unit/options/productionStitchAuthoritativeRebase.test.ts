import { describe, expect, it, vi } from 'vitest';
import { mergeOptions } from '@shared/config/optionsMerger';
import {
  applyProductionStitchAuthoritativeRebase,
  createProductionStitchAuthoritativeRebase,
  resolveAuthoritativeRebaseScopes
} from '@options/app/productionStitchAuthoritativeRebase';

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
    const next = mergeOptions({});
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

  it('defers a protected finite scope and releases it after protection reconciliation', () => {
    const render = vi.fn();
    let protectionKeys = ['yamlConfig'];
    const rebase = createProductionStitchAuthoritativeRebase({
      resetOptions: vi.fn(),
      getRenderProtectionKeys: () => protectionKeys,
      reconcileRenderProtection: (persistentDirtyPathKeys) => {
        if (!persistentDirtyPathKeys.includes('yamlConfig')) protectionKeys = [];
      },
      render
    });
    const next = mergeOptions({});

    rebase(next, {
      changedPaths: [['templates', 'article']],
      dirtyPathKeys: ['yamlConfig']
    });
    expect(render).not.toHaveBeenCalled();

    rebase(next, { changedPaths: [], dirtyPathKeys: [] });
    expect(render).toHaveBeenCalledWith(['output']);
  });
});
