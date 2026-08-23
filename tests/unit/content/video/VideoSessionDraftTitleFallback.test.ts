/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionDraftRepository } from '@content/sessionDrafts';
import { normalizeSessionDraftStoredValue } from '@shared/sessionDrafts';
import { VideoSessionState } from '@content/video/sessionState';
import { createMemoryStorageArea } from '@platform/preview/memoryStorage';
import { createSessionDraftStore } from '../../../../src/background/services/sessionDraftStore';
import { handleSessionDraftMessage } from '../../../../src/background/listeners/sessionDraftMessages';

function createEnumerableMemoryStorageArea() {
  const base = createMemoryStorageArea();
  const values = new Map<string, unknown>();
  return {
    ...base,
    async set<T>(key: string, value: T) {
      await base.set(key, value);
      values.set(key, value);
    },
    async setMany<T>(entries: Record<string, T>) {
      await base.setMany(entries);
      for (const [key, value] of Object.entries(entries)) values.set(key, value);
    },
    async remove(keys: string | string[]) {
      await base.remove(keys);
      for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key);
    },
    async clear() {
      await base.clear();
      values.clear();
    },
    async getAll() {
      return Object.fromEntries(values);
    }
  };
}

describe('VideoSessionDraftController title fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = '<video></video>';
    document.title = '';
  });

  afterEach(async () => {
    const { configureSessionDraftRuntimeMessenger } =
      await import('../../../../src/content/sessionDrafts/sessionDraftTabContext');
    configureSessionDraftRuntimeMessenger(null);
    vi.doUnmock('../../../../src/i18n/catalog/runtimeFallbackMessages');
  });

  it('sources the saved draft title fallback from the default runtime catalog', async () => {
    const actualFallbacks = await vi.importActual<
      typeof import('../../../../src/i18n/catalog/runtimeFallbackMessages')
    >('../../../../src/i18n/catalog/runtimeFallbackMessages');
    vi.doMock('../../../../src/i18n/catalog/runtimeFallbackMessages', () => ({
      ...actualFallbacks,
      RUNTIME_FALLBACK_MESSAGES: {
        ...actualFallbacks.RUNTIME_FALLBACK_MESSAGES,
        videoSessionDraftTitleFallback: 'Video draft title sentinel'
      },
      VIDEO_TITLE_FALLBACK: 'Video draft title sentinel'
    }));

    const { VideoSessionDraftController } =
      await import('../../../../src/content/video/videoSessionDraftController');
    const { configureSessionDraftRuntimeMessenger } =
      await import('../../../../src/content/sessionDrafts/sessionDraftTabContext');
    const storage = createEnumerableMemoryStorageArea();
    const store = createSessionDraftStore(storage, {
      ownerLivenessProbe: () => Promise.resolve('inactive'),
      createLeaseId: () => 'title-fallback-lease'
    });
    if (!store.ok) throw new Error(store.code);
    const sender = (message: unknown) =>
      handleSessionDraftMessage(store.store, normalizeSessionDraftStoredValue(message), {
        tabId: 9,
        frameId: 0
      }).then((result) => result as never);
    configureSessionDraftRuntimeMessenger(sender);
    const repository = createSessionDraftRepository(sender);
    const state = new VideoSessionState('gradient');
    state.captures = [
      {
        kind: 'timestamp',
        id: 'ts-1',
        timeSec: 42,
        comment: 'note',
        url: 'https://video.example/watch?t=42',
        createdAt: 1
      }
    ];

    const controller = new VideoSessionDraftController({
      doc: document,
      state,
      storageArea: storage,
      destinationState: {
        metadata: undefined,
        applyMetadata: vi.fn()
      },
      dom: {
        readCommentDrafts: vi.fn(() => ({})),
        setCommentDrafts: vi.fn()
      },
      readCleanupState: () => ({
        isCleaningUp: false,
        shouldTrackSavingState: true
      })
    });

    const result = await controller.flushNow('active');

    expect(result).toBe('ready');
    const latestDraft = await repository.loadLatest('video', document.location.href);
    expect(latestDraft?.pageTitle).toBe('Video draft title sentinel');
    if (!latestDraft || latestDraft.mode !== 'video') {
      throw new Error('expected a saved video draft');
    }
    expect(latestDraft.payload.videoTitle).toBe('Video draft title sentinel');
  });
});
