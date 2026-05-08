/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadExtensionStyleMock = vi.fn<[string], Promise<string>>();

vi.mock('../../../src/content/clipper/shared/styleRegistry', () => ({
  loadExtensionStyle: loadExtensionStyleMock
}));

describe('clipperStyleSheetManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    loadExtensionStyleMock.mockImplementation((path) =>
      Promise.resolve(`.${path}{display:block;}`)
    );
  });

  it('loads Stitch runtime CSS before applying managed fallback styles', async () => {
    const { clipperStyleSheetManager } = await import(
      '../../../src/content/clipper/shared/styleSheetManager'
    );

    clipperStyleSheetManager.destroy();
    await clipperStyleSheetManager.initialize();
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    clipperStyleSheetManager.applyTo(shadow);

    expect(loadExtensionStyleMock).toHaveBeenCalledWith('options/stitch/styles/stitch.css');
    expect(loadExtensionStyleMock).toHaveBeenCalledWith(
      'options/stitch/styles/variants/stitch-secondary.css'
    );
    expect(shadow.querySelector('style[data-aiob-style-bridge="clipper-tailwind"]')).toBeNull();
    expect(
      shadow.querySelector('style[data-aiob-style-bridge="clipper-stitch-runtime"]')
    ).toBeTruthy();
    expect(
      shadow.querySelector('style[data-aiob-style-bridge="clipper-stitch-secondary-runtime"]')
    ).toBeTruthy();
  });

  it('reuses the same pending load across concurrent initialize calls', async () => {
    let resolveLoad: ((value: string) => void) | null = null;
    loadExtensionStyleMock.mockImplementation((path) => {
      if (path === 'options/stitch/styles/stitch.css') {
        return new Promise<string>((resolve) => {
          resolveLoad = resolve;
        });
      }
      return Promise.resolve('.secondary { display: block; }');
    });

    const { clipperStyleSheetManager } = await import(
      '../../../src/content/clipper/shared/styleSheetManager'
    );

    clipperStyleSheetManager.destroy();
    const first = clipperStyleSheetManager.initialize();
    const second = clipperStyleSheetManager.initialize();

    expect(loadExtensionStyleMock).toHaveBeenCalledTimes(2);

    if (!resolveLoad) {
      throw new Error('style loader resolver missing');
    }
    (resolveLoad as (value: string) => void)('.clipper-root { color: blue; }');
    await Promise.all([first, second]);

    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    clipperStyleSheetManager.applyTo(shadow);
    const style = shadow.querySelector('style[data-aiob-style-bridge="clipper-stitch-runtime"]');
    expect(style?.textContent).toContain('.clipper-root { color: blue; }');
  });
});
