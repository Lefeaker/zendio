/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getFooterMeta,
  getFooterView,
  getSettingsView,
  previewContent
} from '@options/app/productionStitchAssets';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import type { MountedProductionStitchShell } from '@options/app/productionStitchShell';
import type { OptionsController } from '@options/app/optionsController';

function createController(): OptionsController {
  return {
    scheduleAutoSave: vi.fn(),
    dispose: vi.fn(),
    loadInitialState: vi.fn(),
    loadRaw: vi.fn(),
    applyToForm: vi.fn(),
    saveSnapshot: vi.fn(),
    saveRaw: vi.fn(),
    applyImportedConfig: vi.fn(),
    readForm: vi.fn(),
    cancelAutoSave: vi.fn(),
    getSnapshot: vi.fn(),
    setSnapshot: vi.fn()
  } as unknown as OptionsController;
}

function navButton(panelId: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`[data-nav-panel="${panelId}"]`);
  if (!button) {
    throw new Error(`Missing production navigation button: ${panelId}`);
  }
  return button;
}

describe('production options navigation e2e', () => {
  let mounted: MountedProductionStitchShell | null = null;

  beforeEach(() => {
    document.body.innerHTML = '<div id="optionsShellRoot"></div>';
    mounted = mountProductionStitchShell({
      controller: createController(),
      initialOptions: null,
      previewContent,
      getFooterMeta,
      getFooterView,
      getSettingsView,
      messages: null,
      language: 'en'
    });
  });

  afterEach(() => {
    mounted?.cleanup();
    mounted = null;
    document.body.innerHTML = '';
  });

  it('switches the active production panel from a user navigation click', () => {
    expect(navButton('overview').classList.contains('is-active')).toBe(true);
    expect(navButton('output').classList.contains('is-active')).toBe(false);
    expect(document.querySelector('[data-panel-id="output"]')).toBeTruthy();

    navButton('output').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(navButton('overview').classList.contains('is-active')).toBe(false);
    expect(navButton('output').classList.contains('is-active')).toBe(true);
    expect(navButton('output').textContent).toContain('Output & Metadata');
  });
});
