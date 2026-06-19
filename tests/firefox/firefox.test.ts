/**
 * Firefox 浏览器特定功能测试
 */
/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  detectBrowser,
  isFirefox,
  addBrowserClassToHtml
} from '../../src/shared/utils/browserDetection';
import {
  createFirefoxRuntimeMock,
  createChromeRuntimeMock,
  type FirefoxMockHandle,
  type ChromeMockHandle
} from '../utils/browserMocks';
import { createBrowserManifest } from '../../scripts/utils/manifestSources.mjs';

const globalAny = globalThis as typeof globalThis & { document?: Document };

let firefoxHandle: FirefoxMockHandle | null = null;
let chromeHandle: ChromeMockHandle | null = null;

function mockFirefoxEnvironment(): void {
  firefoxHandle?.restore();
  firefoxHandle = createFirefoxRuntimeMock();
  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0',
    configurable: true
  });
}

function mockChromeEnvironment(): void {
  chromeHandle?.restore();
  chromeHandle = createChromeRuntimeMock();
  Object.defineProperty(navigator, 'userAgent', {
    value:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    configurable: true
  });
}

describe('Firefox 浏览器检测', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    firefoxHandle?.restore();
    firefoxHandle = null;
    chromeHandle?.restore();
    chromeHandle = null;
  });

  it('应该正确检测 Firefox 环境', () => {
    mockFirefoxEnvironment();
    expect(detectBrowser()).toBe('firefox');
    expect(isFirefox()).toBe(true);
  });

  it('应该正确检测 Chrome 环境', () => {
    mockChromeEnvironment();
    expect(detectBrowser()).toBe('chrome');
    expect(isFirefox()).toBe(false);
  });

  it('应该为 Firefox 添加正确的 CSS 类', () => {
    mockFirefoxEnvironment();

    // Mock document.documentElement
    globalAny.document = {} as Document;
    const mockHtmlElement = {
      classList: {
        remove: vi.fn(),
        add: vi.fn()
      }
    };

    Object.defineProperty(document, 'documentElement', {
      value: mockHtmlElement,
      configurable: true
    });

    addBrowserClassToHtml();

    expect(mockHtmlElement.classList.add).toHaveBeenCalledWith('is-firefox');
  });
});

describe('Firefox 平台服务', () => {
  beforeEach(() => {
    mockFirefoxEnvironment();
    vi.clearAllMocks();
  });

  afterEach(() => {
    firefoxHandle?.restore();
    firefoxHandle = null;
  });

  it('应该使用 Firefox storage API', async () => {
    const { firefoxStorageService } = await import('../../src/platform/firefox/storage');

    const testKey = 'key';
    const testValue = 'value';
    await firefoxStorageService.sync.set(testKey, testValue);

    if (!firefoxHandle) {
      throw new Error('Firefox mock 尚未初始化');
    }
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const storageSet = vi.mocked(firefoxHandle.browser.storage.sync.set);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(storageSet).toHaveBeenCalledWith({ [testKey]: testValue });
  });

  it('应该使用 Firefox messaging API', async () => {
    const { firefoxMessagingService } = await import('../../src/platform/firefox/messaging');

    const testMessage = { action: 'test' };
    await firefoxMessagingService.send(testMessage);

    if (!firefoxHandle) {
      throw new Error('Firefox mock 尚未初始化');
    }
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const runtimeSendMessage = vi.mocked(firefoxHandle.browser.runtime.sendMessage);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(runtimeSendMessage).toHaveBeenCalledWith(testMessage);
  });

  it('应该优先通过 browserAction 设置徽标文本', async () => {
    const { firefoxActionService } = await import('../../src/platform/firefox/action');
    if (!firefoxHandle) {
      throw new Error('Firefox mock 尚未初始化');
    }
    const setBadgeText = firefoxHandle.actionMocks.primarySetBadgeText;
    setBadgeText?.mockResolvedValue(undefined);
    if (!setBadgeText) {
      throw new Error('primary badge text mock 初始化失败');
    }

    await firefoxActionService.setBadgeText?.({ text: '1', tabId: 10 });
    expect(setBadgeText).toHaveBeenCalledWith({ text: '1', tabId: 10 });
  });

  it('应该在缺少 browserAction 时回退到 action API', async () => {
    const { firefoxActionService } = await import('../../src/platform/firefox/action');
    if (!firefoxHandle) {
      throw new Error('Firefox mock 尚未初始化');
    }
    const fallbackSetBadgeText = firefoxHandle.actionMocks.fallbackSetBadgeText;
    fallbackSetBadgeText?.mockResolvedValue(undefined);
    if (firefoxHandle) {
      Object.defineProperty(firefoxHandle.browser.browserAction, 'setBadgeText', {
        configurable: true,
        writable: true,
        value: undefined
      });
    }
    if (!fallbackSetBadgeText) {
      throw new Error('fallback badge text mock 初始化失败');
    }

    await firefoxActionService.setBadgeText?.({ text: '2' });
    expect(fallbackSetBadgeText).toHaveBeenCalledWith({ text: '2' });
  });

  it('应该返回注销函数以移除点击监听', async () => {
    const { firefoxActionService } = await import('../../src/platform/firefox/action');
    if (!firefoxHandle) {
      throw new Error('Firefox mock 尚未初始化');
    }
    const addListener = firefoxHandle.actionMocks.onClickedAddListener;
    const removeListener = firefoxHandle.actionMocks.onClickedRemoveListener;
    if (!addListener || !removeListener) {
      throw new Error('action listener mocks 未初始化');
    }

    const listener = vi.fn();
    const dispose = firefoxActionService.onClicked(listener);
    expect(addListener).toHaveBeenCalledWith(expect.any(Function));
    const wrappedListener = addListener.mock.calls[0]?.[0];
    expect(typeof wrappedListener).toBe('function');

    dispose();
    expect(removeListener).toHaveBeenCalledWith(wrappedListener);
  });
});

describe('Firefox 特定功能', () => {
  beforeEach(() => {
    mockFirefoxEnvironment();
  });

  afterEach(() => {
    firefoxHandle?.restore();
    firefoxHandle = null;
  });

  it('应该处理 Firefox 特有的 API 差异', () => {
    // Firefox 使用 browser.* 而不是 chrome.*
    expect(typeof global.browser).toBe('object');
    expect(typeof global.chrome).toBe('undefined');
  });

  it('应该正确处理 Firefox 的 manifest 差异', () => {
    const firefoxManifest = createBrowserManifest('firefox') as {
      background?: {
        scripts?: string[];
        service_worker?: string;
      };
      browser_specific_settings?: {
        gecko?: {
          data_collection_permissions?: {
            required?: string[];
            optional?: string[];
          };
          strict_min_version?: string;
        };
        gecko_android?: {
          strict_min_version?: string;
        };
      };
    };
    const chromeManifest = createBrowserManifest('chrome') as {
      background?: {
        scripts?: string[];
        service_worker?: string;
      };
    };

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
