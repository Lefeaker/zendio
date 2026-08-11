/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadExtensionStyleMock = vi.fn<(...args: [string]) => Promise<string>>();

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
    const { clipperStyleSheetManager } =
      await import('../../../src/content/clipper/shared/styleSheetManager');

    clipperStyleSheetManager.destroy();
    await clipperStyleSheetManager.initialize();
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const attachment = clipperStyleSheetManager.applyTo(shadow);
    expect(
      shadow.querySelector('style[data-aiob-style-bridge="clipper-stitch-runtime"]')
    ).toBeTruthy();
    await expect(attachment.ready).resolves.toEqual({ status: 'ready' });

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
    attachment.dispose();
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

    const { clipperStyleSheetManager } =
      await import('../../../src/content/clipper/shared/styleSheetManager');

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
    const attachment = clipperStyleSheetManager.applyTo(shadow);
    await expect(attachment.ready).resolves.toEqual({ status: 'ready' });
    const style = shadow.querySelector('style[data-aiob-style-bridge="clipper-stitch-runtime"]');
    expect(style?.textContent).toContain('.clipper-root { color: blue; }');
    attachment.dispose();
  });

  it('returns fresh handles and stale disposal cannot remove the newer attachment', async () => {
    const { clipperStyleSheetManager } =
      await import('../../../src/content/clipper/shared/styleSheetManager');
    await clipperStyleSheetManager.initialize();
    const shadow = document.createElement('div').attachShadow({ mode: 'open' });
    const first = clipperStyleSheetManager.applyTo(shadow);
    const second = clipperStyleSheetManager.applyTo(shadow);

    expect(first).not.toBe(second);
    await Promise.all([first.ready, second.ready]);
    first.dispose();
    expect(shadow.querySelector('[data-aiob-style-bridge="clipper-stitch-runtime"]')).toBeTruthy();
    second.dispose();
    expect(shadow.querySelector('[data-aiob-style-bridge]')).toBeNull();
  });

  it('reports failed loading through the handle and retries on refresh', async () => {
    loadExtensionStyleMock.mockRejectedValueOnce(new Error('load failed'));
    const { clipperStyleSheetManager } =
      await import('../../../src/content/clipper/shared/styleSheetManager');
    const shadow = document.createElement('div').attachShadow({ mode: 'open' });
    const attachment = clipperStyleSheetManager.applyTo(shadow);

    await expect(attachment.ready).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ASSET_LOAD_FAILED'
    });
    loadExtensionStyleMock.mockImplementation((path) => Promise.resolve(`.retry-${path} {}`));
    await expect(attachment.refresh()).resolves.toEqual({ status: 'ready' });
    attachment.dispose();
    expect(clipperStyleSheetManager.getRegistrationCount()).toBe(0);
  });

  it('invalidates pending initialization and attachments during destroy', async () => {
    let resolvePrimary!: (css: string) => void;
    loadExtensionStyleMock.mockImplementation((path) =>
      path.endsWith('/stitch.css')
        ? new Promise<string>((resolve) => {
            resolvePrimary = resolve;
          })
        : Promise.resolve('.secondary {}')
    );
    const { clipperStyleSheetManager } =
      await import('../../../src/content/clipper/shared/styleSheetManager');
    const initialization = clipperStyleSheetManager.initialize();
    const shadow = document.createElement('div').attachShadow({ mode: 'open' });
    const attachment = clipperStyleSheetManager.applyTo(shadow);

    clipperStyleSheetManager.destroy();

    await expect(attachment.ready).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ATTACHMENT_DISPOSED'
    });
    resolvePrimary('.stale {}');
    await initialization;
    expect(() => clipperStyleSheetManager.getSheets()).toThrow('initialize() must be called first');
    expect(shadow.querySelector('[data-aiob-style-bridge]')).toBeNull();
  });

  it('makes a failed handle terminal when manager destroy advances the generation', async () => {
    loadExtensionStyleMock.mockRejectedValueOnce(new Error('load failed'));
    const { clipperStyleSheetManager } =
      await import('../../../src/content/clipper/shared/styleSheetManager');
    const shadow = document.createElement('div').attachShadow({ mode: 'open' });
    const attachment = clipperStyleSheetManager.applyTo(shadow);
    await expect(attachment.ready).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ASSET_LOAD_FAILED'
    });
    expect(clipperStyleSheetManager.getRegistrationCount()).toBe(0);
    const callsBeforeDestroy = loadExtensionStyleMock.mock.calls.length;

    clipperStyleSheetManager.destroy();

    await expect(attachment.refresh()).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ATTACHMENT_DISPOSED'
    });
    expect(loadExtensionStyleMock).toHaveBeenCalledTimes(callsBeforeDestroy);
  });
});
