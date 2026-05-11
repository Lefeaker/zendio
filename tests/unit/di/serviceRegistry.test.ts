import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createServiceRegistry,
  createScopedRegistry,
  registerFallbackRepositories,
  registerMockRepositories,
  repositoryContainer,
  resolveRepository,
  type ServiceRegistry,
  type ScopedServiceRegistry
} from '@shared/di/serviceRegistry';
import { DI_TOKENS } from '@shared/di/tokens';

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = createServiceRegistry();
  });

  it('registers and resolves services', () => {
    const testToken = Symbol('test');
    const testValue = { message: 'hello' };

    registry.register(testToken, () => testValue);

    expect(registry.has(testToken)).toBe(true);
    expect(registry.resolve<typeof testValue>(testToken)).toBe(testValue);
  });

  it('throws error for unregistered service', () => {
    const testToken = Symbol('unregistered');

    expect(registry.has(testToken)).toBe(false);
    expect(() => registry.resolve(testToken)).toThrow('Service not registered');
  });

  it('uses lazy initialization', () => {
    const testToken = Symbol('lazy');
    let callCount = 0;

    registry.register(testToken, () => {
      callCount++;
      return { count: callCount };
    });

    expect(callCount).toBe(0);

    const instance1 = registry.resolve<{ count: number }>(testToken);
    expect(callCount).toBe(1);
    expect(instance1.count).toBe(1);

    const instance2 = registry.resolve<{ count: number }>(testToken);
    expect(callCount).toBe(1); // Should not call factory again
    expect(instance2).toBe(instance1); // Should return same instance
  });

  it('disposes services', () => {
    const testToken = Symbol('disposable');
    const mockDispose = vi.fn();

    registry.register(testToken, () => ({
      dispose: mockDispose
    }));

    const instance = registry.resolve(testToken);
    expect(mockDispose).not.toHaveBeenCalled();

    registry.dispose(testToken);
    expect(mockDispose).toHaveBeenCalledOnce();

    // Should be able to resolve again after dispose
    const newInstance = registry.resolve(testToken);
    expect(newInstance).not.toBe(instance);
  });

  it('resets all services', () => {
    const token1 = Symbol('service1');
    const token2 = Symbol('service2');
    const mockDispose1 = vi.fn();
    const mockDispose2 = vi.fn();

    registry.register(token1, () => ({ dispose: mockDispose1 }));
    registry.register(token2, () => ({ dispose: mockDispose2 }));

    // Resolve to create instances
    registry.resolve(token1);
    registry.resolve(token2);

    registry.reset();

    expect(mockDispose1).toHaveBeenCalledOnce();
    expect(mockDispose2).toHaveBeenCalledOnce();
    expect(registry.has(token1)).toBe(false);
    expect(registry.has(token2)).toBe(false);
  });

  it('handles factory errors gracefully', () => {
    const testToken = Symbol('error');
    const error = new Error('Factory failed');

    registry.register(testToken, () => {
      throw error;
    });

    expect(() => registry.resolve(testToken)).toThrow('Failed to resolve service');
  });

  it('warns when overriding an existing service registration', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const testToken = Symbol('duplicate');

    registry.register(testToken, () => ({ value: 'first' }));
    registry.register(testToken, () => ({ value: 'second' }));

    expect(warnSpy).toHaveBeenCalledWith(
      '[ServiceRegistry] Overriding existing service registration',
      testToken.toString()
    );
    expect(registry.resolve<{ value: string }>(testToken).value).toBe('second');

    warnSpy.mockRestore();
  });

  it('continues reset when a disposable service throws while disposing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failingToken = Symbol('failing-dispose');
    const stableToken = Symbol('stable-dispose');
    const stableDispose = vi.fn();

    registry.register(failingToken, () => ({
      dispose() {
        throw new Error('dispose failed');
      }
    }));
    registry.register(stableToken, () => ({ dispose: stableDispose }));

    registry.resolve(failingToken);
    registry.resolve(stableToken);
    registry.reset();

    expect(warnSpy).toHaveBeenCalledWith(
      '[ServiceRegistry] Error disposing service',
      failingToken.toString(),
      expect.any(Error)
    );
    expect(stableDispose).toHaveBeenCalledOnce();

    warnSpy.mockRestore();
  });
});

describe('ScopedServiceRegistry', () => {
  let parentRegistry: ServiceRegistry;
  let scopedRegistry: ScopedServiceRegistry;

  beforeEach(() => {
    parentRegistry = createServiceRegistry();
    scopedRegistry = createScopedRegistry(parentRegistry);
  });

  it('resolves from local scope first', () => {
    const testToken = Symbol('scoped');
    const parentValue = { source: 'parent' };
    const localValue = { source: 'local' };

    parentRegistry.register(testToken, () => parentValue);
    scopedRegistry.register(testToken, () => localValue);

    expect(scopedRegistry.resolve(testToken)).toBe(localValue);
  });

  it('falls back to parent registry', () => {
    const testToken = Symbol('parent-only');
    const parentValue = { source: 'parent' };

    parentRegistry.register(testToken, () => parentValue);

    expect(scopedRegistry.has(testToken)).toBe(true);
    expect(scopedRegistry.resolve(testToken)).toBe(parentValue);
  });

  it('throws error when service not found in either scope', () => {
    const testToken = Symbol('missing');

    expect(scopedRegistry.has(testToken)).toBe(false);
    expect(() => scopedRegistry.resolve(testToken)).toThrow('Service not registered');
  });

  it('disposes only local services', () => {
    const testToken = Symbol('local');
    const mockDispose = vi.fn();

    scopedRegistry.register(testToken, () => ({
      dispose: mockDispose
    }));

    scopedRegistry.resolve(testToken);
    scopedRegistry.dispose(testToken);

    expect(mockDispose).toHaveBeenCalledOnce();
  });

  it('resets only local scope', () => {
    const localToken = Symbol('local');
    const parentToken = Symbol('parent');
    const mockLocalDispose = vi.fn();

    parentRegistry.register(parentToken, () => ({ value: 'parent' }));
    scopedRegistry.register(localToken, () => ({ dispose: mockLocalDispose }));

    // Resolve both services
    scopedRegistry.resolve(parentToken);
    scopedRegistry.resolve(localToken);

    scopedRegistry.reset();

    expect(mockLocalDispose).toHaveBeenCalledOnce();
    expect(scopedRegistry.has(localToken)).toBe(false);
    expect(scopedRegistry.has(parentToken)).toBe(true); // Parent service still available
  });

  it('disposes entire scope', () => {
    const localToken = Symbol('local');
    const mockDispose = vi.fn();

    scopedRegistry.register(localToken, () => ({
      dispose: mockDispose
    }));

    scopedRegistry.resolve(localToken);
    scopedRegistry.disposeScope();

    expect(mockDispose).toHaveBeenCalledOnce();
    expect(scopedRegistry.has(localToken)).toBe(false);
  });

  it('reports local factory errors with scoped context', () => {
    const testToken = Symbol('scoped-error');
    scopedRegistry.register(testToken, () => {
      throw new Error('scoped failed');
    });

    expect(() => scopedRegistry.resolve(testToken)).toThrow('Failed to resolve local service');
  });
});

describe('repository service container fallbacks', () => {
  beforeEach(() => {
    repositoryContainer.reset();
  });

  it('registers fallback repositories with observable in-memory state', async () => {
    registerFallbackRepositories();

    const options = resolveRepository<{
      get: () => Promise<{ general?: { language?: string } }>;
      set: (options: { general?: { language?: string } }) => Promise<void>;
      onChange: (callback: (options: unknown) => void) => () => void;
    }>(DI_TOKENS.IOptionsRepository);
    const optionSnapshots: unknown[] = [];
    const unsubscribeOptions = options.onChange((snapshot) => optionSnapshots.push(snapshot));
    await options.set({ general: { language: 'ja' } });

    expect((await options.get()).general?.language).toBe('ja');
    expect(optionSnapshots).toHaveLength(2);
    unsubscribeOptions();

    const yaml = resolveRepository<{
      getOverrides: () => Promise<unknown>;
      setOverrides: (value: unknown) => Promise<void>;
      onChange: (callback: (value: unknown) => void) => () => void;
    }>(DI_TOKENS.IYamlRepository);
    const yamlSnapshots: unknown[] = [];
    const unsubscribeYaml = yaml.onChange((snapshot) => yamlSnapshots.push(snapshot));
    await yaml.setOverrides({ fields: [] });

    expect(await yaml.getOverrides()).toEqual({ fields: [] });
    expect(yamlSnapshots).toEqual([null, { fields: [] }]);
    unsubscribeYaml();

    const messaging = resolveRepository<{
      send: () => Promise<unknown>;
      onMessage: () => () => void;
    }>(DI_TOKENS.IMessagingRepository);
    expect(await messaging.send()).toBeUndefined();
    expect(messaging.onMessage()).toEqual(expect.any(Function));

    const video = resolveRepository<{
      getVideoConfig: () => Promise<{ promptShortcut: string }>;
      getPromptPosition: () => Promise<unknown>;
      sendVideoClip: () => Promise<{ success: boolean }>;
      savePromptPosition: () => Promise<void>;
      saveControlBarPreferences: () => Promise<void>;
      onConfigChange: (callback: unknown) => () => void;
    }>(DI_TOKENS.IVideoRepository);
    expect((await video.getVideoConfig()).promptShortcut).toBe('Alt+V');
    expect(await video.getPromptPosition()).toBeNull();
    await expect(video.savePromptPosition()).resolves.toBeUndefined();
    await expect(video.saveControlBarPreferences()).resolves.toBeUndefined();
    await expect(video.sendVideoClip()).resolves.toEqual({ success: true });
    expect(video.onConfigChange(() => undefined)).toEqual(expect.any(Function));

    const navigation = resolveRepository<{
      openVault: () => Promise<void>;
      openOptions: () => Promise<void>;
      openExternalLink: () => Promise<void>;
    }>(DI_TOKENS.INavigationRepository);
    await expect(navigation.openVault()).resolves.toBeUndefined();
    await expect(navigation.openOptions()).resolves.toBeUndefined();
    await expect(navigation.openExternalLink()).resolves.toBeUndefined();
  });

  it('resets singleton factories and rejects unresolved repositories', () => {
    expect(() => resolveRepository(DI_TOKENS.IOptionsRepository)).toThrow(
      'Repository not registered'
    );

    class MockRepository {}
    registerMockRepositories({
      options: MockRepository as never,
      messaging: MockRepository as never,
      yaml: MockRepository as never,
      clip: MockRepository as never,
      video: MockRepository as never,
      reader: MockRepository as never,
      navigation: MockRepository as never
    });

    const first = resolveRepository<MockRepository>(DI_TOKENS.IOptionsRepository);
    const second = resolveRepository<MockRepository>(DI_TOKENS.IOptionsRepository);
    expect(second).toBe(first);

    repositoryContainer.reset();
    expect(() => resolveRepository(DI_TOKENS.IOptionsRepository)).toThrow(
      'Repository not registered'
    );
  });
});
