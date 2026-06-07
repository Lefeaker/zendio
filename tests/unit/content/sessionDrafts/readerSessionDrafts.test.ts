/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import {
  buildReaderSessionDraftEnvelope,
  loadLatestReaderSessionDraft,
  restoreReaderSessionDraftHighlights
} from '@content/reader/sessionDrafts';
import type { ReaderHighlightRecord } from '@content/reader/services/highlightManager';
import { createSessionDraftRepository } from '@content/sessionDrafts';
import { createMemoryStorageArea } from '@platform/preview/memoryStorage';

function createHighlightRecord(
  overrides: Partial<ReaderHighlightRecord> = {}
): ReaderHighlightRecord {
  const wrapper = document.createElement('mark');
  wrapper.className = 'aiob-reader-highlight';
  wrapper.dataset.readerHighlightId = overrides.id ?? 'saved-1';
  wrapper.textContent = overrides.selectedText ?? 'Saved highlight';
  return {
    id: overrides.id ?? 'saved-1',
    selectedHtml: overrides.selectedHtml ?? '<mark>Saved highlight</mark>',
    selectedText: overrides.selectedText ?? 'Saved highlight',
    comment: overrides.comment ?? '',
    fragmentUrl: overrides.fragmentUrl ?? '#saved-1',
    wrapper,
    wrapperSegments: overrides.wrapperSegments ?? [wrapper],
    createdAt: overrides.createdAt ?? 25
  };
}

describe('readerSessionDrafts', () => {
  it('builds and loads a persisted reader draft with destination and comment drafts', async () => {
    const repository = createSessionDraftRepository(createMemoryStorageArea());
    const now = 1_780_617_600_000;
    const envelope = buildReaderSessionDraftEnvelope({
      draftId: 'reader-draft-1',
      createdAt: now - 10,
      now,
      pageUrl: 'https://example.com/article',
      pageTitle: 'Saved article',
      destination: { kind: 'downloads' },
      highlights: [
        createHighlightRecord({
          id: 'saved-1',
          selectedText: 'Saved highlight',
          comment: 'saved comment',
          createdAt: 30
        })
      ],
      commentDrafts: {
        'saved-1': 'draft note'
      },
      status: 'restorable'
    });

    expect(envelope).not.toBeNull();
    if (!envelope) {
      throw new Error('expected reader session envelope');
    }

    await repository.save(envelope);
    const loadedDraft = await loadLatestReaderSessionDraft(
      repository,
      'https://example.com/article'
    );
    expect(loadedDraft).not.toBeNull();
    expect(loadedDraft?.storageKey).toContain('reader-draft-1');
    expect(loadedDraft?.payload).toMatchObject({
      mode: 'reader',
      url: 'https://example.com/article',
      title: 'Saved article',
      destination: { kind: 'downloads' },
      commentDrafts: {
        'saved-1': 'draft note'
      }
    });
  });

  it('returns null instead of creating an empty durable reader draft', () => {
    expect(
      buildReaderSessionDraftEnvelope({
        draftId: 'reader-draft-empty',
        createdAt: 10,
        now: 20,
        pageUrl: 'https://example.com/article',
        pageTitle: 'Empty article',
        highlights: [],
        commentDrafts: {},
        status: 'active'
      })
    ).toBeNull();
  });

  it('recreates live highlight ranges when the saved text still exists in the document', () => {
    document.body.innerHTML = '<article><p>Alpha Beta Gamma</p></article>';
    const createHighlight = vi.fn(
      (options: {
        id: string;
        range: Range;
        selectedHtml: string;
        selectedText: string;
        comment: string;
        fragmentUrl: string;
      }) => {
        const wrapper = document.createElement('mark');
        wrapper.dataset.readerHighlightId = options.id;
        wrapper.textContent = options.range.toString();
        return createHighlightRecord({
          id: options.id,
          selectedHtml: options.selectedHtml,
          selectedText: options.selectedText,
          comment: options.comment,
          fragmentUrl: options.fragmentUrl,
          wrapper,
          wrapperSegments: [wrapper],
          createdAt: 40
        });
      }
    );

    const restored = restoreReaderSessionDraftHighlights({
      doc: document,
      highlightManager: {
        createHighlight
      } as never,
      highlights: [
        {
          id: 'saved-1',
          selectedHtml: '<mark>Beta</mark>',
          selectedText: 'Beta',
          comment: 'saved comment',
          fragmentUrl: '#saved-1',
          createdAt: 44
        }
      ]
    });

    expect(createHighlight).toHaveBeenCalledTimes(1);
    expect(createHighlight.mock.calls[0]?.[0].range.toString()).toBe('Beta');
    expect(restored.detachedHighlightIds).toEqual([]);
    expect(restored.highlights).toEqual([
      expect.objectContaining({
        id: 'saved-1',
        selectedText: 'Beta',
        comment: 'saved comment',
        createdAt: 44
      })
    ]);
  });

  it('falls back to detached highlight rows when the saved text no longer exists', () => {
    document.body.innerHTML = '<article><p>Alpha Beta Gamma</p></article>';
    const createHighlight = vi.fn();

    const restored = restoreReaderSessionDraftHighlights({
      doc: document,
      highlightManager: {
        createHighlight
      } as never,
      highlights: [
        {
          id: 'detached-1',
          selectedHtml: '<mark>Missing text</mark>',
          selectedText: 'Missing text',
          comment: 'saved comment',
          fragmentUrl: '#detached-1',
          createdAt: 55
        }
      ]
    });

    expect(createHighlight).not.toHaveBeenCalled();
    expect(restored.detachedHighlightIds).toEqual(['detached-1']);
    expect(restored.highlights).toEqual([
      expect.objectContaining({
        id: 'detached-1',
        selectedText: 'Missing text',
        comment: 'saved comment',
        createdAt: 55
      })
    ]);
    expect(restored.highlights[0]?.wrapper.isConnected).toBe(false);
  });
});
