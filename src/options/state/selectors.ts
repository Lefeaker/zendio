import { deepClone } from '../utils/clone';
import type { StoredOptions } from '../../shared/types/options';
import type { UsageStats } from '../../shared/types/usage';
import type { OptionsState } from './types';

export function selectLanguage(state: OptionsState): string {
  return state.language;
}

export function selectIsInitialized(state: OptionsState): boolean {
  return state.isInitialized;
}

export function selectStoredOptions(state: OptionsState): StoredOptions | null {
  return state.options ? deepClone(state.options) : null;
}

export function selectUsageStats(state: OptionsState): UsageStats | null {
  return state.usage ? deepClone(state.usage) : null;
}

export function selectActiveSection(state: OptionsState): string | null {
  return state.activeSection;
}

export function selectMountedSections(state: OptionsState): Record<string, boolean> {
  return { ...state.mountedSections };
}

export function selectOptionsSection<K extends keyof NonNullable<StoredOptions>>(
  state: OptionsState,
  key: K
): NonNullable<StoredOptions>[K] | null {
  const options = state.options;
  if (!options) {
    return null;
  }

  const section = options[key];
  if (section === undefined || section === null) {
    return null;
  }
  return deepClone(section);
}
