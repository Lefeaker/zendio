import { DEFAULT_OPTIONS } from '@shared/config';
import type { IOptionsRepository } from '@shared/repositories';
import type { CompleteOptions } from '@shared/types/options';

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function createDefaultOptions(): CompleteOptions {
  return clone(DEFAULT_OPTIONS) as CompleteOptions;
}

/**
 * 纯内存的 Options 仓储实现,用于单元测试
 */
export class MockOptionsRepository implements IOptionsRepository {
  private data: CompleteOptions = createDefaultOptions();
  private listeners = new Set<(options: CompleteOptions) => void>();

  get(): Promise<CompleteOptions> {
    return Promise.resolve(clone(this.data));
  }

  set(options: Partial<CompleteOptions>): Promise<void> {
    this.data = {
      ...this.data,
      ...options
    } as CompleteOptions;

    this.listeners.forEach((listener) => {
      try {
        listener(this.data);
      } catch (error) {
        console.error('[MockOptionsRepository] listener error', error);
      }
    });
    return Promise.resolve();
  }

  onChange(callback: (options: CompleteOptions) => void): () => void {
    this.listeners.add(callback);
    callback(this.data);
    return () => {
      this.listeners.delete(callback);
    };
  }

  reset(): void {
    this.data = createDefaultOptions();
    this.listeners.clear();
  }

  getMockData(): CompleteOptions {
    return this.data;
  }

  setMockData(value: CompleteOptions): void {
    this.data = clone(value);
  }
}
