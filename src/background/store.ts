import type { StoredOptions, OptionsState } from '../shared/types';
import { DEFAULT_OPTIONS, mergeOptions } from '../shared/config';

export type Options = OptionsState;

export async function getOptions(): Promise<Options> {
  const { options } = await chrome.storage.sync.get('options');
  return mergeOptions(options as StoredOptions | undefined);
}

export { DEFAULT_OPTIONS };
