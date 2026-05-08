/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerRuntimeSurfaceThemeRoot,
  setControlledRuntimeTheme,
  startRuntimeThemeSync
} from '@content/stitch/runtimeTheme';
import type { CompleteOptions } from '@shared/types/options';

describe('runtimeTheme', () => {
  beforeEach(() => {
    delete (window as { __AI2OB_STITCH_RUNTIME_THEME__?: unknown }).__AI2OB_STITCH_RUNTIME_THEME__;
    document.body.innerHTML = '';
  });

  it('updates registered runtime surface roots when the controlled theme changes', () => {
    const surface = document.createElement('section');
    surface.dataset.previewTheme = 'dark';
    document.body.append(surface);

    registerRuntimeSurfaceThemeRoot(surface, window);
    setControlledRuntimeTheme(window, 'light');

    expect(surface.dataset.previewTheme).toBe('light');
  });

  it('resolves system theme and follows option changes without remounting runtime UI', async () => {
    let listener: ((options: CompleteOptions) => void) | undefined;
    const surface = document.createElement('section');
    surface.dataset.previewTheme = 'dark';
    document.body.append(surface);
    const mediaListeners = new Set<() => void>();
    const media = {
      matches: true,
      addEventListener: vi.fn((_event: string, callback: () => void) => {
        mediaListeners.add(callback);
      }),
      removeEventListener: vi.fn()
    };
    const matchMedia = vi.fn(() => media as never);
    const stop = startRuntimeThemeSync(
      {
        onChange: vi.fn((callback) => {
          listener = callback;
          return () => {
            listener = undefined;
          };
        })
      },
      window,
      { matchMedia: matchMedia as never }
    );
    registerRuntimeSurfaceThemeRoot(surface, window);

    expect(listener).toBeDefined();
    listener?.({ interfaceTheme: 'system' } as CompleteOptions);
    expect(surface.dataset.previewTheme).toBe('dark');

    media.matches = false;
    mediaListeners.forEach((callback) => callback());
    expect(surface.dataset.previewTheme).toBe('light');

    listener?.({ interfaceTheme: 'dark' } as CompleteOptions);
    expect(surface.dataset.previewTheme).toBe('dark');

    stop();
    expect(listener).toBeUndefined();
  });
});
