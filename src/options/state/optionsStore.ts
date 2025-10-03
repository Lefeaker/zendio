import { deepClone } from '../utils/clone';
import type { CompleteOptions, StoredOptions } from '../../shared/types/options';

let cachedOptions: StoredOptions | null = null;

export async function loadOptionsFromStorage(): Promise<StoredOptions> {
  const { options } = await chrome.storage.sync.get('options');
  cachedOptions = options ? deepClone(options) : {};
  return getLastLoadedOptions() ?? {};
}

export async function saveOptionsToStorage(options: StoredOptions | CompleteOptions): Promise<void> {
  const cloned = deepClone(options);
  cachedOptions = cloned;
  await chrome.storage.sync.set({ options: cloned });
}

export function getLastLoadedOptions(): StoredOptions | null {
  return cachedOptions ? deepClone(cachedOptions) : null;
}

export function setLastLoadedOptions(options: StoredOptions | CompleteOptions | null): void {
  cachedOptions = options ? deepClone(options) : null;
}
