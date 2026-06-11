import { describe, expect, it } from 'vitest';
import {
  ReaderSessionDraftPayloadSchema,
  SessionDraftEnvelopeSchema,
  SessionDraftIndexSchema,
  SessionDraftStatusSchema,
  VideoSessionDraftPayloadSchema,
  normalizeSessionDraftEnvelopeForSave
} from '@content/sessionDrafts/sessionDraftSchemas';

describe('sessionDraftSchemas', () => {
  it('parses reader and video envelopes through mode discrimination', () => {
    const readerEnvelope = {
      schemaVersion: 1,
      draftId: 'reader-1',
      mode: 'reader',
      pageKey: 'reader-key',
      pageUrl: 'https://example.com/post#:~:text=Alpha',
      pageTitle: 'Reader title',
      createdAt: 1,
      updatedAt: 2,
      expiresAt: 3,
      status: 'active',
      payload: {
        commentDrafts: {
          'highlight-1': 'Draft note'
        },
        selectedIds: ['highlight-1']
      }
    };
    const videoEnvelope = {
      ...readerEnvelope,
      draftId: 'video-1',
      mode: 'video',
      pageUrl: 'https://video.example/watch?v=1',
      payload: {
        commentDrafts: {
          'capture-1': 'Capture note'
        },
        timestampIds: ['capture-1']
      }
    };

    expect(SessionDraftEnvelopeSchema.safeParse(readerEnvelope).success).toBe(true);
    expect(SessionDraftEnvelopeSchema.safeParse(videoEnvelope).success).toBe(true);
    expect(
      SessionDraftEnvelopeSchema.safeParse({
        ...readerEnvelope,
        schemaVersion: 2
      }).success
    ).toBe(false);
  });

  it('accepts payload extension points with comment drafts and passthrough fields', () => {
    expect(
      ReaderSessionDraftPayloadSchema.safeParse({
        commentDrafts: { h1: 'Reader draft' },
        ownerContext: { tabId: 11, frameId: 0 },
        extraField: ['keep']
      }).success
    ).toBe(true);
    expect(
      VideoSessionDraftPayloadSchema.safeParse({
        commentDrafts: { c1: 'Video draft' },
        ownerContext: { tabId: 22, windowId: 5 },
        restoreIntent: { screenshotRequested: true }
      }).success
    ).toBe(true);
  });

  it('keeps owner context optional so pre-P06 drafts still parse and restore', () => {
    expect(
      SessionDraftEnvelopeSchema.safeParse({
        schemaVersion: 1,
        draftId: 'reader-pre-p06',
        mode: 'reader',
        pageKey: 'reader-key',
        pageUrl: 'https://example.com/post',
        pageTitle: 'Reader title',
        createdAt: 1,
        updatedAt: 2,
        expiresAt: 3,
        status: 'restorable',
        payload: {
          commentDrafts: {
            'highlight-1': 'Draft note'
          }
        }
      }).success
    ).toBe(true);
  });

  it('drops explicitly undefined optional payload fields during envelope normalization', () => {
    const normalized = normalizeSessionDraftEnvelopeForSave(
      {
        schemaVersion: 1,
        draftId: 'reader-undefined-optionals',
        mode: 'reader',
        pageKey: 'stale-key',
        pageUrl: 'https://example.com/post',
        pageTitle: 'Reader title',
        createdAt: 1,
        updatedAt: 2,
        expiresAt: 3,
        status: 'active',
        payload: {
          commentDrafts: {
            'highlight-1': 'Draft note'
          },
          mode: undefined,
          ownerContext: undefined
        }
      } as unknown as Parameters<typeof normalizeSessionDraftEnvelopeForSave>[0],
      1_000
    );

    expect(normalized.pageKey).not.toBe('stale-key');
    expect(normalized.payload).not.toHaveProperty('mode');
    expect(normalized.payload).not.toHaveProperty('ownerContext');
  });

  it('validates index entries and rejects unknown schema versions', () => {
    expect(
      SessionDraftIndexSchema.safeParse({
        schemaVersion: 1,
        entries: [
          {
            key: 'aiob.sessionDraft.v1.reader.page.draft',
            draftId: 'reader-1',
            mode: 'reader',
            pageKey: 'reader-page',
            updatedAt: 2,
            expiresAt: 3,
            status: 'restorable',
            ownerContext: {
              tabId: 9,
              windowId: 2,
              frameId: 0
            }
          }
        ]
      }).success
    ).toBe(true);
    expect(
      SessionDraftIndexSchema.safeParse({
        schemaVersion: 9,
        entries: []
      }).success
    ).toBe(false);
  });

  it('accepts terminal draft statuses and still rejects unknown status strings', () => {
    expect(SessionDraftStatusSchema.safeParse('discarded').success).toBe(true);
    expect(SessionDraftStatusSchema.safeParse('exported').success).toBe(true);
    expect(SessionDraftStatusSchema.safeParse('terminal').success).toBe(false);
  });
});
