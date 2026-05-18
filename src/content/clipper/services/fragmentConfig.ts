import type { OptionsRepository } from '@shared/interfaces/optionsRepository';
import { configProvider } from '@shared/config';
import type { FragmentClipperOptions, StoredOptions } from '@shared/types/options';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';

export interface ModifierState {
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export type ModifierSource = Partial<ModifierState>;

export const DEFAULT_FRAGMENT_CONFIG: FragmentClipperOptions =
  configProvider.getFragmentClipperDefaults();
type FragmentConfigRepository = OptionsRepository | IOptionsRepository;

function isLegacyOptionsRepository(
  repository: FragmentConfigRepository
): repository is OptionsRepository {
  return 'load' in repository && typeof repository.load === 'function';
}

async function loadStoredOptions(repository: FragmentConfigRepository): Promise<StoredOptions> {
  if (isLegacyOptionsRepository(repository)) {
    return await repository.load();
  }

  return (await repository.get()) as StoredOptions;
}

export function createModifierState(): ModifierState {
  return {
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false
  };
}

export function syncModifierState(target: ModifierState, source: ModifierSource): void {
  if ('altKey' in source) {
    target.altKey = Boolean(source.altKey);
  }
  if ('metaKey' in source) {
    target.metaKey = Boolean(source.metaKey);
  }
  if ('ctrlKey' in source) {
    target.ctrlKey = Boolean(source.ctrlKey);
  }
  if ('shiftKey' in source) {
    target.shiftKey = Boolean(source.shiftKey);
  }
}

export function resetModifierState(target: ModifierState): void {
  target.altKey = false;
  target.metaKey = false;
  target.ctrlKey = false;
  target.shiftKey = false;
}

function isValidModifierKey(
  value: unknown
): value is FragmentClipperOptions['selectionModifierKeys'][number] {
  return value === 'alt' || value === 'meta' || value === 'ctrl' || value === 'shift';
}

export function normalizeModifierKeys(
  value: unknown
): FragmentClipperOptions['selectionModifierKeys'] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isValidModifierKey);
}

export async function loadFragmentConfig(
  optionsRepository?: FragmentConfigRepository
): Promise<FragmentClipperOptions> {
  try {
    if (!optionsRepository) {
      return DEFAULT_FRAGMENT_CONFIG;
    }
    const options = await loadStoredOptions(optionsRepository);
    const fragmentConfig = options.fragmentClipper;
    const merged = {
      ...DEFAULT_FRAGMENT_CONFIG,
      ...fragmentConfig
    };

    return {
      useFootnoteFormat: merged.useFootnoteFormat,
      captureContext: merged.captureContext,
      contextLength: DEFAULT_FRAGMENT_CONFIG.contextLength,
      contextMode: DEFAULT_FRAGMENT_CONFIG.contextMode,
      selectionModifierEnabled: Boolean(
        fragmentConfig?.selectionModifierEnabled ?? merged.selectionModifierEnabled
      ),
      selectionModifierKeys: normalizeModifierKeys(merged.selectionModifierKeys),
      keyboardShortcutsEnabled: Boolean(
        fragmentConfig?.keyboardShortcutsEnabled ?? merged.keyboardShortcutsEnabled
      )
    };
  } catch (error) {
    console.warn(
      '[fragmentConfig] Failed to load fragment clipper options, using defaults:',
      error
    );
    return DEFAULT_FRAGMENT_CONFIG;
  }
}

function isModifierKeyActive(
  key: FragmentClipperOptions['selectionModifierKeys'][number],
  state: ModifierState
): boolean {
  switch (key) {
    case 'alt':
      return Boolean(state.altKey);
    case 'meta':
      return Boolean(state.metaKey);
    case 'ctrl':
      return Boolean(state.ctrlKey);
    case 'shift':
      return Boolean(state.shiftKey);
    default:
      return false;
  }
}

export function shouldTriggerSelectionWithModifiers(
  config: Pick<FragmentClipperOptions, 'selectionModifierEnabled' | 'selectionModifierKeys'>,
  state: ModifierState
): boolean {
  if (!config.selectionModifierEnabled) {
    return true;
  }
  if (!config.selectionModifierKeys.length) {
    return false;
  }
  return config.selectionModifierKeys.every((key) => isModifierKeyActive(key, state));
}
