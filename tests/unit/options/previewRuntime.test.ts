/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPreviewApp } from '@options/preview/app/runtime';

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

  it('renders experimental summary and subtitle controls as disabled coming-soon placeholders', () => {
    mountPreviewApp({ rootId: 'app', mode: 'main' });

    document.querySelector<HTMLElement>('[data-nav-panel="experimental"]')?.click();

    const text = document.body.textContent ?? '';
    expect(text).toContain('敬请期待');
    expect(text).toContain('Coming soon');
    const controls = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        '.summary-toggle-item input[type="checkbox"], .subtitle-inline-item input[type="checkbox"], .subtitle-inline-grid select'
      )
    );
    expect(controls).toHaveLength(4);
    expect(controls.every((control) => control.disabled)).toBe(true);
    const aiServiceCard = Array.from(document.querySelectorAll<HTMLElement>('.card')).find((card) =>
      card.textContent?.includes('Shared AI Connection')
    );
    const aiServiceControls = Array.from(
      aiServiceCard?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select') ?? []
    );
    expect(aiServiceControls.length).toBeGreaterThanOrEqual(4);
    expect(aiServiceControls.every((control) => control.disabled)).toBe(true);
  });
});
