import { describe, expect, it } from 'vitest';
import {
  SESSION_DRAFT_INDEX_KEY,
  createSessionDraftPageKey,
  createSessionDraftStorageKey,
  normalizeSessionDraftPageUrl
} from '@content/sessionDrafts/sessionDraftKeys';

describe('sessionDraftKeys', () => {
  it('normalizes equivalent urls deterministically when only non-text fragments differ', () => {
    expect(
      createSessionDraftPageKey('video', 'https://example.com/watch?v=1#t=12')
    ).toBe(createSessionDraftPageKey('video', 'https://example.com/watch?v=1#chapter-1'));
  });

  it('preserves reader text fragments while stripping unrelated fragments', () => {
    expect(
      normalizeSessionDraftPageUrl('reader', 'https://example.com/post#section:~:text=Alpha')
    ).toBe('https://example.com/post#:~:text=Alpha');
    expect(normalizeSessionDraftPageUrl('reader', 'https://example.com/post#section')).toBe(
      'https://example.com/post'
    );
    expect(
      createSessionDraftPageKey('reader', 'https://example.com/post#:~:text=Alpha')
    ).not.toBe(createSessionDraftPageKey('reader', 'https://example.com/post'));
  });

  it('builds storage keys without embedding the raw page url', () => {
    const pageKey = createSessionDraftPageKey(
      'reader',
      'https://example.com/article?b=2&a=1#:~:text=Stored'
    );
    const storageKey = createSessionDraftStorageKey({
      mode: 'reader',
      pageKey,
      draftId: 'draft.1'
    });

    expect(SESSION_DRAFT_INDEX_KEY).toBe('aiob.sessionDraft.index.v1');
    expect(storageKey).toMatch(/^aiob\.sessionDraft\.v1\.reader\.[a-z0-9]+\./);
    expect(storageKey).not.toContain('https://example.com/article');
  });
});
