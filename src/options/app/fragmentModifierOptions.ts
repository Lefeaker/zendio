import { formatMessage, type Messages } from '@i18n';
import type { FragmentModifierKey } from '@shared/types/options';
import type { ChipItem, PreviewStoreState } from '@options/stitch/types';
import { DEFAULT_PRODUCTION_ENGLISH_MESSAGES } from '@options/stitch/schema/i18n';
import { getMessage } from './productionStitchPersistenceUi';

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

type ModifierMessagesOrPlatform = Messages | null | boolean | undefined;

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

function resolveModifierLocalization(
  messagesOrIsApple?: ModifierMessagesOrPlatform,
  maybeIsApple?: boolean
): { isApple: boolean; messages: Messages | null } {
  if (typeof messagesOrIsApple === 'boolean') {
    return { isApple: messagesOrIsApple, messages: null };
  }

  return {
    isApple: maybeIsApple ?? isApplePlatform(),
    messages: messagesOrIsApple ?? null
  };
}

function localizedModifierKeyLabel(
  key: FragmentModifierKey,
  messages: Messages | null,
  isApple: boolean
): string {
  switch (key) {
    case 'meta':
      return getMessage(messages, 'fragmentModifierKeyMeta', 'Cmd');
    case 'ctrl':
      return getMessage(messages, 'fragmentModifierKeyCtrl', 'Ctrl');
    case 'alt':
      return getMessage(messages, 'fragmentModifierKeyAlt', isApple ? 'Option' : 'Alt');
    case 'shift':
    default:
      return getMessage(messages, 'fragmentModifierKeyShift', 'Shift');
  }
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

export function fragmentModifierChoices(
  isApple = isApplePlatform(),
  messages: Messages | null = null
): FragmentModifierChoice[] {
  return [
    { value: 'shift', label: localizedModifierKeyLabel('shift', messages, isApple) },
    {
      value: platformCommandModifierKey(isApple),
      label: localizedModifierKeyLabel(platformCommandModifierKey(isApple), messages, isApple)
    },
    { value: 'alt', label: localizedModifierKeyLabel('alt', messages, isApple) }
  ];
}

export function fragmentModifierChipItems(
  selectedKeys: readonly string[],
  messagesOrIsApple?: ModifierMessagesOrPlatform,
  maybeIsApple?: boolean
): ChipItem[] {
  const { isApple, messages } = resolveModifierLocalization(messagesOrIsApple, maybeIsApple);
  const selectedKey = normalizeFragmentModifierKeys(selectedKeys, isApple)[0];
  return fragmentModifierChoices(isApple, messages).map((choice) => ({
    value: choice.value,
    label: choice.label,
    pressed: choice.value === selectedKey
  }));
}

export function fragmentModifierConflictWarning(
  selectedKey: string | undefined,
  messagesOrIsApple?: ModifierMessagesOrPlatform,
  maybeIsApple?: boolean
): string {
  const { isApple, messages } = resolveModifierLocalization(messagesOrIsApple, maybeIsApple);
  const key = normalizeFragmentModifierKey(selectedKey, isApple);
  if (key === 'shift') {
    return '';
  }
  if (key === 'alt') {
    return formatMessage(
      getMessage(
        messages,
        'schemaCaptureBehaviorModifierConflictSystem',
        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureBehaviorModifierConflictSystem
      ),
      { label: localizedModifierKeyLabel('alt', messages, isApple) }
    );
  }
  return formatMessage(
    getMessage(
      messages,
      'schemaCaptureBehaviorModifierConflictBrowser',
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureBehaviorModifierConflictBrowser
    ),
    { label: localizedModifierKeyLabel(key, messages, isApple) }
  );
}

export function fragmentModifierStateWarning(
  state: PreviewStoreState,
  messagesOrIsApple?: ModifierMessagesOrPlatform,
  maybeIsApple?: boolean
): string {
  if (!state.fragmentModifierEnabled) {
    return '';
  }
  return fragmentModifierConflictWarning(state.modifierKeys[0], messagesOrIsApple, maybeIsApple);
}
