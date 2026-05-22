import { describe, expect, it } from 'vitest';
import { createBrowserManifest } from '../../../scripts/utils/manifestSources.mjs';

describe('manifestSources', () => {
  it('builds a chrome manifest with shared defaults and chrome-only fields', () => {
    const manifest = createBrowserManifest('chrome');

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.options_ui?.page).toBe('options/index.html');
    expect(manifest.permissions).toContain('offscreen');
    expect(manifest.incognito).toBe('spanning');
    expect(manifest.action?.default_popup).toBeUndefined();
    expect(manifest.browser_specific_settings).toBeUndefined();
    const war = (manifest as { web_accessible_resources?: unknown }).web_accessible_resources;
    expect(JSON.stringify(war)).not.toContain('<all_urls>');
  });

  it('builds a firefox manifest with firefox-only overrides', () => {
    const manifest = createBrowserManifest('firefox');

    expect(manifest.action?.default_popup).toBeUndefined();
    expect(manifest.content_scripts).toEqual([
      {
        matches: ['<all_urls>'],
        js: ['content/index.js'],
        run_at: 'document_end'
      }
    ]);
    expect(manifest.permissions).not.toContain('offscreen');
    expect(manifest.browser_specific_settings?.gecko?.id).toBe('allinob@aiiin.com');
    expect(manifest.incognito).toBeUndefined();
  });
});
