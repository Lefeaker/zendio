/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadExtensionStyleMock = vi.fn<(path: string) => Promise<string>>();

vi.mock('../../../src/content/clipper/shared/styleRegistry', () => ({
  loadExtensionStyle: loadExtensionStyleMock
}));

describe('clipperStyleSheetManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    loadExtensionStyleMock.mockResolvedValue('.clipper-pack{display:block;}');
  });

  it('loads and applies only the clipper pack', async () => {
    const { clipperStyleSheetManager } =
      await import('../../../src/content/clipper/shared/styleSheetManager');
    clipperStyleSheetManager.destroy();
    const shadow = document.createElement('div').attachShadow({ mode: 'open' });
    const attachment = clipperStyleSheetManager.applyClipperStyles(shadow);

    await expect(attachment.ready).resolves.toEqual({ status: 'ready' });
    expect(loadExtensionStyleMock).toHaveBeenCalledTimes(1);
    expect(loadExtensionStyleMock).toHaveBeenCalledWith('ui/stitch-runtime/styles/clipper.css');
    expect(shadow.querySelector('[data-aiob-style-bridge="clipper-style-pack"]')).toBeTruthy();
    attachment.dispose();
  });

  it('deduplicates concurrent initialize and attachment loads', async () => {
    let resolveLoad!: (css: string) => void;
    loadExtensionStyleMock.mockImplementation(
      () => new Promise<string>((resolve) => (resolveLoad = resolve))
    );
    const { clipperStyleSheetManager } =
      await import('../../../src/content/clipper/shared/styleSheetManager');
    clipperStyleSheetManager.destroy();
    const first = clipperStyleSheetManager.initialize();
    const shadow = document.createElement('div').attachShadow({ mode: 'open' });
    const attachment = clipperStyleSheetManager.applyClipperStyles(shadow);
    expect(loadExtensionStyleMock).toHaveBeenCalledTimes(1);
    resolveLoad('.clipper{}');
    await first;
    await expect(attachment.ready).resolves.toEqual({ status: 'ready' });
    attachment.dispose();
  });

  it('evicts a failed manager load and retries through refresh', async () => {
    loadExtensionStyleMock.mockRejectedValueOnce(new Error('load failed'));
    const { clipperStyleSheetManager } =
      await import('../../../src/content/clipper/shared/styleSheetManager');
    const shadow = document.createElement('div').attachShadow({ mode: 'open' });
    const attachment = clipperStyleSheetManager.applyClipperStyles(shadow);
    await expect(attachment.ready).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ASSET_LOAD_FAILED'
    });
    loadExtensionStyleMock.mockResolvedValue('.retry{}');
    await expect(attachment.refresh()).resolves.toEqual({ status: 'ready' });
    expect(loadExtensionStyleMock).toHaveBeenCalledTimes(2);
    attachment.dispose();
  });

  it('settles pending handles and rejects late completion after destroy', async () => {
    let resolveLoad!: (css: string) => void;
    loadExtensionStyleMock.mockImplementation(
      () => new Promise<string>((resolve) => (resolveLoad = resolve))
    );
    const { clipperStyleSheetManager } =
      await import('../../../src/content/clipper/shared/styleSheetManager');
    const shadow = document.createElement('div').attachShadow({ mode: 'open' });
    const attachment = clipperStyleSheetManager.applyClipperStyles(shadow);
    clipperStyleSheetManager.destroy();
    await expect(attachment.ready).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ATTACHMENT_DISPOSED'
    });
    resolveLoad('.late{}');
    await Promise.resolve();
    await Promise.resolve();
    expect(shadow.querySelector('[data-aiob-style-bridge]')).toBeNull();
  });
});
