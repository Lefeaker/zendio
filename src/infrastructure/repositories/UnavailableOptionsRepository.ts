import { mergeOptions } from '../../shared/config/optionsMerger';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import {
  OPTIONS_MUTATION_AUTHORITY_UNAVAILABLE,
  OptionsMutationError,
  type OptionsPatch
} from '../../shared/types/optionsMutationMessages';

function clone<T>(value: T): T {
  return globalThis.structuredClone(value);
}

function unavailable(): OptionsMutationError {
  return new OptionsMutationError(OPTIONS_MUTATION_AUTHORITY_UNAVAILABLE);
}

export class UnavailableOptionsRepository implements IOptionsRepository {
  private readonly snapshot: CompleteOptions;
  private readonly listeners = new Set<(options: CompleteOptions) => void>();
  private disposed = false;

  constructor(initialOptions: StoredOptions | CompleteOptions | null = null) {
    this.snapshot = mergeOptions(initialOptions);
  }

  get(): Promise<CompleteOptions> {
    return Promise.resolve(clone(this.snapshot));
  }

  patch(_patches: OptionsPatch | readonly OptionsPatch[]): Promise<CompleteOptions> {
    return Promise.reject(unavailable());
  }

  replace(_options: StoredOptions | CompleteOptions): Promise<CompleteOptions> {
    return Promise.reject(unavailable());
  }

  deleteLegacyUsageStatsRoot(): Promise<never> {
    return Promise.reject(unavailable());
  }

  onChange(callback: (options: CompleteOptions) => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(callback);
    try {
      callback(clone(this.snapshot));
    } catch (error) {
      console.error('[UnavailableOptionsRepository] onChange callback error:', error);
    }
    return () => {
      this.listeners.delete(callback);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }
}
