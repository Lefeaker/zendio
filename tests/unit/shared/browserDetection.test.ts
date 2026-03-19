/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';

import { detectBrowser, isFirefox, isChrome, isMobile, addBrowserClassToHtml, getBrowserVersion, getBrowserCapabilities } from '@shared/utils/browserDetection';

function installChromeRuntime(): void {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    writable: true,
    value: { runtime: {} } as unknown as typeof chrome
  });
}

function installBrowserRuntime(): void {
  Object.defineProperty(globalThis, 'browser', {
    configurable: true,
    writable: true,
    value: { runtime: {} } as unknown as typeof browser
  });
}

describe('browserDetection', () => {
  const defineUserAgent = (userAgent: string): void => {
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: userAgent });
  };

  beforeEach(() => {
    document.documentElement.className = '';
  });

  it('detects chrome and edge extension environments', () => {
    defineUserAgent('Mozilla/5.0 Chrome/123.0 Edg/123.0');
    installChromeRuntime();
    expect(detectBrowser()).toBe('edge');
    expect(isChrome()).toBe(false);
  });

  it('detects firefox mobile and adds html classes', () => {
    defineUserAgent('Mozilla/5.0 Firefox/124.0 Mobile');
    delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
    installBrowserRuntime();

    expect(detectBrowser()).toBe('firefox-mobile');
    expect(isFirefox()).toBe(true);
    expect(isMobile()).toBe(true);

    addBrowserClassToHtml();
    expect(document.documentElement.classList.contains('is-firefox-mobile')).toBe(true);
    expect(document.documentElement.classList.contains('is-mobile')).toBe(true);
  });

  it('detects safari in web mode and reports capabilities', () => {
    delete (globalThis as typeof globalThis & { browser?: unknown }).browser;
    delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
    defineUserAgent('Mozilla/5.0 Version/17.2 Safari/605.1.15');
    expect(detectBrowser()).toBe('safari');
    expect(getBrowserVersion()).toBe('17.2');
    expect(getBrowserCapabilities()).toEqual({
      webExtensions: true,
      serviceWorker: 'serviceWorker' in navigator,
      clipboardAPI: 'clipboard' in navigator,
      notificationsAPI: 'Notification' in window,
      contextMenus: false
    });
  });

  it('returns unknown version for unknown browsers', () => {
    delete (globalThis as typeof globalThis & { browser?: unknown }).browser;
    delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: 'CustomAgent/1.0' });
    expect(detectBrowser()).toBe('unknown');
    expect(getBrowserVersion()).toBe('unknown');
  });

});
