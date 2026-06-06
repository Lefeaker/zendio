import { describe, expect, it } from 'vitest';
import {
  fragmentModifierChipItems,
  fragmentModifierChoices,
  fragmentModifierConflictWarning,
  normalizeFragmentModifierKeys
} from '@options/app/fragmentModifierOptions';

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
    const chips = fragmentModifierChipItems(['meta'], false);

    expect(chips).toEqual([
      { value: 'shift', label: 'Shift', pressed: false },
      { value: 'ctrl', label: 'Ctrl', pressed: true },
      { value: 'alt', label: 'Alt', pressed: false }
    ]);
  });

  it('warns only for modifier choices with shortcut collision risk', () => {
    expect(fragmentModifierConflictWarning('shift', false)).toBe('');
    expect(fragmentModifierConflictWarning('ctrl', false)).toContain('Ctrl 可能');
    expect(fragmentModifierConflictWarning('meta', true)).toContain('Cmd 可能');
    expect(fragmentModifierConflictWarning('alt', true)).toContain('Option 可能');
  });
});
