import { createScopedRegistry, registry, TOKENS, type ScopedServiceRegistry } from '../shared/di';
import { createErrorHandler, type ErrorHandler } from '../shared/errors/errorHandler';
import { registerGlobalErrorBoundary } from '../shared/errors/globalErrorBoundary';
import {
  configureGlobalStateManagerStorage,
  createGlobalStateManager
} from '../shared/state/globalStateManager';
import { createPopupCoordinator } from './runtime/popupCoordinator';
import { addBrowserClassToHtml } from '../shared/utils/browserDetection';
import type { StorageService } from '../platform/interfaces/storage';

type PlatformModule = { getPlatformServices: () => unknown };
type ContentStyleManagers = {
  clipperStyleSheetManager: { initialize: () => void };
  panelStyleSheetManager: { initialize: () => void };
};
type ContentAnalyticsModule = {
  initializeContentErrorAnalytics: (
    storage: StorageService,
    errorHandler: Pick<ErrorHandler, 'addReporter'>
  ) => Promise<void>;
};

const defaultPlatformModuleLoader = (): PlatformModule => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
  return require('../platform') as PlatformModule;
};

const defaultStyleManagersLoader = (): ContentStyleManagers => {
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
const defaultAnalyticsModuleLoader = async (): Promise<ContentAnalyticsModule> =>
  import('./contentErrorAnalyticsBootstrap');
let loadPlatformModuleForContentBootstrap = defaultPlatformModuleLoader;
let loadStyleManagersForContentBootstrap = defaultStyleManagersLoader;
let loadAnalyticsModuleForContentBootstrap = defaultAnalyticsModuleLoader;

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

export function __setContentBootstrapLoadersForTests(
  overrides: {
    loadPlatformModule?: (() => PlatformModule) | null;
    loadAnalyticsModule?: (() => Promise<ContentAnalyticsModule>) | null;
    loadStyleManagers?: (() => ContentStyleManagers) | null;
  } | null
): void {
  loadPlatformModuleForContentBootstrap =
    overrides?.loadPlatformModule ?? defaultPlatformModuleLoader;
  loadStyleManagersForContentBootstrap = overrides?.loadStyleManagers ?? defaultStyleManagersLoader;
  loadAnalyticsModuleForContentBootstrap =
    overrides?.loadAnalyticsModule ?? defaultAnalyticsModuleLoader;
}

export class ContentScriptContext {
  private scopedRegistry: ScopedServiceRegistry;
  private isDisposed = false;
  private cleanupGlobalErrorBoundary: (() => void) | null = null;
  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.closeActivePopups({ transient: true });
    }
  };
  private readonly handlePageHide = (event: PageTransitionEvent): void => {
    if (event.persisted) {
      this.closeActivePopups({ transient: true });
    }
  };

  constructor(storage?: StorageService) {
    this.scopedRegistry = createScopedRegistry(registry);
    addBrowserClassToHtml();
    this.bootstrapDependencies(storage);
    const { clipperStyleSheetManager, panelStyleSheetManager } =
      loadStyleManagersForContentBootstrap();
    clipperStyleSheetManager.initialize();
    panelStyleSheetManager.initialize();

    this.setupCleanupListeners();
  }

  getRegistry(): ScopedServiceRegistry {
    return this.scopedRegistry;
  }

  getService<T>(token: symbol): T {
    if (this.isDisposed) {
      throw new Error('[ContentScriptContext] Context has been disposed');
    }
    return this.scopedRegistry.resolve<T>(token);
  }

  get disposed(): boolean {
    return this.isDisposed;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    console.log('[ContentScript] Disposing context...');
    this.isDisposed = true;
    this.scopedRegistry.disposeScope();
    this.cleanupGlobalErrorBoundary?.();
    this.cleanupGlobalErrorBoundary = null;
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
    const resolvedStorage = resolveContentBootstrapStorage(storage);
    configureGlobalStateManagerStorage(resolvedStorage);

    const errorHandler = createErrorHandler();
    this.scopedRegistry.register(TOKENS.errorHandler, () => errorHandler);
    this.cleanupGlobalErrorBoundary?.();
    this.cleanupGlobalErrorBoundary = registerGlobalErrorBoundary({
      domain: 'content',
      errorHandler,
      metadata: {
        extensionContext: 'content'
      },
      target: window
    });
    this.initializeErrorAnalytics(resolvedStorage, errorHandler);
    this.scopedRegistry.register(TOKENS.globalStateManager, createGlobalStateManager);
    this.scopedRegistry.register(TOKENS.dialogRegistry, createPopupCoordinator);

    console.log('[ContentScript] Scoped dependencies bootstrapped');
  }

  private initializeErrorAnalytics(
    storage: StorageService,
    errorHandler: Pick<ErrorHandler, 'addReporter'>
  ): void {
    void loadAnalyticsModuleForContentBootstrap()
      .then(({ initializeContentErrorAnalytics }) =>
        initializeContentErrorAnalytics(storage, errorHandler)
      )
      .catch((error) => {
        console.warn('[ContentScript] Failed to initialize error analytics:', error);
      });
  }

  private setupCleanupListeners(): void {
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

  private closeActivePopups(options: { transient?: boolean } = {}): void {
    try {
      const popupCoordinator = this.scopedRegistry.resolve<
        ReturnType<typeof createPopupCoordinator>
      >(TOKENS.dialogRegistry);
      if (options.transient) {
        popupCoordinator.closeTransient();
        return;
      }
      popupCoordinator.closeAll();
    } catch (error) {
      console.warn('[ContentScript] Failed to close active popups:', error);
    }
  }
}

let globalContentContext: ContentScriptContext | null = null;

export function getGlobalContentContext(storage?: StorageService): ContentScriptContext {
  if (!globalContentContext || globalContentContext.disposed) {
    globalContentContext = new ContentScriptContext(storage);
  }
  return globalContentContext;
}

export function resetGlobalContentContext(): void {
  if (globalContentContext) {
    globalContentContext.dispose();
    globalContentContext = null;
  }
}

export function getContentService<T>(token: symbol): T {
  const context = getGlobalContentContext();
  return context.getService<T>(token);
}

export function bootstrapContentScript(storage?: StorageService): ContentScriptContext {
  console.log('[ContentScript] Bootstrapping...');
  const context = getGlobalContentContext(storage);
  console.log('[ContentScript] Bootstrap complete');
  return context;
}
