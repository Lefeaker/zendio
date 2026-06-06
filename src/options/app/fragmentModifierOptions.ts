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

const VALID_FRAGMENT_MODIFIER_KEYS = new Set<FragmentModifierKey>(['alt', 'meta', 'ctrl', 'shift']);

const LEGACY_FRAGMENT_MODIFIER_LABELS = {
  Alt: 'alt',
  Option: 'alt',
  Command: 'meta',
  Cmd: 'meta',
  'Cmd / Meta': 'meta',
  Ctrl: 'ctrl',
  Control: 'ctrl',
  Shift: 'shift'
} as const;

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

function isFragmentModifierKey(value: unknown): value is FragmentModifierKey {
  return (
    typeof value === 'string' && VALID_FRAGMENT_MODIFIER_KEYS.has(value as FragmentModifierKey)
  );
}

function coerceFragmentModifierValue(value: unknown): unknown {
  return typeof value === 'string'
    ? (LEGACY_FRAGMENT_MODIFIER_LABELS[value as keyof typeof LEGACY_FRAGMENT_MODIFIER_LABELS] ??
        value)
    : value;
}

function isKnownFragmentModifierValue(value: unknown): boolean {
  return isFragmentModifierKey(coerceFragmentModifierValue(value));
}

export function normalizeFragmentModifierKey(
  value: unknown,
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
  values: readonly unknown[] | undefined,
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
  selectedKeys: readonly unknown[],
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
  selectedKey: unknown,
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
