import {
  chromeActionService,
  chromeContextMenusService,
  chromeDownloadsService,
  chromeMessagingService,
  chromeNotificationsService,
  chromeRuntimeService,
  chromeScriptingService,
  chromeStorageService,
  chromeTabsService
} from './chrome';
import { createFirefoxServices } from './firefox';
import type { PartialPlatformServices, PlatformServices } from './types';
import { registry, TOKENS } from '../shared/di';
import { createFetchRestClient } from '../infrastructure/restClient';
/**
 * 检测当前浏览器环境
 */
function detectBrowserEnvironment(): 'chrome' | 'firefox' | 'unknown' {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    return 'chrome';
  }
  if (typeof browser !== 'undefined' && browser.runtime) {
    return 'firefox';
  }
  return 'unknown';
}

function createDefaultServices(): PlatformServices {
  const browserEnv = detectBrowserEnvironment();

  if (browserEnv === 'firefox') {
    return createFirefoxServices();
  }

  // 默认使用 Chrome 服务
  const storage = chromeStorageService;

  return {
    // Chrome API 服务
    storage,
    messaging: chromeMessagingService,
    runtime: chromeRuntimeService,
    contextMenus: chromeContextMenusService,
    downloads: chromeDownloadsService,
    notifications: chromeNotificationsService,
    tabs: chromeTabsService,
    action: chromeActionService,
    scripting: chromeScriptingService,

    // 业务级服务
    restClient: createFetchRestClient()
  };
}

/**
 * 获取平台服务实例
 * 现在通过依赖注入容器获取，支持测试时的服务替换
 */
export function getPlatformServices(): PlatformServices {
  if (!registry.has(TOKENS.platformServices)) {
    // 自动注册默认服务（向后兼容）
    registry.register(TOKENS.platformServices, createDefaultServices);
  }
  return registry.resolve<PlatformServices>(TOKENS.platformServices);
}

/**
 * 配置平台服务覆盖
 * @param overrides 要覆盖的服务
 */
export function configurePlatformServices(overrides: PartialPlatformServices): void {
  registry.register(TOKENS.platformServices, () => {
    return {
      ...createDefaultServices(),
      ...overrides
    };
  });
}

/**
 * 重置平台服务为默认实现
 */
export function resetPlatformServices(): void {
  registry.dispose(TOKENS.platformServices);
  registry.register(TOKENS.platformServices, createDefaultServices);
}
