import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import optionsStore from '../state/optionsStore';

export interface OptionsPersistenceService {
  load(): Promise<StoredOptions>;
  save(draft: CompleteOptions | StoredOptions): Promise<void>;
  getCached(): StoredOptions | null;
  subscribe?(listener: (options: StoredOptions) => void): () => void;
}

export function createChromeOptionsPersistence(): OptionsPersistenceService {
  return {
    async load(): Promise<StoredOptions> {
      return optionsStore.load();
    },
    async save(draft: CompleteOptions | StoredOptions): Promise<void> {
      await optionsStore.save(draft);
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
