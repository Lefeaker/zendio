/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { registry, TOKENS } from '@shared/di';
import type { StorageService } from '../../../src/platform/interfaces/storage';

const createErrorHandlerMock = vi.hoisted(() => vi.fn(() => ({ dispose: vi.fn(), kind: 'error-handler' })));
const createGlobalStateManagerMock = vi.hoisted(() => vi.fn(() => ({ dispose: vi.fn(), kind: 'global-state' })));
const configureGlobalStateManagerStorageMock = vi.hoisted(() => vi.fn());
const registerGlobalErrorBoundaryMock = vi.hoisted(() => vi.fn(() => vi.fn()));
const configureAnalyticsConfigManagerMock = vi.hoisted(() => vi.fn());
const initializeErrorAnalyticsMock = vi.hoisted(() => vi.fn(async () => undefined));
const storageMock = { kind: 'storage' } as unknown as StorageService;

vi.mock('@shared/errors/errorHandler', () => ({
  createErrorHandler: createErrorHandlerMock
}));
vi.mock('@shared/errors/globalErrorBoundary', () => ({
  registerGlobalErrorBoundary: registerGlobalErrorBoundaryMock
}));
vi.mock('@shared/errors/analytics/analyticsConfig', () => ({
  configureAnalyticsConfigManager: configureAnalyticsConfigManagerMock
}));
vi.mock('@shared/errors/analytics', () => ({
  initializeErrorAnalytics: initializeErrorAnalyticsMock
}));

vi.mock('@shared/state/globalStateManager', () => ({
  createGlobalStateManager: createGlobalStateManagerMock,
  configureGlobalStateManagerStorage: configureGlobalStateManagerStorageMock
}));

import {
  bootstrapOptionsDependencies,
  cleanupOptionsDependencies,
  resetOptionsDependencies,
  isOptionsDependenciesInitialized,
  ensureOptionsDependencies,
  bootstrapOptionsApp,
  configureOptionsDependencyStorage
} from '@options/bootstrap';

describe('options/bootstrap dependency wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registry.reset();
    configureOptionsDependencyStorage(storageMock);
  });

  afterEach(() => {
    registry.reset();
  });

  it('bootstraps and resolves options dependencies', () => {
    bootstrapOptionsDependencies();

    expect(isOptionsDependenciesInitialized()).toBe(true);
    expect(configureGlobalStateManagerStorageMock).toHaveBeenCalledWith(storageMock);
    expect(configureAnalyticsConfigManagerMock).toHaveBeenCalledWith(storageMock);
    expect(registerGlobalErrorBoundaryMock).toHaveBeenCalledWith(expect.objectContaining({
      domain: 'options',
      metadata: expect.objectContaining({ extensionContext: 'options' }),
      target: window
    }));
    expect(initializeErrorAnalyticsMock).toHaveBeenCalledTimes(1);

    const errorHandler = registry.resolve<{ kind: string }>(TOKENS.errorHandler);
    const globalStateManager = registry.resolve<{ kind: string }>(TOKENS.globalStateManager);

    expect(createErrorHandlerMock).toHaveBeenCalledTimes(1);
    expect(createGlobalStateManagerMock).toHaveBeenCalledTimes(1);
    expect(errorHandler.kind).toBe('error-handler');
    expect(globalStateManager.kind).toBe('global-state');
  });

  it('cleans up resolved services without throwing', () => {
    bootstrapOptionsDependencies();
    const errorHandler = registry.resolve<{ dispose: () => void }>(TOKENS.errorHandler);
    const globalStateManager = registry.resolve<{ dispose: () => void }>(TOKENS.globalStateManager);

    cleanupOptionsDependencies();

    expect(errorHandler.dispose).toHaveBeenCalledTimes(1);
    expect(globalStateManager.dispose).toHaveBeenCalledTimes(1);
    expect(isOptionsDependenciesInitialized()).toBe(true);
  });

  it('ensureOptionsDependencies bootstraps only when needed and reset re-registers services', () => {
    expect(isOptionsDependenciesInitialized()).toBe(false);

    ensureOptionsDependencies();
    expect(isOptionsDependenciesInitialized()).toBe(true);

    resetOptionsDependencies();
    expect(isOptionsDependenciesInitialized()).toBe(true);
    expect(registry.resolve(TOKENS.errorHandler)).toBeTruthy();
    expect(registry.resolve(TOKENS.globalStateManager)).toBeTruthy();
  });

  it('bootstrapOptionsApp wires beforeunload cleanup', () => {
    const cleanupSpy = vi.spyOn(window, 'addEventListener');

    bootstrapOptionsApp();

    expect(cleanupSpy).toHaveBeenCalledWith('beforeunload', cleanupOptionsDependencies);
    expect(isOptionsDependenciesInitialized()).toBe(true);
  });

  it('keeps getPlatformServices out of src/options/app/bootstrap.ts', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/options/app/bootstrap.ts'),
      'utf8'
    );

    expect(source).not.toContain('getPlatformServices');
  });
});
