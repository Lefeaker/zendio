import {
  applyStoredOptionsPatch,
  decodeStoredOptions,
  encodeStoredOptionsReplacement
} from '../../shared/config/storedOptionsCodec';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import {
  OptionsMutationError,
  type OptionsPatch
} from '../../shared/types/optionsMutationMessages';
import { registerService, TOKENS } from '../../shared/di';
import { DI_TOKENS } from '../../shared/di/tokens';
import { registerFallbackRepositories, repositoryContainer } from '../../shared/di/serviceRegistry';
import type { PlatformServices } from '../types';
import { createPreviewPlatformServices } from './services';

function clone<T>(value: T): T {
  return globalThis.structuredClone(value);
}

export function createPreviewOptionsRepository(
  initialOptions: StoredOptions | CompleteOptions | null = null
): IOptionsRepository {
  let stored: unknown = {};
  const listeners = new Set<(options: CompleteOptions) => void>();

  if (initialOptions) {
    const encoded = encodeStoredOptionsReplacement(initialOptions);
    if (!encoded.success) throw new OptionsMutationError('OPTIONS_REPLACEMENT_REJECTED');
    stored = encoded.value;
  }

  const snapshot = (): CompleteOptions => clone(decodeStoredOptions(stored).runtime);
  const publish = (): CompleteOptions => {
    const next = snapshot();
    for (const listener of listeners) listener(clone(next));
    return next;
  };

  return {
    get: () => Promise.resolve(snapshot()),
    patch(patches: OptionsPatch | readonly OptionsPatch[]): Promise<CompleteOptions> {
      const batch: readonly OptionsPatch[] = Array.isArray(patches) ? patches : [patches];
      if (batch.length === 0) {
        return Promise.reject(new OptionsMutationError('INVALID_OPTIONS_MUTATION'));
      }
      let next = stored;
      for (const patch of batch) {
        const result = applyStoredOptionsPatch(next, patch);
        if (!result.success) {
          return Promise.reject(new OptionsMutationError('OPTIONS_MUTATION_REJECTED'));
        }
        next = result.value;
      }
      stored = next;
      return Promise.resolve(publish());
    },
    replace(options: StoredOptions | CompleteOptions): Promise<CompleteOptions> {
      const encoded = encodeStoredOptionsReplacement(options);
      if (!encoded.success) {
        return Promise.reject(new OptionsMutationError('OPTIONS_REPLACEMENT_REJECTED'));
      }
      stored = encoded.value;
      return Promise.resolve(publish());
    },
    onChange(callback: (options: CompleteOptions) => void): () => void {
      listeners.add(callback);
      callback(snapshot());
      return () => listeners.delete(callback);
    }
  };
}

export function configurePreviewOptionsRuntime(): PlatformServices {
  const platformServices = createPreviewPlatformServices();
  registerService(TOKENS.platformServices, () => platformServices);
  registerFallbackRepositories();
  repositoryContainer.registerSingleton(
    DI_TOKENS.IOptionsRepository,
    createPreviewOptionsRepository
  );
  return platformServices;
}
