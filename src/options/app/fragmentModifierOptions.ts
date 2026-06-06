import type { FragmentModifierKey } from '@shared/types/options';
import type { ChipItem, PreviewStoreState } from '@options/stitch/types';

export const DEFAULT_FRAGMENT_MODIFIER_KEY: FragmentModifierKey = 'shift';

export interface FragmentModifierChoice {
  value: FragmentModifierKey;
  label: string;
}

interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: {
    platform?: string;
  };
}

const VALID_FRAGMENT_MODIFIER_KEYS = new Set<string>(['alt', 'meta', 'ctrl', 'shift']);

const LEGACY_FRAGMENT_MODIFIER_LABELS: Readonly<Record<string, FragmentModifierKey>> = {
  Alt: 'alt',
  Option: 'alt',
  Command: 'meta',
  Cmd: 'meta',
  'Cmd / Meta': 'meta',
  Ctrl: 'ctrl',
  Control: 'ctrl',
  Shift: 'shift'
};

function currentPlatformLabel(): string {
  if (typeof navigator === 'undefined') {
    return '';
  }
  const source = navigator as NavigatorWithUserAgentData;
  return source.userAgentData?.platform || source.platform || source.userAgent || '';
}

export function isApplePlatform(platform = currentPlatformLabel()): boolean {
  return /\b(Mac|iPhone|iPad|iPod)\b/i.test(platform);
}

export function platformCommandModifierKey(isApple = isApplePlatform()): FragmentModifierKey {
  return isApple ? 'meta' : 'ctrl';
}

function isFragmentModifierKey(value: string | undefined): value is FragmentModifierKey {
  return value !== undefined && VALID_FRAGMENT_MODIFIER_KEYS.has(value);
}

function coerceFragmentModifierValue(value: string | undefined): string | undefined {
  return value === undefined ? undefined : (LEGACY_FRAGMENT_MODIFIER_LABELS[value] ?? value);
}

function isKnownFragmentModifierValue(value: string): boolean {
  return isFragmentModifierKey(coerceFragmentModifierValue(value));
}

export function normalizeFragmentModifierKey(
  value: string | undefined,
  isApple = isApplePlatform()
): FragmentModifierKey {
  const normalizedValue = coerceFragmentModifierValue(value);
  if (normalizedValue === 'meta' || normalizedValue === 'ctrl') {
    return platformCommandModifierKey(isApple);
  }
  if (isFragmentModifierKey(normalizedValue)) {
    return normalizedValue;
  }
  return DEFAULT_FRAGMENT_MODIFIER_KEY;
}

export function normalizeFragmentModifierKeys(
  values: readonly string[] | undefined,
  isApple = isApplePlatform()
): FragmentModifierKey[] {
  const first = values?.find(isKnownFragmentModifierValue);
  return [normalizeFragmentModifierKey(first, isApple)];
}

export function fragmentModifierChoices(isApple = isApplePlatform()): FragmentModifierChoice[] {
  return [
    { value: 'shift', label: 'Shift' },
    {
      value: platformCommandModifierKey(isApple),
      label: isApple ? 'Cmd' : 'Ctrl'
    },
    { value: 'alt', label: isApple ? 'Option' : 'Alt' }
  ];
}

export function fragmentModifierChipItems(
  selectedKeys: readonly string[],
  isApple = isApplePlatform()
): ChipItem[] {
  const selectedKey = normalizeFragmentModifierKeys(selectedKeys, isApple)[0];
  return fragmentModifierChoices(isApple).map((choice) => ({
    value: choice.value,
    label: choice.label,
    pressed: choice.value === selectedKey
  }));
}

export function fragmentModifierConflictWarning(
  selectedKey: string | undefined,
  isApple = isApplePlatform()
): string {
  const key = normalizeFragmentModifierKey(selectedKey, isApple);
  if (key === 'shift') {
    return '';
  }
  if (key === 'alt') {
    const label = isApple ? 'Option' : 'Alt';
    return `${label} 可能与系统、浏览器或网页快捷键冲突；如果触发不稳定，请改用 Shift。`;
  }
  const label = isApple ? 'Cmd' : 'Ctrl';
  return `${label} 可能与浏览器或网页快捷键冲突；如果触发不稳定，请改用 Shift。`;
}

export function fragmentModifierStateWarning(state: PreviewStoreState): string {
  if (!state.fragmentModifierEnabled) {
    return '';
  }
  return fragmentModifierConflictWarning(state.modifierKeys[0]);
}
