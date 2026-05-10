/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPreviewApp } from '../fixtures/options-preview/app/runtime';

describe('Stitch preview runtime widgets', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    window.localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    Object.defineProperty(window.HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn((..._args: unknown[]) => undefined)
    });
  });

  it('renders the shared native YAML widget instead of an empty host', () => {
    mountPreviewApp({ rootId: 'app', mode: 'main' });

    const outputNav = document.querySelector<HTMLElement>('[data-nav-panel="output"]');
    outputNav?.click();

    const host = document.querySelector<HTMLElement>('[data-stitch-widget="yaml-config"]');
    expect(host).toBeTruthy();
    expect(host?.querySelector('.stitch-yaml-config-table')).toBeTruthy();
    expect(host?.querySelector('.schema-widget-missing')).toBeFalsy();
    expect(host?.querySelector('[data-role="yaml-config-view"]')).toBeFalsy();
    expect(host?.querySelector('[class*="aobx-"]')).toBeFalsy();
  });

  it('does not render the future experimental panel in the preview runtime', () => {
    mountPreviewApp({ rootId: 'app', mode: 'main' });

    const text = document.body.textContent ?? '';
    expect(document.querySelector('[data-nav-panel="experimental"]')).toBeFalsy();
    expect(text).not.toContain('敬请期待');
    expect(text).not.toContain('Coming soon');
    expect(text).not.toContain('启用视频字幕翻译');
  });
});
