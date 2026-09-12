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
    document.body.innerHTML = '';
  });

  it('loads exactly the requested reader, video and prompt-task packs', async () => {
    const { panelStyleSheetManager } =
      await import('../../../src/content/shared/panels/styleSheetManager');
    const reader = document.createElement('div').attachShadow({ mode: 'open' });
    const video = document.createElement('div').attachShadow({ mode: 'open' });
    const prompt = document.createElement('div').attachShadow({ mode: 'open' });
    const readerHandle = panelStyleSheetManager.applyReaderStyles(reader);
    const videoHandle = panelStyleSheetManager.applyVideoStyles(video);
    const promptHandle = panelStyleSheetManager.applyPromptTaskStyles(prompt);
    await Promise.all([readerHandle.ready, videoHandle.ready, promptHandle.ready]);

    expect(loadExtensionStyleMock.mock.calls.map(([path]) => path)).toEqual([
      'ui/stitch-runtime/styles/reader.css',
      'ui/stitch-runtime/styles/video.css',
      'ui/stitch-runtime/styles/prompt-task.css'
    ]);
    expect(reader.querySelector('[data-aiob-style-bridge="panel-reader-style-pack"]')).toBeTruthy();
    expect(video.querySelector('[data-aiob-style-bridge="panel-video-style-pack"]')).toBeTruthy();
    expect(
      prompt.querySelector('[data-aiob-style-bridge="panel-prompt-task-style-pack"]')
    ).toBeTruthy();
    readerHandle.dispose();
    videoHandle.dispose();
    promptHandle.dispose();
  });

  it('deduplicates the same pack without sharing rival pack state', async () => {
    const { panelStyleSheetManager } =
      await import('../../../src/content/shared/panels/styleSheetManager');
    const first = panelStyleSheetManager.applyReaderStyles(
      document.createElement('div').attachShadow({ mode: 'open' })
    );
    const second = panelStyleSheetManager.applyReaderStyles(
      document.createElement('div').attachShadow({ mode: 'open' })
    );
    const video = panelStyleSheetManager.applyVideoStyles(
      document.createElement('div').attachShadow({ mode: 'open' })
    );
    await Promise.all([first.ready, second.ready, video.ready]);
    expect(loadExtensionStyleMock.mock.calls.map(([path]) => path)).toEqual([
      'ui/stitch-runtime/styles/reader.css',
      'ui/stitch-runtime/styles/video.css'
    ]);
    first.dispose();
    second.dispose();
    video.dispose();
  });

  it('retries a failed pack through the same attachment handle', async () => {
    loadExtensionStyleMock.mockRejectedValueOnce(new Error('load failed'));
    const { panelStyleSheetManager } =
      await import('../../../src/content/shared/panels/styleSheetManager');
    const root = document.createElement('div').attachShadow({ mode: 'open' });
    const attachment = panelStyleSheetManager.applyReaderStyles(root);
    await expect(attachment.ready).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ASSET_LOAD_FAILED'
    });
    loadExtensionStyleMock.mockResolvedValue('/* retry */');
    await expect(attachment.refresh()).resolves.toEqual({ status: 'ready' });
    expect(root.querySelector('[data-aiob-style-bridge]')?.textContent).toContain('retry');
    attachment.dispose();
  });

  it('settles pending handles and ignores late completion after destroy', async () => {
    let resolveLoad!: (css: string) => void;
    loadExtensionStyleMock.mockImplementation(
      () => new Promise<string>((resolve) => (resolveLoad = resolve))
    );
    const { panelStyleSheetManager } =
      await import('../../../src/content/shared/panels/styleSheetManager');
    const root = document.createElement('div').attachShadow({ mode: 'open' });
    const attachment = panelStyleSheetManager.applyVideoStyles(root);
    panelStyleSheetManager.destroy();
    await expect(attachment.ready).resolves.toEqual({
      status: 'failed',
      code: 'STYLE_ATTACHMENT_DISPOSED'
    });
    resolveLoad('/* late */');
    await Promise.resolve();
    await Promise.resolve();
    expect(root.querySelector('[data-aiob-style-bridge]')).toBeNull();
  });
});
