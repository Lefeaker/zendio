import { describe, expect, it } from 'vitest';
import { createBrowserManifest } from '../../../../scripts/utils/manifestSources.mjs';

describe('Firefox manifest compatibility ledger', () => {
  it('[R01-FIREFOX-MANIFEST-01] preserves Firefox background and Gecko manifest differences', () => {
    const firefoxManifest = createBrowserManifest('firefox');
    const chromeManifest = createBrowserManifest('chrome');

    expect(chromeManifest.background?.service_worker).toBe('background/index.js');
    expect(chromeManifest.background?.scripts).toBeUndefined();
    expect(firefoxManifest.background).toEqual({
      scripts: ['background/index.js']
    });
    expect(firefoxManifest.background?.service_worker).toBeUndefined();
    expect(firefoxManifest.browser_specific_settings?.gecko?.strict_min_version).toBe('142.0');
    expect(firefoxManifest.browser_specific_settings?.gecko?.data_collection_permissions).toEqual({
      required: ['none'],
      optional: ['technicalAndInteraction']
    });
    expect(firefoxManifest.browser_specific_settings?.gecko_android?.strict_min_version).toBe(
      '142.0'
    );
  });
});
