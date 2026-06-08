/**
 * 内容脚本依赖注入引导程序
 * 负责为内容脚本创建作用域依赖
 */

import { createScopedRegistry, registry, TOKENS, type ScopedServiceRegistry } from '../shared/di';
import { TRACK_TELEMETRY_EVENT, type RuntimeExtensionErrorParams } from '../shared/types/analytics';
import { createErrorHandler } from '../shared/errors/errorHandler';
import { registerGlobalErrorBoundary } from '../shared/errors/globalErrorBoundary';
import { configureAnalyticsConfigManager } from '../shared/errors/analytics/analyticsConfig';
import { initializeErrorAnalytics } from '../shared/errors/analytics';
import {
  configureGlobalStateManagerStorage,
  createGlobalStateManager
} from '../shared/state/globalStateManager';
import { createPopupCoordinator } from './runtime/popupCoordinator';
import { addBrowserClassToHtml } from '../shared/utils/browserDetection';
import type { StorageService } from '../platform/interfaces/storage';
import type { PlatformServices } from '../platform/types';

type PlatformModule = { getPlatformServices: () => unknown };
type ContentStyleManagers = {
  clipperStyleSheetManager: { initialize: () => void };
  panelStyleSheetManager: { initialize: () => void };
};

let loadPlatformModuleForContentBootstrap = (): PlatformModule => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
  return require('../platform') as PlatformModule;
};

let loadStyleManagersForContentBootstrap = (): ContentStyleManagers => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { clipperStyleSheetManager } = require('./clipper/shared/styleSheetManager') as {
    clipperStyleSheetManager: { initialize: () => void };
  };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { panelStyleSheetManager } = require('./shared/panels/styleSheetManager') as {
    panelStyleSheetManager: { initialize: () => void };
  };
  return { clipperStyleSheetManager, panelStyleSheetManager };
};

let contentBootstrapStorage: StorageService | null = null;

export function configureContentBootstrapStorage(storage: StorageService): void {
  contentBootstrapStorage = storage;
}

function resolveContentBootstrapStorage(storage?: StorageService): StorageService {
  if (storage) {
    contentBootstrapStorage = storage;
    return storage;
  }

  if (!contentBootstrapStorage) {
    throw new Error('[ContentScript] StorageService is required for bootstrap.');
  }

  return contentBootstrapStorage;
}

async function emitContentErrorTelemetry(params: RuntimeExtensionErrorParams): Promise<void> {
  const platformServices = registry.resolve<PlatformServices>(TOKENS.platformServices);
  await platformServices.messaging.send({
    type: TRACK_TELEMETRY_EVENT,
    event: 'extension_error',
    params
  });
}

export function __setContentBootstrapLoadersForTests(
  overrides: {
    loadPlatformModule?: (() => PlatformModule) | null;
    loadStyleManagers?: (() => ContentStyleManagers) | null;
  } | null
): void {
  loadPlatformModuleForContentBootstrap =
    overrides?.loadPlatformModule ??
    (() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
      return require('../platform') as PlatformModule;
    });
  loadStyleManagersForContentBootstrap =
    overrides?.loadStyleManagers ??
    (() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { clipperStyleSheetManager } = require('./clipper/shared/styleSheetManager') as {
        clipperStyleSheetManager: { initialize: () => void };
      };
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { panelStyleSheetManager } = require('./shared/panels/styleSheetManager') as {
        panelStyleSheetManager: { initialize: () => void };
      };
      return { clipperStyleSheetManager, panelStyleSheetManager };
    });
}

/**
 * 内容脚本依赖上下文
 * 管理单个内容脚本实例的依赖
 */
export class ContentScriptContext {
  private scopedRegistry: ScopedServiceRegistry;
  private isDisposed = false;
  private cleanupGlobalErrorBoundary: (() => void) | null = null;
  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.closeActivePopups();
    }
  };
  private readonly handlePageHide = (): void => {
    this.closeActivePopups();
  };

  constructor(storage?: StorageService) {
    // 创建作用域注册表，继承全局注册表
    this.scopedRegistry = createScopedRegistry(registry);

    // 添加浏览器特定的 CSS 类
    addBrowserClassToHtml();

    // 先初始化依赖注入，再初始化样式
    this.bootstrapDependencies(storage);

    // 预初始化 Shadow DOM 样式（依赖 DI 已就绪）
    const { clipperStyleSheetManager, panelStyleSheetManager } =
      loadStyleManagersForContentBootstrap();
    clipperStyleSheetManager.initialize();
    panelStyleSheetManager.initialize();

    this.setupCleanupListeners();
  }

  /**
   * 获取作用域注册表
   */
  getRegistry(): ScopedServiceRegistry {
    return this.scopedRegistry;
  }

  /**
   * 获取服务实例
   */
  getService<T>(token: symbol): T {
    if (this.isDisposed) {
      throw new Error('[ContentScriptContext] Context has been disposed');
    }
    return this.scopedRegistry.resolve<T>(token);
  }

  /**
   * 检查上下文是否已释放
   */
  get disposed(): boolean {
    return this.isDisposed;
  }

  /**
   * 释放上下文资源
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    console.log('[ContentScript] Disposing context...');
    this.isDisposed = true;

    // 清理作用域注册表
    this.scopedRegistry.disposeScope();
    this.cleanupGlobalErrorBoundary?.();
    this.cleanupGlobalErrorBoundary = null;

    // 移除事件监听器
    this.removeCleanupListeners();

    console.log('[ContentScript] Context disposed');
  }

  private bootstrapDependencies(storage?: StorageService): void {
    console.log('[ContentScript] Bootstrapping scoped dependencies...');

    // 确保全局 registry 已注册 platformServices (styleRegistry 需要)
    if (!registry.has(TOKENS.platformServices)) {
      const { getPlatformServices } = loadPlatformModuleForContentBootstrap();
      registry.register(TOKENS.platformServices, getPlatformServices);
    }
    configureGlobalStateManagerStorage(resolveContentBootstrapStorage(storage));
    configureAnalyticsConfigManager(resolveContentBootstrapStorage(storage));

    // 注册内容脚本特定的错误处理器
    const errorHandler = createErrorHandler();
    this.scopedRegistry.register(TOKENS.errorHandler, () => {
      // 内容脚本的错误处理可能需要特殊配置
      // 例如：不显示通知，只记录到控制台

      return errorHandler;
    });
    this.cleanupGlobalErrorBoundary?.();
    this.cleanupGlobalErrorBoundary = registerGlobalErrorBoundary({
      domain: 'content',
      errorHandler,
      metadata: {
        extensionContext: 'content'
      },
      target: window
    });
    void initializeErrorAnalytics(errorHandler, {
      emitTelemetryEvent: emitContentErrorTelemetry
    }).catch((error) => {
      console.warn('[ContentScript] Failed to initialize error analytics:', error);
    });

    // 注册内容脚本特定的状态管理器
    this.scopedRegistry.register(TOKENS.globalStateManager, createGlobalStateManager);

    // 注册内容侧统一 popup coordinator
    this.scopedRegistry.register(TOKENS.dialogRegistry, createPopupCoordinator);

    console.log('[ContentScript] Scoped dependencies bootstrapped');
  }

  private setupCleanupListeners(): void {
    // 页面卸载时自动清理
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    window.addEventListener('pagehide', this.handlePageHide, { passive: true });
    document.addEventListener('visibilitychange', this.handleVisibilityChange, { passive: true });
  }

  private removeCleanupListeners(): void {
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    window.removeEventListener('pagehide', this.handlePageHide);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private handleBeforeUnload = (): void => {
    this.dispose();
  };

  private closeActivePopups(): void {
    try {
      this.scopedRegistry
        .resolve<ReturnType<typeof createPopupCoordinator>>(TOKENS.dialogRegistry)
        .closeAll();
    } catch (error) {
      console.warn('[ContentScript] Failed to close active popups:', error);
    }
  }
}

/**
 * 全局内容脚本上下文实例
 */
let globalContentContext: ContentScriptContext | null = null;

/**
 * 获取全局内容脚本上下文
 * 如果不存在则创建新实例
 */
export function getGlobalContentContext(storage?: StorageService): ContentScriptContext {
  if (!globalContentContext || globalContentContext.disposed) {
    globalContentContext = new ContentScriptContext(storage);
  }
  return globalContentContext;
}

/**
 * 重置全局内容脚本上下文
 * 主要用于测试或脚本重新注入
 */
export function resetGlobalContentContext(): void {
  if (globalContentContext) {
    globalContentContext.dispose();
    globalContentContext = null;
  }
}

/**
 * 便捷函数：获取内容脚本服务
 */
export function getContentService<T>(token: symbol): T {
  const context = getGlobalContentContext();
  return context.getService<T>(token);
}

/**
 * 内容脚本引导函数
 * 在内容脚本入口调用
 */
export function bootstrapContentScript(storage?: StorageService): ContentScriptContext {
  console.log('[ContentScript] Bootstrapping...');

  const context = getGlobalContentContext(storage);

  console.log('[ContentScript] Bootstrap complete');
  return context;
}
