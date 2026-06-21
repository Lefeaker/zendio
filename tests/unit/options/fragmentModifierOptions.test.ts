import { DEFAULT_RUNTIME_MESSAGES, type Messages } from '@i18n';
import { describe, expect, it } from 'vitest';
import {
  detectFragmentModifierPlatform,
  fragmentKeyboardShortcutsHint,
  fragmentModifierChipItems,
  fragmentModifierChoices,
  fragmentModifierConflictWarning,
  normalizeFragmentModifierKeys,
  platformCommandModifierKey
} from '@options/app/fragmentModifierOptions';

const ENGLISH_SENTINEL_MESSAGES: Messages = {
  ...DEFAULT_RUNTIME_MESSAGES,
  fragmentModifierKeyShift: 'Shift Sentinel',
  fragmentModifierKeyMeta: 'Cmd Sentinel',
  fragmentModifierKeyCtrl: 'Ctrl Sentinel',
  fragmentModifierKeyAlt: 'Alt Sentinel',
  fragmentKeyboardShortcutsHint: 'Shortcut hint sentinel: {modifierShortcut}',
  fragmentKeyboardShortcutCommandEnter: 'Cmd+Enter Sentinel',
  fragmentKeyboardShortcutAltEnter: 'Alt+Enter Sentinel',
  fragmentKeyboardShortcutFallbackEnter: 'Cmd+Enter / Alt+Enter Sentinel',
  schemaCaptureBehaviorModifierConflictBrowser: 'Browser warning sentinel for {label}',
  schemaCaptureBehaviorModifierConflictSystem: 'System warning sentinel for {label}'
};

describe('fragment modifier Options helpers', () => {
  it('detects common browser platform strings before choosing keyboard mapping', () => {
    expect(detectFragmentModifierPlatform('MacIntel')).toBe('apple');
    expect(detectFragmentModifierPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(
      'apple'
    );
    expect(platformCommandModifierKey(detectFragmentModifierPlatform('MacIntel'))).toBe('meta');

    expect(detectFragmentModifierPlatform('Win32')).toBe('standard');
    expect(platformCommandModifierKey(detectFragmentModifierPlatform('Win32'))).toBe('ctrl');
    expect(detectFragmentModifierPlatform('Linux x86_64')).toBe('standard');
    expect(detectFragmentModifierPlatform('')).toBe('unknown');
  });

  it('renders three platform-specific single-select choices without catalog override labels', () => {
    expect(fragmentModifierChoices(true, ENGLISH_SENTINEL_MESSAGES)).toEqual([
      { value: 'shift', label: 'Shift' },
      { value: 'meta', label: 'Cmd' },
      { value: 'alt', label: 'Option' }
    ]);
    expect(fragmentModifierChoices(false, ENGLISH_SENTINEL_MESSAGES)).toEqual([
      { value: 'shift', label: 'Shift' },
      { value: 'ctrl', label: 'Control' },
      { value: 'alt', label: 'Alt' }
    ]);
    expect(fragmentModifierChoices('unknown' as never, ENGLISH_SENTINEL_MESSAGES)).toEqual([
      { value: 'shift', label: 'Shift' },
      { value: 'ctrl', label: 'Control/Cmd' },
      { value: 'alt', label: 'Option/Alt' }
    ]);
  });

  it('normalizes legacy arrays to one platform-aware key with Shift fallback', () => {
    expect(normalizeFragmentModifierKeys(['alt', 'shift'], false)).toEqual(['alt']);
    expect(normalizeFragmentModifierKeys(['meta', 'alt'], false)).toEqual(['ctrl']);
    expect(normalizeFragmentModifierKeys(['ctrl', 'alt'], true)).toEqual(['meta']);
    expect(normalizeFragmentModifierKeys(['Alt'], false)).toEqual(['alt']);
    expect(normalizeFragmentModifierKeys(['Cmd / Meta'], true)).toEqual(['meta']);
    expect(normalizeFragmentModifierKeys([], false)).toEqual(['shift']);
  });

  it('marks exactly one chip as selected', () => {
    const chips = fragmentModifierChipItems(['meta'], ENGLISH_SENTINEL_MESSAGES, false);

    expect(chips).toEqual([
      { value: 'shift', label: 'Shift', pressed: false },
      { value: 'ctrl', label: 'Control', pressed: true },
      { value: 'alt', label: 'Alt', pressed: false }
    ]);
  });

  it('warns only for modifier choices with shortcut collision risk', () => {
    expect(fragmentModifierConflictWarning('shift', null, false)).toBe('');
    expect(fragmentModifierConflictWarning('ctrl', ENGLISH_SENTINEL_MESSAGES, false)).toBe(
      'Browser warning sentinel for Control'
    );
    expect(fragmentModifierConflictWarning('meta', ENGLISH_SENTINEL_MESSAGES, true)).toBe(
      'Browser warning sentinel for Cmd'
    );
    expect(fragmentModifierConflictWarning('alt', ENGLISH_SENTINEL_MESSAGES, true)).toBe(
      'System warning sentinel for Option'
    );
  });

  it('falls back to English modifier conflict warnings when localized messages are missing', () => {
    expect(fragmentModifierConflictWarning('ctrl', null, false)).toBe(
      'Control may conflict with browser or page shortcuts. If it is unstable, use Shift.'
    );
    expect(fragmentModifierConflictWarning('alt', null, true)).toBe(
      'Option may conflict with system, browser, or page shortcuts. If it is unstable, use Shift.'
    );
  });

  it('localizes the fragment keyboard shortcut hint by detected platform', () => {
    expect(fragmentKeyboardShortcutsHint(ENGLISH_SENTINEL_MESSAGES, true)).toBe(
      'Shortcut hint sentinel: Cmd+Enter Sentinel'
    );
    expect(fragmentKeyboardShortcutsHint(ENGLISH_SENTINEL_MESSAGES, false)).toBe(
      'Shortcut hint sentinel: Alt+Enter Sentinel'
    );
    expect(fragmentKeyboardShortcutsHint(ENGLISH_SENTINEL_MESSAGES, 'unknown')).toBe(
      'Shortcut hint sentinel: Cmd+Enter / Alt+Enter Sentinel'
    );
  });
});
