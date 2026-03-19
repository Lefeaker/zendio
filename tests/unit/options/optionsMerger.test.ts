import { describe, it, expect } from 'vitest';
import { DEFAULT_OPTIONS } from '@shared/config';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { StoredOptions, ReadingSessionOptions } from '@shared/types';
import type { FragmentModifierKey, ReaderHighlightTheme } from '@shared/types/options';

describe('shared optionsMerger', () => {
  it('returns defaults when no stored options provided', () => {
    const result = mergeOptions(undefined);
    expect(result.rest.baseUrl).toBe(DEFAULT_OPTIONS.rest.baseUrl);
    expect(result.templates.article).toBe(DEFAULT_OPTIONS.templates.article);
    expect(result.templates.reading).toBe(DEFAULT_OPTIONS.templates.reading);
    expect(result.domainMappings).toEqual(DEFAULT_OPTIONS.domainMappings);
    expect(result.readingSession.exportMode).toBe(DEFAULT_OPTIONS.readingSession.exportMode);
    expect(result.readingSession.highlightTheme).toBe(DEFAULT_OPTIONS.readingSession.highlightTheme);
  });

  it('merges partial rest and classifier values', () => {
    const stored: StoredOptions = {
      rest: {
        baseUrl: 'https://example.com',
        apiKey: 'token'
      },
      classifier: {
        enabled: true,
        provider: 'openai',
        model: 'gpt-4o'
      },
      fragmentClipper: {
        captureContext: true
      }
    };

    const result = mergeOptions(stored);
    expect(result.rest.baseUrl).toBe('https://example.com');
    expect(result.rest.apiKey).toBe('token');
    expect(result.rest.httpsUrl).toBe(DEFAULT_OPTIONS.rest.httpsUrl);
    expect(result.classifier?.enabled).toBe(true);
    expect(result.classifier?.provider).toBe('openai');
    expect(result.classifier?.model).toBe('gpt-4o');
    expect(result.classifier?.taxonomy).toEqual(DEFAULT_OPTIONS.classifier?.taxonomy);
    expect(result.fragmentClipper?.captureContext).toBe(true);
    expect(result.fragmentClipper?.contextLength).toBe(DEFAULT_OPTIONS.fragmentClipper?.contextLength);
    expect(result.fragmentClipper?.selectionModifierEnabled).toBe(DEFAULT_OPTIONS.fragmentClipper?.selectionModifierEnabled);
    expect(result.fragmentClipper?.selectionModifierKeys).toEqual(DEFAULT_OPTIONS.fragmentClipper?.selectionModifierKeys);
    expect(result.fragmentClipper?.keyboardShortcutsEnabled).toBe(DEFAULT_OPTIONS.fragmentClipper?.keyboardShortcutsEnabled);
    expect(result.templates.reading).toBe(DEFAULT_OPTIONS.templates.reading);
  });

  it('normalizes fragment modifier keys', () => {
    const stored: StoredOptions = {
      fragmentClipper: {
        selectionModifierEnabled: true,
        selectionModifierKeys: ['meta', 'ctrl', 'cmd', 'Alt'] as unknown as FragmentModifierKey[]
      }
    };

    const result = mergeOptions(stored);
    expect(result.fragmentClipper?.selectionModifierEnabled).toBe(true);
    expect(result.fragmentClipper?.selectionModifierKeys).toEqual(['meta', 'ctrl']);
  });

  it('merges reading session highlight theme when valid', () => {
    const stored: StoredOptions = {
      readingSession: {
        exportMode: 'full',
        highlightTheme: 'neonOrange'
      } as Partial<ReadingSessionOptions>
    };

    const result = mergeOptions(stored);
    expect(result.readingSession.exportMode).toBe('full');
    expect(result.readingSession.highlightTheme).toBe('neonOrange');
  });

  it('falls back to default highlight theme when invalid', () => {
    const stored: StoredOptions = {
      readingSession: {
        highlightTheme: 'invalid-color' as unknown as ReaderHighlightTheme
      } as Partial<ReadingSessionOptions>
    };

    const result = mergeOptions(stored);
    expect(result.readingSession.highlightTheme).toBe(DEFAULT_OPTIONS.readingSession.highlightTheme);
  });

  it('merges keyboard shortcuts configuration', () => {
    const stored: StoredOptions = {
      fragmentClipper: {
        keyboardShortcutsEnabled: false,
        selectionModifierEnabled: true,
        selectionModifierKeys: ['alt']
      }
    };

    const result = mergeOptions(stored);
    expect(result.fragmentClipper?.keyboardShortcutsEnabled).toBe(false);
    expect(result.fragmentClipper?.selectionModifierEnabled).toBe(true);
    expect(result.fragmentClipper?.selectionModifierKeys).toEqual(['alt']);
  });

  it('uses default keyboard shortcuts when not specified', () => {
    const stored: StoredOptions = {
      fragmentClipper: {
        selectionModifierEnabled: true
      }
    };

    const result = mergeOptions(stored);
    expect(result.fragmentClipper?.keyboardShortcutsEnabled).toBe(DEFAULT_OPTIONS.fragmentClipper?.keyboardShortcutsEnabled);
  });
});
