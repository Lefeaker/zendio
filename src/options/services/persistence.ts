import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import type { OptionsPatch } from '../../shared/types/optionsMutationMessages';
import optionsStore, { replacePersisted } from '../state/optionsStore';

export interface OptionsPersistenceService {
  load(): Promise<StoredOptions>;
  save(patches: readonly OptionsPatch[]): Promise<StoredOptions>;
  replace?(draft: CompleteOptions | StoredOptions): Promise<StoredOptions>;
  getCached(): StoredOptions | null;
  subscribe?(listener: (options: StoredOptions) => void): () => void;
}

export function createChromeOptionsPersistence(): OptionsPersistenceService {
  return {
    async load(): Promise<StoredOptions> {
      return optionsStore.load();
    },
    async save(patches: readonly OptionsPatch[]): Promise<StoredOptions> {
      return optionsStore.save(patches);
    },
    async replace(draft: CompleteOptions | StoredOptions): Promise<StoredOptions> {
      return replacePersisted(draft);
    },
    getCached(): StoredOptions | null {
      return optionsStore.snapshot();
    },
    subscribe(listener: (options: StoredOptions) => void): () => void {
      return optionsStore.subscribe((options) => {
        if (options) {
          listener(options);
        }
      });
    }
  };
}

export const chromeOptionsPersistence = createChromeOptionsPersistence();
