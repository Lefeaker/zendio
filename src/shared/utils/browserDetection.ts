/**
 * 浏览器检测工具
 * 用于识别当前运行的浏览器环境
 */

export type BrowserType = 'chrome' | 'firefox' | 'firefox-mobile' | 'edge' | 'safari' | 'unknown';

/**
 * 检测当前浏览器类型
 */
export function detectBrowser(): BrowserType {
  // 在扩展环境中检测
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    // 检测是否为 Edge（基于 Chromium）
    if (navigator.userAgent.includes('Edg/')) {
      return 'edge';
    }
    return 'chrome';
  }

  if (typeof browser !== 'undefined' && browser.runtime) {
    // Firefox 环境
    if (navigator.userAgent.includes('Mobile')) {
      return 'firefox-mobile';
    }
    return 'firefox';
  }

  // 在网页环境中检测
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes('firefox')) {
    return userAgent.includes('mobile') ? 'firefox-mobile' : 'firefox';
  }

  if (userAgent.includes('edg/')) {
    return 'edge';
  }

  if (userAgent.includes('chrome')) {
    return 'chrome';
  }

  if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
    return 'safari';
  }

  return 'unknown';
}

/**
 * 检测是否为 Firefox 环境
 */
export function isFirefox(): boolean {
  const browser = detectBrowser();
  return browser === 'firefox' || browser === 'firefox-mobile';
}

/**
 * 检测是否为 Chrome 环境
 */
export function isChrome(): boolean {
  return detectBrowser() === 'chrome';
}

/**
 * 检测是否为移动浏览器
 */
export function isMobile(): boolean {
  const browser = detectBrowser();
  return (
    browser === 'firefox-mobile' ||
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );
}

/**
 * 为 HTML 元素添加浏览器特定的 CSS 类
 */
export function addBrowserClassToHtml(): void {
  const browser = detectBrowser();
  const htmlElement = document.documentElement;

  // 移除所有浏览器类
  htmlElement.classList.remove(
    'is-chrome',
    'is-firefox',
    'is-firefox-mobile',
    'is-edge',
    'is-safari',
    'is-mobile'
  );

  // 添加当前浏览器类
  switch (browser) {
    case 'chrome':
      htmlElement.classList.add('is-chrome');
      break;
    case 'firefox':
      htmlElement.classList.add('is-firefox');
      break;
    case 'firefox-mobile':
      htmlElement.classList.add('is-firefox', 'is-firefox-mobile', 'is-mobile');
      break;
    case 'edge':
      htmlElement.classList.add('is-edge');
      break;
    case 'safari':
      htmlElement.classList.add('is-safari');
      break;
  }

  // 添加移动设备类
  if (isMobile()) {
    htmlElement.classList.add('is-mobile');
  }
}

/**
 * 获取浏览器版本信息
 */
export function getBrowserVersion(): string {
  const userAgent = navigator.userAgent;
  const browser = detectBrowser();

  let match: RegExpMatchArray | null = null;

  switch (browser) {
    case 'firefox':
    case 'firefox-mobile':
      match = userAgent.match(/Firefox\/(\d+\.\d+)/);
      break;
    case 'chrome':
      match = userAgent.match(/Chrome\/(\d+\.\d+)/);
      break;
    case 'edge':
      match = userAgent.match(/Edg\/(\d+\.\d+)/);
      break;
    case 'safari':
      match = userAgent.match(/Version\/(\d+\.\d+)/);
      break;
  }

  return match ? match[1] : 'unknown';
}

/**
 * 检测浏览器是否支持特定功能
 */
export interface BrowserCapabilities {
  webExtensions: boolean;
  serviceWorker: boolean;
  clipboardAPI: boolean;
  notificationsAPI: boolean;
  contextMenus: boolean;
}

export function getBrowserCapabilities(): BrowserCapabilities {
  const browser = detectBrowser();

  return {
    webExtensions: browser !== 'unknown',
    serviceWorker: 'serviceWorker' in navigator,
    clipboardAPI: 'clipboard' in navigator,
    notificationsAPI: 'Notification' in window,
    contextMenus: browser === 'chrome' || browser === 'firefox' || browser === 'edge'
  };
}
