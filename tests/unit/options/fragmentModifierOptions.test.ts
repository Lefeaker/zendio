import { DEFAULT_RUNTIME_MESSAGES, type Messages } from '@i18n';
import { describe, expect, it } from 'vitest';
import {
  fragmentModifierChipItems,
  fragmentModifierChoices,
  fragmentModifierConflictWarning,
  normalizeFragmentModifierKeys
} from '@options/app/fragmentModifierOptions';

const ENGLISH_SENTINEL_MESSAGES: Messages = {
  ...DEFAULT_RUNTIME_MESSAGES,
  fragmentModifierKeyShift: 'Shift Sentinel',
  fragmentModifierKeyMeta: 'Cmd Sentinel',
  fragmentModifierKeyCtrl: 'Ctrl Sentinel',
  fragmentModifierKeyAlt: 'Alt Sentinel',
  schemaCaptureBehaviorModifierConflictBrowser: 'Browser warning sentinel for {label}',
  schemaCaptureBehaviorModifierConflictSystem: 'System warning sentinel for {label}'
};

describe('fragment modifier Options helpers', () => {
  it('renders three platform-specific single-select choices', () => {
    expect(fragmentModifierChoices(true)).toEqual([
      { value: 'shift', label: 'Shift' },
      { value: 'meta', label: 'Cmd' },
      { value: 'alt', label: 'Option' }
    ]);
    expect(fragmentModifierChoices(false)).toEqual([
      { value: 'shift', label: 'Shift' },
      { value: 'ctrl', label: 'Ctrl' },
      { value: 'alt', label: 'Alt' }
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
      { value: 'shift', label: 'Shift Sentinel', pressed: false },
      { value: 'ctrl', label: 'Ctrl Sentinel', pressed: true },
      { value: 'alt', label: 'Alt Sentinel', pressed: false }
    ]);
  });

  it('warns only for modifier choices with shortcut collision risk', () => {
    expect(fragmentModifierConflictWarning('shift', null, false)).toBe('');
    expect(fragmentModifierConflictWarning('ctrl', ENGLISH_SENTINEL_MESSAGES, false)).toBe(
      'Browser warning sentinel for Ctrl Sentinel'
    );
    expect(fragmentModifierConflictWarning('meta', ENGLISH_SENTINEL_MESSAGES, true)).toBe(
      'Browser warning sentinel for Cmd Sentinel'
    );
    expect(fragmentModifierConflictWarning('alt', ENGLISH_SENTINEL_MESSAGES, true)).toBe(
      'System warning sentinel for Alt Sentinel'
    );
  });
});
