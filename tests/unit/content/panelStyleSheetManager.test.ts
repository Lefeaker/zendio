/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';

const loadClipperStyleMock = vi.hoisted(() => vi.fn(async (name: string) => `/* ${name} */`));

vi.mock('../../../src/content/clipper/shared/styleRegistry', () => ({
  loadClipperStyle: loadClipperStyleMock
}));

describe('panelStyleSheetManager', () => {
  afterEach(async () => {
    const { panelStyleSheetManager } = await import(
      '../../../src/content/shared/panels/styleSheetManager'
    );
    panelStyleSheetManager.destroy();
    loadClipperStyleMock.mockClear();
    document.body.innerHTML = '';
  });

  it('does not load video panel CSS during reader/non-video initialization', async () => {
    const { panelStyleSheetManager } = await import(
      '../../../src/content/shared/panels/styleSheetManager'
    );

    await panelStyleSheetManager.initialize();

    expect(loadClipperStyleMock).toHaveBeenCalledWith('clipper.tailwind');
    expect(loadClipperStyleMock).not.toHaveBeenCalledWith('video.tailwind');
  });

  it('loads video panel CSS only when video styles are applied', async () => {
    const { panelStyleSheetManager } = await import(
      '../../../src/content/shared/panels/styleSheetManager'
    );
    const host = document.createElement('div');
    document.body.append(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });

    await panelStyleSheetManager.initialize();
    panelStyleSheetManager.applyVideoStyles(shadowRoot);
    await panelStyleSheetManager.whenVideoStylesReady();

    expect(loadClipperStyleMock).toHaveBeenCalledWith('video.tailwind');
  });
});
