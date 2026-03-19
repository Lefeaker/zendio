import type { IYamlRepository } from '@shared/repositories';
import type { YamlConfigOverrides } from '@shared/types/yamlConfig';

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MockYamlRepository implements IYamlRepository {
  private overrides: YamlConfigOverrides | null = null;
  private listeners = new Set<(overrides: YamlConfigOverrides | null) => void>();

  getOverrides(): Promise<YamlConfigOverrides | null> {
    return Promise.resolve(this.overrides ? clone(this.overrides) : null);
  }

  setOverrides(overrides: YamlConfigOverrides): Promise<void> {
    this.overrides = clone(overrides);
    this.listeners.forEach(listener => {
      try {
        listener(this.overrides);
      } catch (error) {
        console.error('[MockYamlRepository] listener error', error);
      }
    });
    return Promise.resolve();
  }

  onChange(callback: (overrides: YamlConfigOverrides | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.overrides);
    return () => {
      this.listeners.delete(callback);
    };
  }

  reset(): void {
    this.overrides = null;
    this.listeners.clear();
  }

  getMockData(): YamlConfigOverrides | null {
    return this.overrides ? clone(this.overrides) : null;
  }
}
