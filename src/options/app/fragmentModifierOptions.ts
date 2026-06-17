import { formatMessage } from '@i18n/messageFormatter';
import type { Messages } from '@i18n/messages';
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

type FragmentModifierPlatform = 'apple' | 'standard' | 'unknown';
type ModifierPlatformInput = boolean | FragmentModifierPlatform | undefined;
type ModifierMessagesOrPlatform = Messages | null | ModifierPlatformInput;

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
  return detectFragmentModifierPlatform(platform) === 'apple';
}

export function detectFragmentModifierPlatform(
  platform = currentPlatformLabel()
): FragmentModifierPlatform {
  const normalizedPlatform = platform.trim();
  if (!normalizedPlatform) {
    return 'unknown';
  }
  if (
    /(^|[\s(;])(?:macOS|Macintosh|MacIntel|MacPPC|Mac68K|Mac OS|Mac|iPhone|iPad|iPod)/i.test(
      normalizedPlatform
    )
  ) {
    return 'apple';
  }
  if (
    /(^|[\s(;])(?:Win32|Win64|Windows|Win|Linux|Android|CrOS|Chrome OS|X11)/i.test(
      normalizedPlatform
    )
  ) {
    return 'standard';
  }
  return 'unknown';
}

function resolveModifierPlatform(platform?: ModifierPlatformInput): FragmentModifierPlatform {
  if (platform === true) {
    return 'apple';
  }
  if (platform === false) {
    return 'standard';
  }
  return platform ?? detectFragmentModifierPlatform();
}

export function platformCommandModifierKey(
  platform: ModifierPlatformInput = detectFragmentModifierPlatform()
): FragmentModifierKey {
  return resolveModifierPlatform(platform) === 'apple' ? 'meta' : 'ctrl';
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
): { platform: FragmentModifierPlatform; messages: Messages | null } {
  if (typeof messagesOrIsApple === 'boolean') {
    return { platform: resolveModifierPlatform(messagesOrIsApple), messages: null };
  }
  if (
    messagesOrIsApple === 'apple' ||
    messagesOrIsApple === 'standard' ||
    messagesOrIsApple === 'unknown'
  ) {
    return { platform: messagesOrIsApple, messages: null };
  }

  return {
    platform: resolveModifierPlatform(maybeIsApple),
    messages: messagesOrIsApple ?? null
  };
}

function localizedModifierKeyLabel(
  key: FragmentModifierKey,
  platform: FragmentModifierPlatform
): string {
  switch (key) {
    case 'meta':
      return platform === 'apple' ? 'cmd' : 'Control/cmd';
    case 'ctrl':
      return platform === 'unknown' ? 'Control/cmd' : 'Control';
    case 'alt':
      if (platform === 'apple') {
        return 'option';
      }
      return platform === 'unknown' ? 'Option/Alt' : 'Alt';
    case 'shift':
    default:
      return 'Shift';
  }
}

export function normalizeFragmentModifierKey(
  value: string | undefined,
  platform: ModifierPlatformInput = detectFragmentModifierPlatform()
): FragmentModifierKey {
  const resolvedPlatform = resolveModifierPlatform(platform);
  const normalizedValue = coerceFragmentModifierValue(value);
  if (normalizedValue === 'meta' || normalizedValue === 'ctrl') {
    return platformCommandModifierKey(resolvedPlatform);
  }
  if (isFragmentModifierKey(normalizedValue)) {
    return normalizedValue;
  }
  return DEFAULT_FRAGMENT_MODIFIER_KEY;
}

export function normalizeFragmentModifierKeys(
  values: readonly string[] | undefined,
  platform: ModifierPlatformInput = detectFragmentModifierPlatform()
): FragmentModifierKey[] {
  const first = values?.find(isKnownFragmentModifierValue);
  return [normalizeFragmentModifierKey(first, platform)];
}

export function fragmentModifierChoices(
  platform: ModifierPlatformInput = detectFragmentModifierPlatform(),
  messages: Messages | null = null
): FragmentModifierChoice[] {
  void messages;
  const resolvedPlatform = resolveModifierPlatform(platform);
  const commandKey = platformCommandModifierKey(resolvedPlatform);
  return [
    { value: 'shift', label: localizedModifierKeyLabel('shift', resolvedPlatform) },
    {
      value: commandKey,
      label: localizedModifierKeyLabel(commandKey, resolvedPlatform)
    },
    { value: 'alt', label: localizedModifierKeyLabel('alt', resolvedPlatform) }
  ];
}

export function fragmentModifierChipItems(
  selectedKeys: readonly string[],
  messagesOrIsApple?: ModifierMessagesOrPlatform,
  maybeIsApple?: boolean
): ChipItem[] {
  const { platform, messages } = resolveModifierLocalization(messagesOrIsApple, maybeIsApple);
  const selectedKey = normalizeFragmentModifierKeys(selectedKeys, platform)[0];
  return fragmentModifierChoices(platform, messages).map((choice) => ({
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
  const { platform, messages } = resolveModifierLocalization(messagesOrIsApple, maybeIsApple);
  const key = normalizeFragmentModifierKey(selectedKey, platform);
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
      { label: localizedModifierKeyLabel('alt', platform) }
    );
  }
  return formatMessage(
    getMessage(
      messages,
      'schemaCaptureBehaviorModifierConflictBrowser',
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureBehaviorModifierConflictBrowser
    ),
    { label: localizedModifierKeyLabel(key, platform) }
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
