/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorHandler } from '../../../src/shared/errors/errorHandler';
import type { StorageService } from '../../../src/platform/interfaces/storage';

type TestErrorHandler = Pick<ErrorHandler, 'addReporter'> & {
  kind: 'error-handler';
};
type ContentAnalyticsModule = {
  initializeContentErrorAnalytics: (
    storage: StorageService,
    errorHandler: Pick<ErrorHandler, 'addReporter'>
  ) => Promise<void>;
};
type GlobalErrorBoundaryArgs = {
  domain: string;
  errorHandler: TestErrorHandler;
  metadata: {
    extensionContext: string;
  };
  target: Window & typeof globalThis;
};

const addBrowserClassToHtmlMock = vi.hoisted(() => vi.fn());
const createErrorHandlerMock = vi.hoisted(() =>
  vi.fn<() => TestErrorHandler>(() => ({
    kind: 'error-handler',
    addReporter: vi.fn<ErrorHandler['addReporter']>(() => vi.fn())
  }))
);
const createGlobalStateManagerMock = vi.hoisted(() => vi.fn(() => ({ kind: 'global-state' })));
const configureGlobalStateManagerStorageMock = vi.hoisted(() => vi.fn());
const createPopupCoordinatorMock = vi.hoisted(() => vi.fn(() => ({ closeAll: vi.fn() })));
const clipperInitializeMock = vi.hoisted(() => vi.fn());
const panelInitializeMock = vi.hoisted(() => vi.fn());
const getPlatformServicesMock = vi.hoisted(() => vi.fn(() => ({ kind: 'platform-services' })));
const registerGlobalErrorBoundaryMock = vi.hoisted(() =>
  vi.fn<(args: GlobalErrorBoundaryArgs) => () => void>(() => vi.fn())
);
const configureAnalyticsConfigManagerMock = vi.hoisted(() => vi.fn());
const initializeErrorAnalyticsMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const initializeContentErrorAnalyticsMock = vi.hoisted(() =>
  vi.fn<
    (storage: StorageService, errorHandler: Pick<ErrorHandler, 'addReporter'>) => Promise<void>
  >(() => Promise.resolve(undefined))
);
const loadAnalyticsModuleMock = vi.hoisted(() =>
  vi.fn<() => Promise<ContentAnalyticsModule>>(() =>
    Promise.resolve({
      initializeContentErrorAnalytics: initializeContentErrorAnalyticsMock
    })
  )
);
const storageMock = vi.hoisted(() => ({
  local: { kind: 'local' },
  sync: { kind: 'sync' }
})) as unknown as StorageService;
const registryState = vi.hoisted(() => ({ hasPlatform: false }));
const registryMock = vi.hoisted(() => ({
  has: vi.fn((token?: symbol) =>
    token?.description === 'platformServices' ? registryState.hasPlatform : false
  ),
  register: vi.fn((token: symbol) => {
    if (token.description === 'platformServices') {
      registryState.hasPlatform = true;
    }
  })
}));
const scopedRegistryMock = vi.hoisted(() => ({
  register: vi.fn(),
  resolve: vi.fn(),
  has: vi.fn(() => false),
  disposeScope: vi.fn()
}));
const createScopedRegistryMock = vi.hoisted(() => vi.fn(() => scopedRegistryMock));
const TOKENS = vi.hoisted(() => ({
  platformServices: Symbol('platformServices'),
  errorHandler: Symbol('errorHandler'),
  globalStateManager: Symbol('globalStateManager'),
  dialogRegistry: Symbol('dialogRegistry')
}));

vi.mock('../../../src/shared/di', () => ({
  createScopedRegistry: createScopedRegistryMock,
  registry: registryMock,
  TOKENS
}));
vi.mock('../../../src/shared/errors/errorHandler', () => ({
  createErrorHandler: createErrorHandlerMock
}));
vi.mock('../../../src/shared/errors/globalErrorBoundary', () => ({
  registerGlobalErrorBoundary: registerGlobalErrorBoundaryMock
}));
vi.mock('../../../src/shared/errors/analytics/analyticsConfig', () => ({
  configureAnalyticsConfigManager: configureAnalyticsConfigManagerMock
}));
vi.mock('../../../src/shared/errors/analytics', () => ({
  initializeErrorAnalytics: initializeErrorAnalyticsMock
}));
vi.mock('../../../src/shared/state/globalStateManager', () => ({
  createGlobalStateManager: createGlobalStateManagerMock,
  configureGlobalStateManagerStorage: configureGlobalStateManagerStorageMock
}));
vi.mock('../../../src/content/runtime/popupCoordinator', () => ({
  createPopupCoordinator: createPopupCoordinatorMock
}));
vi.mock('../../../src/shared/utils/browserDetection', () => ({
  addBrowserClassToHtml: addBrowserClassToHtmlMock
}));
vi.mock('../../../src/content/clipper/shared/styleSheetManager', () => ({
  clipperStyleSheetManager: { initialize: clipperInitializeMock }
}));
vi.mock('../../../src/content/shared/panels/styleSheetManager', () => ({
  panelStyleSheetManager: { initialize: panelInitializeMock }
}));
vi.mock('../../../src/platform', () => ({ getPlatformServices: getPlatformServicesMock }));

describe('content/bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    registryState.hasPlatform = true;
    document.body.innerHTML = '';
  });

  afterEach(async () => {
    const mod = await import('../../../src/content/bootstrap');
    mod.resetGlobalContentContext();
    mod.__setContentBootstrapLoadersForTests(null);
  });

  it('bootstraps scoped services and style managers on context construction', async () => {
    const { ContentScriptContext, __setContentBootstrapLoadersForTests } =
      await import('../../../src/content/bootstrap');
    __setContentBootstrapLoadersForTests({
      loadPlatformModule: () => ({
        getPlatformServices: getPlatformServicesMock
      }),
      loadAnalyticsModule: loadAnalyticsModuleMock,
      loadStyleManagers: () => ({
        clipperStyleSheetManager: { initialize: clipperInitializeMock },
        panelStyleSheetManager: { initialize: panelInitializeMock }
      })
    });
    const context = new ContentScriptContext(storageMock);
    await Promise.resolve();

    expect(createScopedRegistryMock).toHaveBeenCalledWith(registryMock);
    expect(addBrowserClassToHtmlMock).toHaveBeenCalledTimes(1);
    expect(configureGlobalStateManagerStorageMock).toHaveBeenCalledTimes(1);
    expect(loadAnalyticsModuleMock).toHaveBeenCalledTimes(1);
    expect(initializeContentErrorAnalyticsMock).toHaveBeenCalledTimes(1);
    const analyticsInitCall = initializeContentErrorAnalyticsMock.mock.calls[0];
    expect(analyticsInitCall?.[0]).toBe(storageMock);
    expect(typeof analyticsInitCall?.[1]?.addReporter).toBe('function');
    expect(scopedRegistryMock.register).toHaveBeenCalledWith(
      TOKENS.errorHandler,
      expect.any(Function)
    );
    expect(registerGlobalErrorBoundaryMock).toHaveBeenCalledTimes(1);
    const boundaryRegistration = registerGlobalErrorBoundaryMock.mock.calls[0]?.[0];
    expect(boundaryRegistration?.domain).toBe('content');
    expect(boundaryRegistration?.metadata?.extensionContext).toBe('content');
    expect(boundaryRegistration?.target).toBe(window);
    expect(configureAnalyticsConfigManagerMock).not.toHaveBeenCalled();
    expect(initializeErrorAnalyticsMock).not.toHaveBeenCalled();
    expect(scopedRegistryMock.register).toHaveBeenCalledWith(
      TOKENS.globalStateManager,
      createGlobalStateManagerMock
    );
    expect(scopedRegistryMock.register).toHaveBeenCalledWith(
      TOKENS.dialogRegistry,
      createPopupCoordinatorMock
    );
    expect(clipperInitializeMock).toHaveBeenCalledTimes(1);
    expect(panelInitializeMock).toHaveBeenCalledTimes(1);
    expect(context.disposed).toBe(false);

    context.dispose();
  });

  it('exposes services, closes popups during page visibility changes, and disposes on beforeunload', async () => {
    const dialogRegistry = { closeAll: vi.fn() };
    const customToken = Symbol('custom');
    scopedRegistryMock.has.mockImplementation((token?: symbol) => token === TOKENS.dialogRegistry);
    scopedRegistryMock.resolve.mockImplementation((token: symbol) => {
      if (token === TOKENS.dialogRegistry) {
        return dialogRegistry;
      }
      if (token === customToken) {
        return { ok: true };
      }
      return null;
    });

    const { ContentScriptContext, __setContentBootstrapLoadersForTests } =
      await import('../../../src/content/bootstrap');
    __setContentBootstrapLoadersForTests({
      loadPlatformModule: () => ({
        getPlatformServices: getPlatformServicesMock
      }),
      loadAnalyticsModule: loadAnalyticsModuleMock,
      loadStyleManagers: () => ({
        clipperStyleSheetManager: { initialize: clipperInitializeMock },
        panelStyleSheetManager: { initialize: panelInitializeMock }
      })
    });
    const context = new ContentScriptContext(storageMock);
    expect(context.getService<{ ok: boolean }>(customToken)).toEqual({ ok: true });

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    expect(dialogRegistry.closeAll).toHaveBeenCalledTimes(2);
    expect(context.disposed).toBe(false);

    window.dispatchEvent(new Event('beforeunload'));
    expect(context.disposed).toBe(true);
    expect(scopedRegistryMock.disposeScope).toHaveBeenCalledTimes(1);
    expect(() => context.getService(customToken)).toThrow(/disposed/);
  });

  it('reuses and resets the global content context helpers', async () => {
    const mod = await import('../../../src/content/bootstrap');
    mod.__setContentBootstrapLoadersForTests({
      loadPlatformModule: () => ({
        getPlatformServices: getPlatformServicesMock
      }),
      loadAnalyticsModule: loadAnalyticsModuleMock,
      loadStyleManagers: () => ({
        clipperStyleSheetManager: { initialize: clipperInitializeMock },
        panelStyleSheetManager: { initialize: panelInitializeMock }
      })
    });
    mod.configureContentBootstrapStorage(storageMock);
    const first = mod.getGlobalContentContext();
    const second = mod.getGlobalContentContext();
    expect(second).toBe(first);
    expect(mod.bootstrapContentScript()).toBe(first);
    await Promise.resolve();
    expect(initializeContentErrorAnalyticsMock).toHaveBeenCalledTimes(1);

    mod.resetGlobalContentContext();
    const third = mod.getGlobalContentContext();
    expect(third).not.toBe(first);
    await Promise.resolve();
    expect(initializeContentErrorAnalyticsMock).toHaveBeenCalledTimes(2);
  });

  it('requires explicit storage configuration before bootstrap', async () => {
    const { ContentScriptContext, __setContentBootstrapLoadersForTests } =
      await import('../../../src/content/bootstrap');
    __setContentBootstrapLoadersForTests({
      loadPlatformModule: () => ({
        getPlatformServices: getPlatformServicesMock
      }),
      loadAnalyticsModule: loadAnalyticsModuleMock,
      loadStyleManagers: () => ({
        clipperStyleSheetManager: { initialize: clipperInitializeMock },
        panelStyleSheetManager: { initialize: panelInitializeMock }
      })
    });

    expect(() => new ContentScriptContext()).toThrow(
      '[ContentScript] StorageService is required for bootstrap.'
    );
  });
});
