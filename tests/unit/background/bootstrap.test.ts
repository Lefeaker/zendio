import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageAreaService, StorageService } from '../../../src/platform/interfaces/storage';

type TelemetryEmitter = (params: Record<string, unknown>) => Promise<void>;

function createStorageAreaStub(): StorageAreaService {
  return {
    get: vi.fn(<T>() => Promise.resolve(undefined as T | undefined)) as StorageAreaService['get'],
    set: vi.fn(<T>(_key: string, _value: T) => Promise.resolve()) as StorageAreaService['set'],
    getMany: vi.fn(<T>() =>
      Promise.resolve({} as Record<string, T | undefined>)
    ) as StorageAreaService['getMany'],
    setMany: vi.fn(<T>(_entries: Record<string, T>) =>
      Promise.resolve()
    ) as StorageAreaService['setMany'],
    remove: vi.fn(() => Promise.resolve()) as StorageAreaService['remove'],
    clear: vi.fn(() => Promise.resolve()) as StorageAreaService['clear'],
    watchKey: vi.fn(() => () => undefined),
    watchAll: vi.fn(() => () => undefined)
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getEmitTelemetryEvent(call: ReadonlyArray<unknown> | undefined): TelemetryEmitter {
  const options = call?.[1];
  if (!isPlainRecord(options) || typeof options.emitTelemetryEvent !== 'function') {
    throw new Error('Expected initializeErrorAnalytics to receive an emitTelemetryEvent option');
  }
  return options.emitTelemetryEvent as TelemetryEmitter;
}

const TOKENS = vi.hoisted(() => ({
  errorHandler: Symbol('errorHandler'),
  globalStateManager: Symbol('globalStateManager'),
  usageStatsStore: Symbol('usageStatsStore')
}));
const registryState = vi.hoisted(() => ({ tokens: new Set<symbol>() }));
const registryMock = vi.hoisted(() => ({
  register: vi.fn((token: symbol) => {
    registryState.tokens.add(token);
  }),
  has: vi.fn((token: symbol) => registryState.tokens.has(token)),
  dispose: vi.fn((token: symbol) => {
    registryState.tokens.delete(token);
  }),
  reset: vi.fn(() => {
    registryState.tokens.clear();
  })
}));
const createErrorHandlerMock = vi.hoisted(() => vi.fn(() => ({ dispose: vi.fn() })));
const createGlobalStateManagerMock = vi.hoisted(() => vi.fn(() => ({ dispose: vi.fn() })));
const configureGlobalStateManagerStorageMock = vi.hoisted(() => vi.fn());
const configureAnalyticsConfigManagerMock = vi.hoisted(() => vi.fn());
const initializeErrorAnalyticsMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const configureI18nStorageMock = vi.hoisted(() => vi.fn());
const configureUsageStatsStorageMock = vi.hoisted(() => vi.fn());
const createUsageStatsStoreMock = vi.hoisted(() => vi.fn(() => ({ dispose: vi.fn() })));
const registerGlobalErrorBoundaryMock = vi.hoisted(() => vi.fn(() => () => undefined));
const trackTelemetryEventMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const storageMock = vi.hoisted(
  (): StorageService => ({
    sync: createStorageAreaStub(),
    local: createStorageAreaStub()
  })
);

vi.mock('../../../src/shared/di', () => ({ registry: registryMock, TOKENS }));
vi.mock('../../../src/shared/errors/errorHandler', () => ({
  createErrorHandler: createErrorHandlerMock
}));
vi.mock('../../../src/shared/errors/analytics/analyticsConfig', () => ({
  configureAnalyticsConfigManager: configureAnalyticsConfigManagerMock
}));
vi.mock('../../../src/shared/errors/analytics', () => ({
  initializeErrorAnalytics: initializeErrorAnalyticsMock
}));
vi.mock('../../../src/background/services/telemetryService', () => ({
  trackTelemetryEvent: trackTelemetryEventMock
}));
vi.mock('../../../src/shared/errors/globalErrorBoundary', () => ({
  registerGlobalErrorBoundary: registerGlobalErrorBoundaryMock
}));
vi.mock('../../../src/shared/state/globalStateManager', () => ({
  createGlobalStateManager: createGlobalStateManagerMock,
  configureGlobalStateManagerStorage: configureGlobalStateManagerStorageMock
}));
vi.mock('../../../src/i18n', () => ({
  configureI18nStorage: configureI18nStorageMock
}));
vi.mock('../../../src/background/services/usageStats', () => ({
  createUsageStatsStore: createUsageStatsStoreMock,
  configureUsageStatsStorage: configureUsageStatsStorageMock
}));

describe('background/bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    registryState.tokens.clear();
  });

  it('bootstraps background dependencies and reports initialized state', async () => {
    const mod = await import('../../../src/background/bootstrap');
    mod.bootstrapBackgroundDependencies(storageMock);

    expect(configureGlobalStateManagerStorageMock).toHaveBeenCalledWith(storageMock);
    expect(configureAnalyticsConfigManagerMock).toHaveBeenCalledWith(storageMock);
    expect(configureI18nStorageMock).toHaveBeenCalledWith(storageMock.sync);
    expect(configureUsageStatsStorageMock).toHaveBeenCalledWith(storageMock);
    expect(registryMock.register).toHaveBeenCalledWith(TOKENS.errorHandler, expect.any(Function));
    expect(registerGlobalErrorBoundaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'background',
        metadata: expect.objectContaining({ extensionContext: 'background' })
      })
    );
    expect(initializeErrorAnalyticsMock).toHaveBeenCalledTimes(1);
    const emitTelemetryEvent = getEmitTelemetryEvent(initializeErrorAnalyticsMock.mock.calls[0]);
    await emitTelemetryEvent({ error_code: 'NETWORK_TIMEOUT', timestamp: 1 });
    expect(trackTelemetryEventMock).toHaveBeenCalledWith('extension_error', {
      error_code: 'NETWORK_TIMEOUT',
      timestamp: 1
    });
    expect(registryMock.register).toHaveBeenCalledWith(
      TOKENS.globalStateManager,
      createGlobalStateManagerMock
    );
    expect(registryMock.register).toHaveBeenCalledWith(
      TOKENS.usageStatsStore,
      createUsageStatsStoreMock
    );
    expect(mod.isBackgroundDependenciesInitialized()).toBe(true);
  });

  it('ensures once, resets, and re-registers background dependencies', async () => {
    const mod = await import('../../../src/background/bootstrap');
    mod.ensureBackgroundDependencies(storageMock);
    expect(mod.isBackgroundDependenciesInitialized()).toBe(true);
    const initialRegisterCalls = registryMock.register.mock.calls.length;

    mod.ensureBackgroundDependencies();
    expect(registryMock.register.mock.calls.length).toBe(initialRegisterCalls);

    mod.resetBackgroundDependencies(storageMock);
    expect(registryMock.reset).toHaveBeenCalledTimes(1);
    expect(mod.isBackgroundDependenciesInitialized()).toBe(true);
  });

  it('cleans up tokens and swallows disposal failures', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mod = await import('../../../src/background/bootstrap');
    mod.configureBackgroundDependencyStorage(storageMock);
    mod.bootstrapBackgroundDependencies();

    registryMock.dispose.mockImplementationOnce(() => {
      throw new Error('dispose failed');
    });
    mod.cleanupBackgroundDependencies();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Background] Error during dependency cleanup:',
      expect.any(Error)
    );

    registryMock.dispose.mockImplementation((token: symbol) => {
      registryState.tokens.delete(token);
    });
    mod.cleanupBackgroundDependencies();
    expect(mod.isBackgroundDependenciesInitialized()).toBe(false);
  });

  it('requires explicit storage configuration before bootstrap', async () => {
    const mod = await import('../../../src/background/bootstrap');
    expect(() => mod.bootstrapBackgroundDependencies()).toThrow(
      '[Background] StorageService is required for bootstrap.'
    );
  });
});
