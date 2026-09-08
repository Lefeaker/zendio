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

function queryRequired<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing production element: ${selector}`);
  return element;
}

describe('production options navigation e2e', () => {
  let mounted: MountedProductionStitchShell | null = null;

  beforeEach(() => {
    document.body.innerHTML = '<div id="optionsShellRoot"></div>';
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    });
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
    expect(navButton('overview').getAttribute('aria-current')).toBe('page');
    expect(navButton('output').classList.contains('is-active')).toBe(false);
    expect(navButton('output').hasAttribute('aria-current')).toBe(false);
    expect(document.querySelectorAll('[data-nav-panel][aria-current="page"]')).toHaveLength(1);
    expect(document.querySelector('[data-panel-id="output"]')).toBeTruthy();

    navButton('output').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(navButton('overview').classList.contains('is-active')).toBe(false);
    expect(navButton('overview').hasAttribute('aria-current')).toBe(false);
    expect(navButton('output').classList.contains('is-active')).toBe(true);
    expect(navButton('output').getAttribute('aria-current')).toBe('page');
    expect(document.querySelectorAll('[data-nav-panel][aria-current="page"]')).toHaveLength(1);
    expect(navButton('output').textContent).toContain('Output & Metadata');
  });

  it('keeps all settings and resource routes reachable through the sole mobile sidebar', () => {
    mounted?.cleanup();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query === '(max-width: 760px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
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
    const sidebar = document.querySelector('.sidebar');
    const trigger = () => queryRequired<HTMLButtonElement>('[data-mobile-navigation-trigger]');

    for (const panelId of [
      'overview',
      'storage',
      'capture-sources',
      'capture-behavior',
      'output',
      'maintenance'
    ]) {
      trigger().click();
      navButton(panelId).click();
      expect(navButton(panelId).classList.contains('is-active')).toBe(true);
      expect(navButton(panelId).getAttribute('aria-current')).toBe('page');
      expect(document.querySelectorAll('[data-nav-panel][aria-current="page"]')).toHaveLength(1);
    }

    for (const resourceId of ['support', 'suggestions', 'contact', 'changelog']) {
      trigger().click();
      const resource = queryRequired<HTMLButtonElement>(`[data-footer-panel="${resourceId}"]`);
      resource.click();
      expect(document.querySelector('.resource-modal-overlay [role="dialog"]')).toBeTruthy();
      expect(resource.getAttribute('aria-current')).toBe('page');
      expect(document.querySelectorAll('[data-footer-panel][aria-current="page"]')).toHaveLength(1);
      queryRequired<HTMLDivElement>('.resource-modal-overlay').click();
      expect(document.querySelectorAll('[data-footer-panel][aria-current="page"]')).toHaveLength(0);
    }

    trigger().click();
    const onboarding = queryRequired<HTMLButtonElement>('[data-footer-panel="onboarding"]');
    onboarding.click();
    expect(open).toHaveBeenCalledWith('../onboarding/index.html', '_blank', 'noopener,noreferrer');
    expect(onboarding.hasAttribute('aria-current')).toBe(false);
    expect(document.querySelectorAll('[data-footer-panel][aria-current="page"]')).toHaveLength(0);
    expect(document.querySelectorAll('.sidebar')).toHaveLength(1);
    expect(document.querySelector('.sidebar')).toBe(sidebar);
  });
});
