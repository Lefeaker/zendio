/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import {
  addBrowserClassToHtml,
  detectBrowser,
  isFirefox
} from '../../../../src/shared/utils/browserDetection';

const originalUserAgent = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent');

describe('Firefox browser detection compatibility ledger', () => {
  afterEach(() => {
    document.documentElement.className = '';
    if (originalUserAgent) {
      Object.defineProperty(window.navigator, 'userAgent', originalUserAgent);
    } else {
      Reflect.deleteProperty(window.navigator, 'userAgent');
    }
  });

  it('[R01-FIREFOX-DETECTION-01] detects Firefox from its user agent', () => {
    installUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0');

    expect(detectBrowser()).toBe('firefox');
    expect(isFirefox()).toBe(true);
  });

  it('[R01-FIREFOX-DETECTION-02] detects a non-Firefox Chrome browser', () => {
    installUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    expect(detectBrowser()).toBe('chrome');
    expect(isFirefox()).toBe(false);
  });

  it('[R01-FIREFOX-DETECTION-03] applies the Firefox CSS class to the document root', () => {
    installUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0');

    addBrowserClassToHtml();

    expect(document.documentElement.classList.contains('is-firefox')).toBe(true);
    expect(document.documentElement.classList.contains('is-chrome')).toBe(false);
  });
});

function installUserAgent(userAgent: string): void {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent
  });
}
