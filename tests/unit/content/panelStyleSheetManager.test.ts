/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';

const loadExtensionStyleMock = vi.hoisted(() => vi.fn(async (path: string) => `/* ${path} */`));

vi.mock('../../../src/content/clipper/shared/styleRegistry', () => ({
  loadExtensionStyle: loadExtensionStyleMock
}));

describe('panelStyleSheetManager', () => {
  afterEach(async () => {
    const { panelStyleSheetManager } = await import(
      '../../../src/content/shared/panels/styleSheetManager'
    );
    panelStyleSheetManager.destroy();
    loadExtensionStyleMock.mockClear();
    document.body.innerHTML = '';
  });

  it('loads only Stitch runtime CSS for reader/non-video initialization', async () => {
    const { panelStyleSheetManager } = await import(
      '../../../src/content/shared/panels/styleSheetManager'
    );
    const host = document.createElement('div');
    document.body.append(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });

    await panelStyleSheetManager.initialize();
    panelStyleSheetManager.applyReaderStyles(shadowRoot);
    await panelStyleSheetManager.whenStitchStylesReady();

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
  });

  it('does not load a video Tailwind bridge when video styles are applied', async () => {
    const { panelStyleSheetManager } = await import(
      '../../../src/content/shared/panels/styleSheetManager'
    );
    const host = document.createElement('div');
    document.body.append(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });

    await panelStyleSheetManager.initialize();
    panelStyleSheetManager.applyVideoStyles(shadowRoot);
    await panelStyleSheetManager.whenVideoStylesReady();
    await panelStyleSheetManager.whenStitchStylesReady();

    expect(
      shadowRoot.querySelector('[data-aiob-style-bridge="panel-stitch-runtime"]')
    ).toBeTruthy();
    expect(
      shadowRoot.querySelector('[data-aiob-style-bridge="panel-stitch-secondary-runtime"]')
    ).toBeTruthy();
    expect(shadowRoot.querySelector('[data-aiob-style-bridge="panel-video-tailwind"]')).toBeNull();
  });
});
