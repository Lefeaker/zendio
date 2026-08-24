import { DEFAULT_OPTIONS } from '@shared/config';
import type { IOptionsRepository } from '@shared/repositories';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import {
  applyStoredOptionsPatch,
  decodeStoredOptions,
  encodeStoredOptionsReplacement
} from '@shared/config/storedOptionsCodec';
import type { OptionsPatch } from '@shared/types/optionsMutationMessages';

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

  async patch(patches: OptionsPatch | readonly OptionsPatch[]): Promise<CompleteOptions> {
    let raw: unknown = this.data;
    for (const patch of Array.isArray(patches) ? patches : [patches]) {
      const result = applyStoredOptionsPatch(raw, patch);
      if (!result.success) throw new Error('OPTIONS_MUTATION_REJECTED');
      raw = result.value;
    }
    this.data = decodeStoredOptions(raw).runtime;
    this.emit();
    return clone(this.data);
  }

  async replace(options: StoredOptions | CompleteOptions): Promise<CompleteOptions> {
    const result = encodeStoredOptionsReplacement(options);
    if (!result.success) throw new Error('OPTIONS_REPLACEMENT_REJECTED');
    this.data = decodeStoredOptions(result.value).runtime;
    this.emit();
    return clone(this.data);
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

  private emit(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(clone(this.data));
      } catch (error) {
        console.error('[MockOptionsRepository] listener error', error);
      }
    });
  }
}
