/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadExtensionStyleMock = vi.hoisted(() =>
  vi.fn((path: string) => Promise.resolve(`/* ${path} */`))
);

vi.mock('../../../src/content/clipper/shared/styleRegistry', () => ({
  loadExtensionStyle: loadExtensionStyleMock
}));

describe('panelStyleSheetManager', () => {
  beforeEach(() => {
    loadExtensionStyleMock.mockReset();
    loadExtensionStyleMock.mockImplementation((path) => Promise.resolve(`/* ${path} */`));
  });

  afterEach(async () => {
    const { panelStyleSheetManager } =
      await import('../../../src/content/shared/panels/styleSheetManager');
    panelStyleSheetManager.destroy();
    loadExtensionStyleMock.mockClear();
    document.body.innerHTML = '';
  });

  it('loads only Stitch runtime CSS for reader/non-video initialization', async () => {
    const { panelStyleSheetManager } =
      await import('../../../src/content/shared/panels/styleSheetManager');
    const host = document.createElement('div');
    document.body.append(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });

    await panelStyleSheetManager.initialize();
    const attachment = panelStyleSheetManager.applyReaderStyles(shadowRoot);
    expect(
      shadowRoot.querySelector('[data-aiob-style-bridge="panel-stitch-runtime"]')
    ).toBeTruthy();
    await expect(attachment.ready).resolves.toEqual({ status: 'ready' });

    expect(loadExtensionStyleMock).toHaveBeenCalledWith('options/stitch/styles/stitch.css');
    expect(loadExtensionStyleMock).toHaveBeenCalledWith(
      'options/stitch/styles/variants/stitch-secondary.css'
    );
    expect(
      shadowRoot.querySelector('[data-aiob-style-bridge="panel-stitch-runtime"]')
    ).toBeTruthy();
    expect(
      shadowRoot.querySelector('[data-aiob-style-bridge="panel-stitch-secondary-runtime"]')
    ).toBeTruthy();
    expect(
      shadowRoot.querySelector('[data-aiob-style-bridge="panel-clipper-tailwind"]')
    ).toBeNull();
    expect(shadowRoot.querySelector('[data-aiob-style-bridge="panel-video-tailwind"]')).toBeNull();
    attachment.dispose();
  });

  it('does not load a video Tailwind bridge when video styles are applied', async () => {
    const { panelStyleSheetManager } =
      await import('../../../src/content/shared/panels/styleSheetManager');
    const host = document.createElement('div');
    document.body.append(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });

    await panelStyleSheetManager.initialize();
    const attachment = panelStyleSheetManager.applyVideoStyles(shadowRoot);
    await panelStyleSheetManager.whenVideoStylesReady();
    await expect(attachment.ready).resolves.toEqual({ status: 'ready' });

    expect(
      shadowRoot.querySelector('[data-aiob-style-bridge="panel-stitch-runtime"]')
    ).toBeTruthy();
    expect(
      shadowRoot.querySelector('[data-aiob-style-bridge="panel-stitch-secondary-runtime"]')
    ).toBeTruthy();
    expect(shadowRoot.querySelector('[data-aiob-style-bridge="panel-video-tailwind"]')).toBeNull();
    attachment.dispose();
  });

  it('settles pending attachments on destroy and ignores a stale load completion', async () => {
    let resolvePrimary!: (css: string) => void;
    loadExtensionStyleMock.mockImplementation((path) =>
      path.endsWith('/stitch.css')
        ? new Promise<string>((resolve) => {
            resolvePrimary = resolve;
          })
        : Promise.resolve('.secondary {}')
    );
    const { panelStyleSheetManager } =
      await import('../../../src/content/shared/panels/styleSheetManager');
    const root = document.createElement('div').attachShadow({ mode: 'open' });
    const attachment = panelStyleSheetManager.applyStitchRuntimeStyles(root);

    panelStyleSheetManager.destroy();

    await expect(attachment.ready).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ATTACHMENT_DISPOSED'
    });
    resolvePrimary('.stale {}');
    await Promise.resolve();
    await Promise.resolve();
    expect(root.querySelector('[data-aiob-style-bridge]')).toBeNull();
    expect(panelStyleSheetManager.getRegistrationCount()).toBe(0);
  });

  it('keeps initialize non-throwing while a handle reports failure and refresh retries', async () => {
    loadExtensionStyleMock.mockRejectedValueOnce(new Error('load failed'));
    const { panelStyleSheetManager } =
      await import('../../../src/content/shared/panels/styleSheetManager');
    const root = document.createElement('div').attachShadow({ mode: 'open' });

    const attachment = panelStyleSheetManager.applyReaderStyles(root);
    await expect(panelStyleSheetManager.initialize()).resolves.toBeUndefined();
    await expect(attachment.ready).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ASSET_LOAD_FAILED'
    });

    loadExtensionStyleMock.mockImplementation((path) => Promise.resolve(`/* retry ${path} */`));
    await expect(attachment.refresh()).resolves.toEqual({ status: 'ready' });
    expect(root.querySelector('[data-aiob-style-bridge]')?.textContent).toContain('retry');
    attachment.dispose();
  });

  it('makes a failed handle terminal when manager destroy advances the generation', async () => {
    loadExtensionStyleMock.mockRejectedValueOnce(new Error('load failed'));
    const { panelStyleSheetManager } =
      await import('../../../src/content/shared/panels/styleSheetManager');
    const root = document.createElement('div').attachShadow({ mode: 'open' });
    const attachment = panelStyleSheetManager.applyReaderStyles(root);
    await expect(attachment.ready).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ASSET_LOAD_FAILED'
    });
    expect(panelStyleSheetManager.getRegistrationCount()).toBe(0);
    const callsBeforeDestroy = loadExtensionStyleMock.mock.calls.length;

    panelStyleSheetManager.destroy();

    await expect(attachment.refresh()).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ATTACHMENT_DISPOSED'
    });
    expect(loadExtensionStyleMock).toHaveBeenCalledTimes(callsBeforeDestroy);
  });
});
