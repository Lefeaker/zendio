/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadClipperStyleMock = vi.fn<[], Promise<string>>();

vi.mock('../../../src/content/clipper/shared/styleRegistry', () => ({
  loadClipperStyle: loadClipperStyleMock
}));

describe('clipperStyleSheetManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    loadClipperStyleMock.mockResolvedValue('.clipper-root { color: red; }');
  });

  it('loads clipper tailwind css before applying managed fallback styles', async () => {
    const { clipperStyleSheetManager } = await import(
      '../../../src/content/clipper/shared/styleSheetManager'
    );

    clipperStyleSheetManager.destroy();
    await clipperStyleSheetManager.initialize();
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    clipperStyleSheetManager.applyTo(shadow);
    const style = shadow.querySelector('style[data-aiob-style-bridge="clipper-tailwind"]');

    expect(loadClipperStyleMock).toHaveBeenCalledWith('clipper.tailwind');
    expect(style?.textContent).toContain('.clipper-root { color: red; }');
  });

  it('reuses the same pending load across concurrent initialize calls', async () => {
    let resolveLoad: ((value: string) => void) | null = null;
    loadClipperStyleMock.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveLoad = resolve;
        })
    );

    const { clipperStyleSheetManager } = await import(
      '../../../src/content/clipper/shared/styleSheetManager'
    );

    clipperStyleSheetManager.destroy();
    const first = clipperStyleSheetManager.initialize();
    const second = clipperStyleSheetManager.initialize();

    expect(loadClipperStyleMock).toHaveBeenCalledTimes(1);

    if (!resolveLoad) {
      throw new Error('style loader resolver missing');
    }
    (resolveLoad as (value: string) => void)('.clipper-root { color: blue; }');
    await Promise.all([first, second]);

    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    clipperStyleSheetManager.applyTo(shadow);
    const style = shadow.querySelector('style[data-aiob-style-bridge="clipper-tailwind"]');
    expect(style?.textContent).toContain('.clipper-root { color: blue; }');
  });
});
