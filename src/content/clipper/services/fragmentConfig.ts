import { configProvider } from '@shared/config';
import type { FragmentClipperOptions } from '@shared/types/options';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';

export const DEFAULT_FRAGMENT_CONFIG: FragmentClipperOptions =
  configProvider.getFragmentClipperDefaults();
type FragmentConfigRepository = Pick<IOptionsRepository, 'get'>;

function isValidModifierKey(
  value: unknown
): value is FragmentClipperOptions['selectionModifierKeys'][number] {
  return value === 'alt' || value === 'meta' || value === 'ctrl' || value === 'shift';
}

export function normalizeModifierKeys(
  value: unknown
): FragmentClipperOptions['selectionModifierKeys'] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_FRAGMENT_CONFIG.selectionModifierKeys];
  }
  const normalized = value.filter(isValidModifierKey);
  return normalized.length > 0
    ? [normalized[0]]
    : [...DEFAULT_FRAGMENT_CONFIG.selectionModifierKeys];
}

export async function loadFragmentConfig(
  optionsRepository?: FragmentConfigRepository
): Promise<FragmentClipperOptions> {
  try {
    if (!optionsRepository) {
      return DEFAULT_FRAGMENT_CONFIG;
    }
    const options = await optionsRepository.get();
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
      selectionTriggerMode: merged.selectionTriggerMode,
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
