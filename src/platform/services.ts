import {
  chromeActionService,
  chromeContextMenusService,
  chromeDownloadsService,
  chromeFileSystemAccessService,
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
import { configureSessionDraftRuntimeMessenger } from '../content/sessionDrafts/sessionDraftTabContext';
import {
  configureI18nRuntimeAssetUrlResolver,
  configureI18nRuntimeLanguageProvider
} from '../i18n';
import { detectBrowser } from '../shared/utils/browserDetection';
/**
 * 检测当前浏览器环境
 */
function detectBrowserEnvironment(): 'chrome' | 'firefox' | 'unknown' {
  const detectedBrowser = detectBrowser();
  if (
    (detectedBrowser === 'firefox' || detectedBrowser === 'firefox-mobile') &&
    typeof browser !== 'undefined' &&
    browser.runtime
  ) {
    return 'firefox';
  }

  if (typeof browser !== 'undefined' && browser.runtime && typeof chrome === 'undefined') {
    return 'firefox';
  }

  if (typeof chrome !== 'undefined' && chrome.runtime) {
    return 'chrome';
  }

  return 'unknown';
}

function configureRuntimePorts(runtime: PlatformServices['runtime'] | null): void {
  configureSessionDraftRuntimeMessenger(
    runtime && typeof runtime.sendMessage === 'function'
      ? (message) => runtime.sendMessage!(message)
      : null
  );
  configureI18nRuntimeLanguageProvider(
    runtime && typeof runtime.getUILanguage === 'function' ? () => runtime.getUILanguage!() : null
  );
  configureI18nRuntimeAssetUrlResolver(runtime ? (path) => runtime.getURL(path) : null);
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
    fileSystemAccess: chromeFileSystemAccessService,
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
  const services = registry.resolve<PlatformServices>(TOKENS.platformServices);
  configureRuntimePorts(services.runtime);
  return services;
}

/**
 * 配置平台服务覆盖
 * @param overrides 要覆盖的服务
 */
export function configurePlatformServices(overrides: PartialPlatformServices): void {
  registry.register(TOKENS.platformServices, () => {
    const services = {
      ...createDefaultServices(),
      ...overrides
    };
    configureRuntimePorts(services.runtime);
    return services;
  });
}

/**
 * 重置平台服务为默认实现
 */
export function resetPlatformServices(): void {
  configureRuntimePorts(null);
  registry.dispose(TOKENS.platformServices);
  registry.register(TOKENS.platformServices, createDefaultServices);
}
