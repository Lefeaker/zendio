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

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: Error) => void = () => undefined;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function installControllableMobileMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const addEventListener = vi.fn(
    (type: string, listener: EventListenerOrEventListenerObject | null): void => {
      if (type === 'change' && listener) listeners.add(listener);
    }
  );
  const removeEventListener = vi.fn(
    (type: string, listener: EventListenerOrEventListenerObject | null): void => {
      if (type === 'change' && listener) listeners.delete(listener);
    }
  );
  const mobile: MediaQueryList = {
    get matches() {
      return matches;
    },
    media: '(max-width: 760px)',
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent(event): boolean {
      listeners.forEach((listener) => {
        if (typeof listener === 'function') listener.call(mobile, event);
        else listener.handleEvent(event);
      });
      return true;
    }
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string): MediaQueryList => {
      if (query === '(max-width: 760px)') return mobile;
      return {
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => true)
      };
    })
  });
  return {
    mobile,
    removeEventListener,
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      mobile.dispatchEvent(new Event('change'));
    }
  };
}

async function holdMobileNavigationImport() {
  const actual = await vi.importActual<
    typeof import('@options/app/productionStitchMobileNavigation')
  >('@options/app/productionStitchMobileNavigation');
  const requested = deferred<void>();
  const settlement = deferred<void>();
  vi.doMock('@options/app/productionStitchMobileNavigation', async () => {
    requested.resolve();
    await settlement.promise;
    return actual;
  });
  return {
    requested: requested.promise,
    async reject() {
      settlement.reject(new Error('controlled mobile navigation import rejection'));
      await Promise.resolve();
      await Promise.resolve();
    },
    async resolve() {
      settlement.resolve();
      await Promise.resolve();
      await Promise.resolve();
    },
    settle: () => settlement.resolve()
  };
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

  it('keeps all settings and resource routes reachable through the sole mobile sidebar', async () => {
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
    await vi.waitFor(() =>
      expect(document.querySelector('[data-mobile-navigation-trigger]')).not.toBeNull()
    );

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

describe('production options navigation lazy owner', () => {
  let mounted: MountedProductionStitchShell | null = null;
  let scrollIntoView = vi.fn();
  let settleImport: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = '<div id="optionsShellRoot"></div>';
    vi.resetModules();
    scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView
    });
  });

  afterEach(() => {
    mounted?.cleanup();
    mounted = null;
    settleImport?.();
    settleImport = null;
    vi.doUnmock('@options/app/productionStitchMobileNavigation');
    vi.resetModules();
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    document.body.innerHTML = '';
  });

  async function mountHeldNavigation() {
    const load = await holdMobileNavigationImport();
    settleImport = load.settle;
    const shell = await import('@options/app/productionStitchShell');
    mounted = shell.mountProductionStitchShell({
      controller: createController(),
      initialOptions: null,
      previewContent,
      getFooterMeta,
      getFooterView,
      getSettingsView,
      messages: null,
      language: 'en'
    });
    await load.requested;
    return load;
  }

  it('binds the newest fallback sidebar and hands focused navigation to the real owner once', async () => {
    const media = installControllableMobileMedia(true);
    const load = await mountHeldNavigation();
    const root = queryRequired<HTMLElement>('#optionsShellRoot');
    const firstSidebar = queryRequired<HTMLElement>('.sidebar');

    expect(root.hasAttribute('data-mobile-navigation-fallback')).toBe(true);
    expect(firstSidebar.hasAttribute('inert')).toBe(false);
    expect(document.querySelector('[data-mobile-navigation-trigger]')).toBeNull();

    mounted?.refreshOptions();
    await vi.waitFor(() => expect(document.querySelector('.sidebar')).not.toBe(firstSidebar));
    const newestSidebar = queryRequired<HTMLElement>('.sidebar');
    expect(newestSidebar).not.toBe(firstSidebar);
    expect(firstSidebar.isConnected).toBe(false);
    expect(document.querySelectorAll('.sidebar')).toHaveLength(1);
    expect(root.hasAttribute('data-mobile-navigation-fallback')).toBe(true);

    const output = navButton('output');
    output.focus();
    await load.resolve();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-mobile-navigation-trigger]')).not.toBeNull()
    );

    const trigger = queryRequired<HTMLButtonElement>('[data-mobile-navigation-trigger]');
    expect(root.hasAttribute('data-mobile-navigation-fallback')).toBe(false);
    expect(document.querySelector('.sidebar')).toBe(newestSidebar);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(navButton('overview'));
    expect(newestSidebar.hasAttribute('inert')).toBe(false);

    media.setMatches(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('executes pending section and modal actions immediately without replay on resolution', async () => {
    installControllableMobileMedia(true);
    const load = await mountHeldNavigation();
    const output = navButton('output');
    output.click();
    const outputHeading = queryRequired<HTMLElement>('[data-panel-id="output"] h1');
    expect(document.activeElement).toBe(outputHeading);
    expect(output.getAttribute('aria-current')).toBe('page');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });

    const support = queryRequired<HTMLButtonElement>('[data-footer-panel="support"]');
    support.click();
    const dialog = queryRequired<HTMLElement>('.resource-modal-overlay [role="dialog"]');
    expect(document.activeElement).toBe(dialog);

    await load.resolve();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-mobile-navigation-trigger]')).not.toBeNull()
    );

    const trigger = queryRequired<HTMLButtonElement>('[data-mobile-navigation-trigger]');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(dialog);
    expect(document.querySelectorAll('.resource-modal-overlay')).toHaveLength(1);

    queryRequired<HTMLElement>('.resource-modal-overlay').click();
    expect(document.activeElement).toBe(trigger);
    expect(document.querySelectorAll('[data-footer-panel][aria-current="page"]')).toHaveLength(0);
  });

  it('keeps a permanent latest-sidebar fallback after rejection and ignores late settlement after cleanup', async () => {
    const media = installControllableMobileMedia(true);
    const load = await mountHeldNavigation();
    const root = queryRequired<HTMLElement>('#optionsShellRoot');

    await load.reject();
    expect(root.hasAttribute('data-mobile-navigation-fallback')).toBe(true);
    expect(document.querySelector('[data-mobile-navigation-trigger]')).toBeNull();
    navButton('maintenance').click();
    expect(document.activeElement).toBe(
      queryRequired<HTMLElement>('[data-panel-id="maintenance"] h1')
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });

    media.setMatches(false);
    expect(root.hasAttribute('data-mobile-navigation-fallback')).toBe(false);
    media.setMatches(true);
    expect(root.hasAttribute('data-mobile-navigation-fallback')).toBe(true);

    mounted?.refreshOptions();
    expect(document.querySelectorAll('.sidebar')).toHaveLength(1);
    expect(root.hasAttribute('data-mobile-navigation-fallback')).toBe(true);

    mounted?.cleanup();
    mounted = null;
    expect(root.innerHTML).toBe('');
    expect(root.hasAttribute('data-mobile-navigation-fallback')).toBe(false);
    load.settle();
    await Promise.resolve();
    expect(root.innerHTML).toBe('');
    expect(root.hasAttribute('data-mobile-navigation-fallback')).toBe(false);
    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
