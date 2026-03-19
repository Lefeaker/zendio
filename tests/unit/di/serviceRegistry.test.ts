import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  createServiceRegistry, 
  createScopedRegistry,
  type ServiceRegistry,
  type ScopedServiceRegistry 
} from '@shared/di/serviceRegistry';

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
});
