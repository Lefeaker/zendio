/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import '../../../setup/globalSetup';
import type { ClipPromptGateway } from '@content/clipper/application/clipPromptGateway';
import { DEFAULT_FRAGMENT_CONFIG } from '@content/clipper/services/fragmentConfig';
import type {
  ReaderPanelCallbacks,
  ReaderPanelHighlight,
  ReaderPanelTexts
} from '@content/reader/application/readerPanelModel';
import type {
  ReaderPanelEditingSnapshot,
  ReaderSessionView,
  ReaderSessionViewOptions
} from '@content/reader/application/readerSessionView';
import { ReaderPanelCoordinator } from '@content/reader/panelCoordinator';
import { ReaderSession } from '@content/reader/session';
import type { ReaderSessionDependencies } from '@content/reader/session';
import { buildReaderSessionDraftEnvelope } from '@content/reader/sessionDrafts';
import { ReaderSessionLifecycle } from '@content/reader/sessionLifecycle';
import { DEFAULT_SESSION_MESSAGES } from '@content/reader/sessionMessages';
import type { SessionMutationTransaction } from '@content/sessionMutations';
import { ReaderSessionExporter } from '@content/reader/services/exporter';
import type { ReaderHighlightRecord } from '@content/reader/services/highlightManager';
import { ReaderSelectionController } from '@content/reader/services/selectionController';
import {
  buildReaderFullMarkdown,
  buildReaderHighlightsMarkdown
} from '@content/reader/utils/markdownBuilder';
import type { ReadingOptions } from '@shared/repositories/IReaderRepository';
import {
  __resetContentSessionRegistryForTests,
  getReaderSession,
  isReaderSessionActive,
  registerReaderSession
} from '@content/runtime/contentSessionRegistry';
import {
  SESSION_DRAFT_INDEX_KEY,
  createSessionDraftRepository,
  createSessionDraftStorageKey,
  type ReaderSessionDraftEnvelope,
  type SessionDraftEnvelope,
  type SessionDraftIndex,
  type SessionDraftOwnerContext
} from '@content/sessionDrafts';
import { configureSessionDraftRuntimeMessenger } from '@content/sessionDrafts/sessionDraftTabContext';
import type { SessionCommentDraftSnapshot } from '@content/shared/panels/sessionCommentDrafts';
import { createMemoryStorageArea } from '@platform/preview/memoryStorage';
import { mergeOptions } from '@shared/config/optionsMerger';
import { getTestRestUrls } from '../../../fixtures/configTestHelpers';

const LOCAL_REST_URLS = getTestRestUrls('localhost');
const LOCAL_REST_BASE_URL = LOCAL_REST_URLS.baseUrl.replace(/\/$/, '');
const LOCAL_REST_HTTPS_URL = LOCAL_REST_URLS.httpsUrl.replace(/\/$/, '');
const LOCAL_REST_HTTP_URL = LOCAL_REST_URLS.httpUrl.replace(/\/$/, '');

type TestView = ReaderSessionView & {
  updateCount: Mock<(...args: [count: number]) => void>;
  updateHint: Mock<(...args: [message: string]) => void>;
  updateTexts: Mock<(...args: [texts: ReaderPanelTexts]) => void>;
  updateDestination: Mock<(...args: [destination: unknown]) => void>;
  setHighlights: Mock<(...args: [highlights: ReaderPanelHighlight[]]) => void>;
  snapshotCommentDrafts: Mock<(...args: []) => SessionCommentDraftSnapshot>;
  hydrateCommentDrafts: Mock<(...args: [drafts: SessionCommentDraftSnapshot]) => void>;
  clearCommentDraft: Mock<(...args: [id: string]) => void>;
  restoreCommentDraft: Mock<(...args: [id: string, draft: string | undefined]) => void>;
  snapshotEditingState: Mock<(...args: []) => ReaderPanelEditingSnapshot>;
  restoreEditingState: Mock<(...args: [snapshot: ReaderPanelEditingSnapshot]) => void>;
  finishEditing: Mock<(...args: []) => void>;
  stopEditing: Mock<(...args: []) => void>;
  isEditing: Mock<(...args: []) => boolean>;
  destroy: Mock<(...args: []) => void>;
  currentDrafts: SessionCommentDraftSnapshot;
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}

type ReaderSessionTestHarness = {
  __setTestHighlights(
    records: Array<{
      id: string;
      selectedHtml: string;
      selectedText: string;
      comment: string;
      fragmentUrl: string;
      wrapper: HTMLElement;
    }>
  ): void;
  __testHighlights: Array<{
    id: string;
    selectedHtml: string;
    selectedText: string;
    comment: string;
    fragmentUrl: string;
    wrapper: HTMLElement;
    footnoteIndex?: number;
  }>;
  handleSelection(payload: unknown): Promise<void>;
  persistDraftMutation(): Promise<void>;
  runDraftMutation<Result>(transaction: SessionMutationTransaction<Result, void>): Promise<boolean>;
  draftId: string | null;
  draftCreatedAt: number | null;
  draftStorageKey: string | null;
  state: {
    saving?: boolean;
  };
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function getSessionHarness(session: ReaderSession): ReaderSessionTestHarness {
  return session as unknown as ReaderSessionTestHarness;
}

function getDraftIdentity(session: ReaderSession): {
  draftId: string | null;
  draftCreatedAt: number | null;
  draftStorageKey: string | null;
} {
  const harness = getSessionHarness(session);
  return {
    draftId: harness.draftId,
    draftCreatedAt: harness.draftCreatedAt,
    draftStorageKey: harness.draftStorageKey
  };
}

function createView(): TestView {
  let currentDrafts: SessionCommentDraftSnapshot = {};
  let editingSnapshot: ReaderPanelEditingSnapshot = {
    editingHighlightId: null,
    pendingNoteFocusHighlightId: null
  };
  return {
    element: document.createElement('div'),
    updateCount: vi.fn(),
    updateHint: vi.fn(),
    updateTexts: vi.fn(),
    updateDestination: vi.fn(),
    setHighlights: vi.fn(),
    snapshotCommentDrafts: vi.fn(() => ({ ...currentDrafts })),
    hydrateCommentDrafts: vi.fn((drafts: SessionCommentDraftSnapshot) => {
      currentDrafts = { ...drafts };
    }),
    clearCommentDraft: vi.fn((id: string) => {
      const remainingDrafts = { ...currentDrafts };
      delete remainingDrafts[id];
      currentDrafts = remainingDrafts;
    }),
    restoreCommentDraft: vi.fn((id: string, draft: string | undefined) => {
      if (draft === undefined) {
        const remainingDrafts = { ...currentDrafts };
        delete remainingDrafts[id];
        currentDrafts = remainingDrafts;
        return;
      }
      currentDrafts = { ...currentDrafts, [id]: draft };
    }),
    snapshotEditingState: vi.fn(() => ({ ...editingSnapshot })),
    restoreEditingState: vi.fn((snapshot: ReaderPanelEditingSnapshot) => {
      editingSnapshot = { ...snapshot };
    }),
    finishEditing: vi.fn(() => {
      editingSnapshot = {
        editingHighlightId: null,
        pendingNoteFocusHighlightId: null
      };
    }),
    stopEditing: vi.fn(),
    isEditing: vi.fn(() => false),
    destroy: vi.fn(),
    get currentDrafts() {
      return currentDrafts;
    },
    set currentDrafts(drafts: SessionCommentDraftSnapshot) {
      currentDrafts = drafts;
    }
  };
}

function createClipPrompt(): ClipPromptGateway & {
  requestSelectionAction: ReturnType<typeof vi.fn>;
} {
  return {
    requestSelectionAction: vi.fn().mockResolvedValue({
      action: 'clip',
      comment: ''
    })
  };
}

function setSelectionFor(node: Node): Range {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return range;
}

function createSelectionPayload(node: Node) {
  const range = setSelectionFor(node);
  return {
    range,
    selectedHtml: '<span>selection</span>',
    selectedText: node.textContent?.trim() ?? '',
    event: new MouseEvent('mouseup', { button: 0, bubbles: true })
  };
}

const CANONICAL_READER_EVENTS = new Set([
  'reader_session_started',
  'reader_draft_restored',
  'reader_highlight_added',
  'reader_exported',
  'reader_export_failed',
  'reader_session_cancelled'
]);
const FORBIDDEN_READER_EVENT_NAMES = new Set(['reader_session_exported', 'reader_session_failed']);
const FORBIDDEN_READER_PARAM_KEYS = new Set([
  'entry_point',
  'export_mode',
  'export_destination',
  'duration_ms',
  'selectedText',
  'selectedHtml',
  'comment',
  'fragmentUrl',
  'url',
  'title',
  'markdown'
]);

type TabContextProbeMessage = { type: 'AIIOB_IS_TAB_CONTEXT_ACTIVE' };
type TabContextProbeResponse = {
  success: true;
  active?: boolean;
  tabId?: number;
  windowId?: number;
  frameId?: number;
};

type TelemetryMessage = {
  type: 'ANALYTICS_EVENT';
  event: string;
  params?: Record<string, unknown>;
};

function isTabContextProbeMessage(message: object | null): message is TabContextProbeMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'AIIOB_IS_TAB_CONTEXT_ACTIVE'
  );
}

function getTelemetryMessages(context: { messaging: { send: Mock } }): TelemetryMessage[] {
  return context.messaging.send.mock.calls.flatMap(([message]) => {
    if (typeof message !== 'object' || message === null) {
      return [];
    }
    const candidate = message as { type?: unknown; event?: unknown; params?: unknown };
    if (candidate.type !== 'ANALYTICS_EVENT' || typeof candidate.event !== 'string') {
      return [];
    }
    return [
      {
        type: 'ANALYTICS_EVENT',
        event: candidate.event,
        ...(candidate.params && typeof candidate.params === 'object'
          ? { params: candidate.params as Record<string, unknown> }
          : {})
      }
    ];
  });
}

function expectCanonicalReaderTelemetry(messages: TelemetryMessage[]): void {
  for (const message of messages) {
    expect(CANONICAL_READER_EVENTS.has(message.event)).toBe(true);
    expect(FORBIDDEN_READER_EVENT_NAMES.has(message.event)).toBe(false);
    for (const key of Object.keys(message.params ?? {})) {
      expect(FORBIDDEN_READER_PARAM_KEYS.has(key)).toBe(false);
    }
  }
}

function createSessionContext() {
  document.body.innerHTML = '<article><p id="content">Hello reader session world.</p></article>';
  const view = createView();
  let callbacks: ReaderPanelCallbacks | undefined;
  let viewOptions: ReaderSessionViewOptions | undefined;
  const readerConfigListener = vi.fn<(config: ReadingOptions) => void>();
  const getReadingConfig = vi.fn().mockResolvedValue({
    exportMode: 'highlights',
    highlightTheme: 'gradient'
  });
  const environment = {
    start: vi.fn(async () => ({
      controller: null,
      messages: DEFAULT_SESSION_MESSAGES,
      fragmentConfig: DEFAULT_FRAGMENT_CONFIG
    })),
    stop: vi.fn()
  };
  const dispatchClipResult = vi.fn().mockResolvedValue(undefined);
  const showSupportProgress = vi.fn();
  const messaging = {
    send: vi.fn().mockResolvedValue(undefined)
  };
  const syncStorageArea = createMemoryStorageArea();
  const localStorageArea = createMemoryStorageArea();
  const highlightManager = {
    applyTheme: vi.fn((theme: string) => {
      document.body.dataset.aiobReaderHighlight = theme;
    }),
    createHighlight: vi.fn(
      (options: {
        id: string;
        selectedHtml: string;
        selectedText: string;
        comment: string;
        fragmentUrl: string;
      }) => {
        const wrapper = document.createElement('mark');
        wrapper.className = 'aiob-reader-highlight';
        wrapper.dataset.readerHighlightId = options.id;
        wrapper.dataset.readerComment = options.comment.trim();
        wrapper.textContent = options.selectedText;
        return {
          id: options.id,
          selectedHtml: options.selectedHtml,
          selectedText: options.selectedText,
          comment: options.comment.trim(),
          fragmentUrl: options.fragmentUrl,
          wrapper,
          wrapperSegments: [wrapper],
          createdAt: Date.now()
        } satisfies ReaderHighlightRecord;
      }
    ),
    updateComment: vi.fn((highlight: ReaderHighlightRecord, comment: string) => {
      highlight.comment = comment.trim();
      if (highlight.comment) {
        highlight.wrapper.dataset.readerComment = highlight.comment;
      } else {
        delete highlight.wrapper.dataset.readerComment;
      }
      delete highlight.footnoteIndex;
      delete highlight.wrapper.dataset.readerFootnote;
    }),
    assignFootnote: vi.fn(
      (highlight: ReaderHighlightRecord, comment: string, footnoteIndex?: number) => {
        highlight.comment = comment.trim();
        highlight.wrapper.dataset.readerComment = highlight.comment;
        if (footnoteIndex === undefined) {
          delete highlight.footnoteIndex;
          delete highlight.wrapper.dataset.readerFootnote;
          return;
        }
        highlight.footnoteIndex = footnoteIndex;
        highlight.wrapper.dataset.readerFootnote = String(footnoteIndex);
      }
    ),
    unwrapHighlight: vi.fn(),
    sortByDocumentOrder: vi.fn(),
    reconstructText: vi.fn((highlight: ReaderHighlightRecord) => highlight.selectedText),
    focusHighlight: vi.fn((highlight: ReaderHighlightRecord) => {
      highlight.wrapper.classList.add('aiob-reader-highlight--focus');
      return 1;
    })
  };

  const dependencies: ReaderSessionDependencies = {
    viewFactory: {
      createView: vi.fn<ReaderSessionDependencies['viewFactory']['createView']>(
        (nextCallbacks, _texts, nextViewOptions) => {
          callbacks = nextCallbacks;
          viewOptions = nextViewOptions;
          return view;
        }
      )
    },
    optionsRepository: {
      get: vi.fn().mockResolvedValue(
        mergeOptions({
          rest: {
            vault: 'Default Vault',
            baseUrl: LOCAL_REST_BASE_URL,
            apiKey: 'token'
          },
          vaultRouter: {
            defaultVaultId: 'default',
            vaults: [
              {
                id: 'default',
                name: 'Default Vault',
                vault: 'Default Vault',
                httpsUrl: LOCAL_REST_HTTPS_URL,
                httpUrl: LOCAL_REST_HTTP_URL,
                apiKey: 'token',
                enabled: true,
                isDefault: true
              },
              {
                id: 'research',
                name: 'Research Vault',
                vault: 'Research Vault',
                httpsUrl: 'https://localhost:27125',
                httpUrl: 'http://localhost:27122',
                apiKey: 'token',
                enabled: true
              }
            ],
            rules: []
          }
        })
      ),
      set: vi.fn(),
      onChange: vi.fn(() => () => undefined)
    },
    storage: {
      sync: syncStorageArea,
      local: localStorageArea
    },
    messaging,
    readerRepository: {
      getReadingConfig,
      sendReadingClip: vi.fn(),
      onConfigChange: vi.fn((listener: (config: ReadingOptions) => void) => {
        readerConfigListener.mockImplementation(listener);
        return () => undefined;
      })
    },
    createHighlightManager: () => highlightManager as never,
    createSelectionController: (options) => new ReaderSelectionController(options),
    createPanelCoordinator: (options) => new ReaderPanelCoordinator(options),
    createEnvironmentController: () => environment as never,
    createLifecycle: (deps, handlers) => new ReaderSessionLifecycle(deps, handlers),
    exporter: new ReaderSessionExporter({
      buildHighlightsMarkdown: buildReaderHighlightsMarkdown,
      buildFullMarkdown: buildReaderFullMarkdown
    }),
    dispatchClipResult,
    showSupportProgress
  };

  const clipPrompt = createClipPrompt();
  const session = new ReaderSession(
    document,
    'https://example.com/article',
    clipPrompt,
    dependencies
  );

  return {
    session,
    view,
    storageLocal: localStorageArea,
    draftRepository: createSessionDraftRepository(localStorageArea),
    clipPrompt,
    messaging,
    environment,
    highlightManager,
    readerRepository: {
      ...dependencies.readerRepository,
      getReadingConfig
    },
    dispatchClipResult,
    showSupportProgress,
    getCallbacks: () => callbacks,
    emitCommentDraftChange: (drafts: SessionCommentDraftSnapshot) => {
      view.currentDrafts = { ...drafts };
      viewOptions?.onCommentDraftChange?.({ ...drafts });
    },
    emitReadingConfig: readerConfigListener
  };
}

function createPersistedHighlightRecord(
  overrides: Partial<ReaderHighlightRecord> = {}
): ReaderHighlightRecord {
  const wrapper = document.createElement('mark');
  wrapper.className = 'aiob-reader-highlight';
  wrapper.dataset.readerHighlightId = overrides.id ?? 'saved-highlight';
  wrapper.textContent = overrides.selectedText ?? 'Saved highlight';
  return {
    id: overrides.id ?? 'saved-highlight',
    selectedHtml: overrides.selectedHtml ?? '<mark>Saved highlight</mark>',
    selectedText: overrides.selectedText ?? 'Saved highlight',
    comment: overrides.comment ?? '',
    fragmentUrl: overrides.fragmentUrl ?? '#saved-highlight',
    wrapper,
    wrapperSegments: overrides.wrapperSegments ?? [wrapper],
    createdAt: overrides.createdAt ?? 123
  };
}

async function loadLatestReaderDraft(
  context: ReturnType<typeof createSessionContext>,
  pageUrl = 'https://example.com/article'
): Promise<ReaderSessionDraftEnvelope | null> {
  const candidate = await context.draftRepository.loadLatest('reader', pageUrl);
  return candidate?.mode === 'reader' ? candidate : null;
}

async function listReaderDraftCandidates(
  context: ReturnType<typeof createSessionContext>,
  pageUrl = 'https://example.com/article'
): Promise<ReaderSessionDraftEnvelope[]> {
  const candidates = await context.draftRepository.listCandidates('reader', pageUrl);
  return candidates.filter(
    (candidate: SessionDraftEnvelope): candidate is ReaderSessionDraftEnvelope =>
      candidate.mode === 'reader'
  );
}

async function readStoredReaderDraft(
  context: ReturnType<typeof createSessionContext>,
  storageKey: string
): Promise<ReaderSessionDraftEnvelope | undefined> {
  const value = await context.storageLocal.get<SessionDraftEnvelope>(storageKey);
  return value?.mode === 'reader' ? value : undefined;
}

async function readDraftIndex(
  context: ReturnType<typeof createSessionContext>
): Promise<SessionDraftIndex | undefined> {
  return context.storageLocal.get<SessionDraftIndex>(SESSION_DRAFT_INDEX_KEY);
}

function removalCallIncludesKey(value: string | string[], key: string): boolean {
  return Array.isArray(value) ? value.includes(key) : value === key;
}

async function flushDraftPersistence(): Promise<void> {
  await vi.advanceTimersByTimeAsync(250);
  await Promise.resolve();
}

async function settleReaderMutation<T>(task: Promise<T>): Promise<T> {
  await flushDraftPersistence();
  return await task;
}

describe('ReaderSession', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = '';
    document.documentElement.removeAttribute('data-aiob-reader-active');
    document.body.removeAttribute('data-aiobReaderHighlight');
    document.body.removeAttribute('data-aiobReaderHighlightTheme');
    __resetContentSessionRegistryForTests(document);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes a reader session and mounts the panel view', async () => {
    const context = createSessionContext();

    await context.session.initialize();

    expect(isReaderSessionActive(document)).toBe(true);
    expect(getReaderSession()).toBe(context.session);
    expect(document.documentElement.dataset.aiobReaderActive).toBe('true');
    expect(document.body.dataset.aiobReaderHighlight).toBe('gradient');
    expect(context.environment.start).toHaveBeenCalledTimes(1);
    expect(context.getCallbacks()).toBeDefined();
    expect(context.view.updateCount).toHaveBeenLastCalledWith(0);
    expect(context.view.setHighlights).toHaveBeenLastCalledWith([]);
    expect(getSessionHarness(context.session).__testHighlights).toEqual([]);
  });

  it('tracks session start with the unknown source fallback', async () => {
    const context = createSessionContext();

    await context.session.initialize();

    expect(getTelemetryMessages(context)).toEqual([
      {
        type: 'ANALYTICS_EVENT',
        event: 'reader_session_started',
        params: { source: 'unknown' }
      }
    ]);
  });

  it('uses the clipper-selected destination for the initial reader path preview', async () => {
    const context = createSessionContext();
    const content = document.getElementById('content')?.firstChild;
    if (!content) {
      throw new Error('content missing');
    }
    const range = document.createRange();
    range.selectNodeContents(content);

    await context.session.initialize({
      range,
      selectedHtml: 'Hello reader session world.',
      selectedText: 'Hello reader session world.',
      comment: '',
      destination: { kind: 'vault', vaultId: 'research' }
    });

    expect(context.view.updateDestination).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'research',
        kind: 'vault',
        label: 'Research Vault'
      })
    );
  });

  it('restores stored highlights, comment drafts, and destination from the latest reader draft', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T00:00:00.000Z'));
    const context = createSessionContext();
    const now = Date.now();
    const envelope = buildReaderSessionDraftEnvelope({
      draftId: 'reader-draft-1',
      createdAt: now - 10,
      now,
      pageUrl: 'https://example.com/article',
      pageTitle: 'Restored article',
      destination: { kind: 'vault', vaultId: 'research' },
      highlights: [
        createPersistedHighlightRecord({
          id: 'saved-1',
          selectedText: 'Hello reader session world.',
          selectedHtml: '<mark>Hello reader session world.</mark>',
          comment: 'remember this',
          fragmentUrl: '#saved-1',
          createdAt: 15
        })
      ],
      commentDrafts: {
        'saved-1': 'unsaved note'
      },
      status: 'restorable'
    });
    if (!envelope) {
      throw new Error('expected restorable reader envelope');
    }
    await context.draftRepository.save(envelope);

    await context.session.initialize();

    expect(getSessionHarness(context.session).__testHighlights).toEqual([
      expect.objectContaining({
        id: 'saved-1',
        selectedText: 'Hello reader session world.',
        comment: 'remember this',
        createdAt: 15
      })
    ]);
    expect(context.view.currentDrafts).toEqual({
      'saved-1': 'unsaved note'
    });
    expect(context.view.updateDestination).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'research',
        kind: 'vault',
        label: 'Research Vault'
      })
    );
    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_draft_restored')
    ).toEqual({
      type: 'ANALYTICS_EVENT',
      event: 'reader_draft_restored',
      params: {
        highlight_count_bucket: 'one',
        outcome: 'completed',
        detached_highlight_count_bucket: 'zero',
        duration_bucket: 'under_100ms'
      }
    });

    await flushDraftPersistence();

    await expect(
      context.draftRepository.loadLatest('reader', 'https://example.com/article')
    ).resolves.toMatchObject({
      draftId: 'reader-draft-1',
      status: 'active'
    });
  });

  it('restores the latest reader draft before appending a new initial highlight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T00:00:00.000Z'));
    const context = createSessionContext();
    const content = document.getElementById('content')?.firstChild;
    if (!content) {
      throw new Error('content missing');
    }
    const now = Date.now();
    const envelope = buildReaderSessionDraftEnvelope({
      draftId: 'reader-draft-1',
      createdAt: now - 10,
      now,
      pageUrl: 'https://example.com/article',
      pageTitle: 'Restored article',
      destination: { kind: 'vault', vaultId: 'research' },
      highlights: [
        createPersistedHighlightRecord({
          id: 'saved-1',
          selectedText: 'Hello reader session world.',
          selectedHtml: '<mark>Hello reader session world.</mark>',
          comment: 'remember this',
          fragmentUrl: '#saved-1',
          createdAt: 15
        })
      ],
      commentDrafts: {
        'saved-1': 'unsaved note'
      },
      status: 'restorable'
    });
    if (!envelope) {
      throw new Error('expected restorable reader envelope');
    }
    await context.draftRepository.save(envelope);

    const range = document.createRange();
    range.setStart(content, 6);
    range.setEnd(content, 20);

    await context.session.initialize({
      range,
      selectedHtml: '<mark>reader session</mark>',
      selectedText: 'reader session',
      comment: 'fresh note',
      destination: { kind: 'downloads' }
    });

    expect(getSessionHarness(context.session).__testHighlights).toEqual([
      expect.objectContaining({
        id: 'saved-1',
        selectedText: 'Hello reader session world.',
        comment: 'remember this',
        createdAt: 15
      }),
      expect.objectContaining({
        selectedText: 'reader session',
        comment: 'fresh note'
      })
    ]);
    expect(context.view.currentDrafts).toEqual({
      'saved-1': 'unsaved note'
    });
    expect(context.view.updateDestination).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'research',
        kind: 'vault',
        label: 'Research Vault'
      })
    );

    await flushDraftPersistence();

    const persistedDraft = await context.draftRepository.loadLatest(
      'reader',
      'https://example.com/article'
    );
    if (!persistedDraft || persistedDraft.mode !== 'reader') {
      throw new Error('reader draft missing');
    }
    expect(persistedDraft.draftId).toBe('reader-draft-1');
    expect(persistedDraft.status).toBe('active');
    expect(persistedDraft.payload.destination).toEqual({
      kind: 'vault',
      vaultId: 'research'
    });
    expect(persistedDraft.payload.commentDrafts).toEqual({
      'saved-1': 'unsaved note'
    });
    const persistedHighlights = persistedDraft.payload.highlights ?? [];
    expect(
      persistedHighlights.some(
        ({ id, selectedText, comment }) =>
          id === 'saved-1' &&
          selectedText === 'Hello reader session world.' &&
          comment === 'remember this'
      )
    ).toBe(true);
    expect(
      persistedHighlights.some(
        ({ selectedText, comment }) => selectedText === 'reader session' && comment === 'fresh note'
      )
    ).toBe(true);
  });

  it('tracks detached highlight counts when a restored reader draft can only hydrate detached rows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T00:00:00.000Z'));
    const context = createSessionContext();
    const now = Date.now();
    const envelope = buildReaderSessionDraftEnvelope({
      draftId: 'reader-draft-detached',
      createdAt: now - 10,
      now,
      pageUrl: 'https://example.com/article',
      pageTitle: 'Detached article',
      destination: { kind: 'downloads' },
      highlights: [
        createPersistedHighlightRecord({
          id: 'detached-1',
          selectedText: 'Missing reader text',
          selectedHtml: '<mark>Missing reader text</mark>',
          comment: 'detached note',
          fragmentUrl: '#detached-1',
          createdAt: 15
        })
      ],
      commentDrafts: {},
      status: 'restorable'
    });
    if (!envelope) {
      throw new Error('expected detached reader envelope');
    }
    await context.draftRepository.save(envelope);

    await context.session.initialize();

    expect(getSessionHarness(context.session).__testHighlights).toEqual([
      expect.objectContaining({
        id: 'detached-1',
        selectedText: 'Missing reader text',
        comment: 'detached note',
        createdAt: 15
      })
    ]);
    expect(getSessionHarness(context.session).__testHighlights[0]?.wrapper.isConnected).toBe(false);
    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_draft_restored')
    ).toEqual({
      type: 'ANALYTICS_EVENT',
      event: 'reader_draft_restored',
      params: {
        highlight_count_bucket: 'one',
        outcome: 'completed',
        detached_highlight_count_bucket: 'one',
        duration_bucket: 'under_100ms'
      }
    });
  });

  it('tracks failed draft restore outcomes and removes invalid candidates without hydrating reader state', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T00:00:00.000Z'));
    const context = createSessionContext();
    const now = Date.now();
    const envelope = buildReaderSessionDraftEnvelope({
      draftId: 'reader-draft-invalid',
      createdAt: now - 10,
      now,
      pageUrl: 'https://example.com/article',
      pageTitle: 'Broken article',
      destination: { kind: 'downloads' },
      highlights: [
        createPersistedHighlightRecord({
          id: 'saved-1',
          selectedText: 'Hello reader session world.',
          selectedHtml: '<mark>Hello reader session world.</mark>',
          comment: 'remember this',
          fragmentUrl: '#saved-1',
          createdAt: 15
        })
      ],
      commentDrafts: {
        'saved-1': 'unsaved note'
      },
      status: 'restorable'
    });
    if (!envelope) {
      throw new Error('expected invalid reader envelope');
    }
    await context.draftRepository.save(envelope);
    const invalidDraftStorageKey = createSessionDraftStorageKey({
      mode: envelope.mode,
      pageKey: envelope.pageKey,
      draftId: envelope.draftId
    });
    await context.storageLocal.set(invalidDraftStorageKey, {
      ...envelope,
      payload: {
        ...envelope.payload,
        commentDrafts: [] as unknown as SessionCommentDraftSnapshot
      }
    } as SessionDraftEnvelope);

    await context.session.initialize();

    expect(getSessionHarness(context.session).__testHighlights).toEqual([]);
    expect(context.view.currentDrafts).toEqual({});
    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_draft_restored')
    ).toEqual({
      type: 'ANALYTICS_EVENT',
      event: 'reader_draft_restored',
      params: {
        highlight_count_bucket: 'one',
        outcome: 'failed',
        duration_bucket: 'under_100ms'
      }
    });
    await expect(
      context.draftRepository.loadLatest('reader', 'https://example.com/article')
    ).resolves.toBeNull();
  });

  it('flushes a restorable reader draft on pagehide after prior mutation-time saves', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }

    await settleReaderMutation(
      getSessionHarness(context.session).handleSelection(createSelectionPayload(content.firstChild))
    );

    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    await Promise.resolve();
    await Promise.resolve();

    await expect(
      context.draftRepository.loadLatest('reader', 'https://example.com/article')
    ).resolves.toMatchObject({
      status: 'restorable'
    });
  });

  it('destroy delegates to cancel cleanup and resets mounted state', async () => {
    const context = createSessionContext();
    await context.session.initialize();

    context.session.destroy();
    await vi.waitFor(() => {
      expect(context.view.destroy).toHaveBeenCalledTimes(1);
    });

    expect(context.environment.stop).toHaveBeenCalledTimes(1);
    expect(isReaderSessionActive(document)).toBe(false);
    expect(getReaderSession()).toBeNull();
    expect(document.documentElement.dataset.aiobReaderActive).toBeUndefined();
    expect(document.body.dataset.aiobReaderHighlight).toBeUndefined();
  });

  it('panel callbacks delegate to finish, cancel, delete, edit, and focus flows', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();
    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    const wrapper = document.createElement('mark');
    wrapper.dataset.readerHighlightId = 'h-1';
    wrapper.textContent = 'Hello';
    (
      wrapper as HTMLElement & { scrollIntoView: Mock<HTMLElement['scrollIntoView']> }
    ).scrollIntoView = vi.fn<HTMLElement['scrollIntoView']>();
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-1',
        selectedHtml: '<mark>Hello</mark>',
        selectedText: 'Hello',
        comment: 'memo',
        fragmentUrl: '#h-1',
        wrapper
      }
    ]);

    callbacks.onFocusHighlight('h-1');
    expect(wrapper.classList.contains('aiob-reader-highlight--focus')).toBe(true);

    const editPromise = Promise.resolve(callbacks.onSubmitHighlightEdit('h-1', '  updated memo  '));
    await flushDraftPersistence();
    await editPromise;
    expect(context.view.finishEditing).toHaveBeenCalled();
    expect(context.view.updateHint).toHaveBeenLastCalledWith(DEFAULT_SESSION_MESSAGES.panel.hint);

    const deletePromise = Promise.resolve(callbacks.onDeleteHighlight('h-1'));
    await flushDraftPersistence();
    await deletePromise;
    expect(getSessionHarness(context.session).__testHighlights).toEqual([]);
    expect(context.view.updateHint).toHaveBeenLastCalledWith(
      DEFAULT_SESSION_MESSAGES.hintNoHighlights
    );

    callbacks.onCancel();
    await vi.waitFor(() => {
      expect(context.view.destroy).toHaveBeenCalled();
    });
  });

  it('captures selection directly inside reader mode without opening the clipper prompt', async () => {
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }
    await getSessionHarness(context.session).handleSelection(
      createSelectionPayload(content.firstChild)
    );

    const highlights = getSessionHarness(context.session).__testHighlights;
    expect(highlights).toHaveLength(1);
    expect(highlights[0]?.comment).toBe('');
    expect(highlights[0]?.selectedText).toContain('Hello reader session world.');
    expect(context.clipPrompt.requestSelectionAction).not.toHaveBeenCalled();
    expect(context.view.updateCount).toHaveBeenLastCalledWith(1);
    expect(context.view.setHighlights).toHaveBeenCalled();
  });

  it('rolls back added highlights, hint state, and telemetry when durable add save fails', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    context.highlightManager.unwrapHighlight.mockImplementation(
      (highlight: ReaderHighlightRecord) => {
        highlight.wrapper.remove();
      }
    );
    context.highlightManager.createHighlight.mockImplementationOnce(
      (options: {
        id: string;
        selectedHtml: string;
        selectedText: string;
        comment: string;
        fragmentUrl: string;
      }) => {
        const wrapper = document.createElement('mark');
        wrapper.className = 'aiob-reader-highlight';
        wrapper.dataset.readerHighlightId = options.id;
        wrapper.dataset.readerComment = options.comment.trim();
        wrapper.textContent = options.selectedText;
        document.body.appendChild(wrapper);
        return {
          id: options.id,
          selectedHtml: options.selectedHtml,
          selectedText: options.selectedText,
          comment: options.comment.trim(),
          fragmentUrl: options.fragmentUrl,
          wrapper,
          wrapperSegments: [wrapper],
          createdAt: Date.now()
        } satisfies ReaderHighlightRecord;
      }
    );
    vi.spyOn(context.storageLocal, 'setMany').mockRejectedValueOnce(
      new Error('durable add failed')
    );

    const selectionPromise = Promise.resolve(
      getSessionHarness(context.session).handleSelection(createSelectionPayload(content.firstChild))
    );
    await Promise.resolve();

    expect(getSessionHarness(context.session).__testHighlights).toHaveLength(1);
    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_highlight_added')
    ).toBeUndefined();

    await flushDraftPersistence();
    await selectionPromise;

    await expect(
      context.draftRepository.loadLatest('reader', 'https://example.com/article')
    ).resolves.toBeNull();
    expect(getSessionHarness(context.session).__testHighlights).toHaveLength(0);
    expect(document.querySelector('[data-reader-highlight-id]')).toBeNull();
    expect(context.view.updateHint).toHaveBeenLastCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_highlight_added')
    ).toBeUndefined();
    warnSpy.mockRestore();
  });

  it('applies transactional add highlights while the draft mutation save boundary is active', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }

    const savingStatesDuringCreate: boolean[] = [];
    const originalCreateHighlight =
      context.highlightManager.createHighlight.getMockImplementation();
    if (!originalCreateHighlight) {
      throw new Error('expected highlight manager createHighlight implementation');
    }
    context.highlightManager.createHighlight.mockImplementation(
      (options: {
        id: string;
        selectedHtml: string;
        selectedText: string;
        comment: string;
        fragmentUrl: string;
      }) => {
        savingStatesDuringCreate.push(Boolean(getSessionHarness(context.session).state.saving));
        return originalCreateHighlight(options);
      }
    );

    const selectionPromise = Promise.resolve(
      getSessionHarness(context.session).handleSelection(createSelectionPayload(content.firstChild))
    );
    await Promise.resolve();

    expect(savingStatesDuringCreate).toEqual([true]);
    expect(getSessionHarness(context.session).state.saving).toBe(true);
    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_highlight_added')
    ).toBeUndefined();

    await flushDraftPersistence();
    await selectionPromise;

    expect(getSessionHarness(context.session).state.saving).toBe(false);
    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_highlight_added')
    ).toEqual({
      type: 'ANALYTICS_EVENT',
      event: 'reader_highlight_added',
      params: {
        selection_length_bucket: 'twenty_one_to_fifty',
        highlight_count_bucket: 'one'
      }
    });
  });

  it('rejects durable reader draft saves when storage persistence fails and keeps the session mounted for retry', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const wrapper = document.createElement('mark');
    wrapper.dataset.readerHighlightId = 'retry-highlight';
    wrapper.textContent = 'Retry highlight';
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'retry-highlight',
        selectedHtml: '<mark>Retry highlight</mark>',
        selectedText: 'Retry highlight',
        comment: 'retry me',
        fragmentUrl: '#retry-highlight',
        wrapper
      }
    ]);

    const saveError = new Error('durable save failed');
    vi.spyOn(context.storageLocal, 'setMany').mockRejectedValueOnce(saveError);

    const persistPromise = getSessionHarness(context.session).persistDraftMutation();
    const persistExpectation = expect(persistPromise).rejects.toThrow(saveError);
    await vi.advanceTimersByTimeAsync(250);

    await persistExpectation;
    expect(isReaderSessionActive(document)).toBe(true);
    expect(getReaderSession()).toBe(context.session);
    expect(getSessionHarness(context.session).__testHighlights).toHaveLength(1);
    const draftIdentity = getDraftIdentity(context.session);
    expect(typeof draftIdentity.draftId).toBe('string');
    expect(typeof draftIdentity.draftCreatedAt).toBe('number');
    expect(typeof draftIdentity.draftStorageKey).toBe('string');
  });

  it('serializes durable reader mutations and ignores new selections while saving is in flight', async () => {
    const context = createSessionContext();
    await context.session.initialize();

    const firstSave = createDeferred<void>();
    const events: string[] = [];

    const firstRun = getSessionHarness(context.session).runDraftMutation({
      apply: () => {
        events.push('first:apply');
        return 'first-result';
      },
      save: async () => {
        events.push('first:save:start');
        await firstSave.promise;
        events.push('first:save:end');
      },
      commit: (result) => {
        events.push(`first:commit:${result}`);
      },
      rollback: () => {
        events.push('first:rollback');
      }
    });

    await Promise.resolve();

    const secondRun = getSessionHarness(context.session).runDraftMutation({
      apply: () => {
        events.push('second:apply');
        return 'second-result';
      },
      save: async () => {
        events.push('second:save');
      },
      commit: (result) => {
        events.push(`second:commit:${result}`);
      },
      rollback: () => {
        events.push('second:rollback');
      }
    });

    await Promise.resolve();

    expect(getSessionHarness(context.session).state.saving).toBe(true);
    expect(events).toEqual(['first:apply', 'first:save:start']);

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }
    setSelectionFor(content.firstChild);
    content.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));

    expect(getSessionHarness(context.session).__testHighlights).toHaveLength(0);

    firstSave.resolve();

    await expect(firstRun).resolves.toBe(true);
    await expect(secondRun).resolves.toBe(true);

    expect(events).toEqual([
      'first:apply',
      'first:save:start',
      'first:save:end',
      'first:commit:first-result',
      'second:apply',
      'second:save',
      'second:commit:second-result'
    ]);
    expect(getSessionHarness(context.session).state.saving).toBe(false);
  });

  it('restores deleted highlights, wrapper presentation, and in-progress drafts when durable delete save fails', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();
    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-delete';
    wrapper.dataset.readerComment = 'drafted note';
    wrapper.textContent = 'Delete me';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-delete',
        selectedHtml: '<mark>Delete me</mark>',
        selectedText: 'Delete me',
        comment: 'drafted note',
        fragmentUrl: '#delete-me',
        wrapper
      }
    ]);
    context.view.currentDrafts = {
      'h-delete': 'draft to keep'
    };
    context.view.setHighlights.mockImplementation((highlights: ReaderPanelHighlight[]) => {
      const validIds = new Set(highlights.map((highlight) => highlight.id));
      context.view.currentDrafts = Object.fromEntries(
        Object.entries(context.view.currentDrafts).filter(([id]) => validIds.has(id))
      );
    });
    const initialPersist = getSessionHarness(context.session).persistDraftMutation();
    await flushDraftPersistence();
    await initialPersist;
    context.highlightManager.unwrapHighlight.mockImplementation(
      (highlight: ReaderHighlightRecord) => {
        highlight.wrapper.remove();
      }
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(context.storageLocal, 'remove').mockRejectedValueOnce(
      new Error('durable delete failed')
    );

    const deletePromise = Promise.resolve(callbacks.onDeleteHighlight('h-delete'));
    const deleteExpectation = expect(deletePromise).rejects.toThrow(
      'Failed to save reader highlight removal.'
    );
    await Promise.resolve();

    expect(getSessionHarness(context.session).__testHighlights).toHaveLength(0);
    expect(context.view.currentDrafts).toEqual({});
    expect(wrapper.isConnected).toBe(false);

    await flushDraftPersistence();
    await deleteExpectation;

    expect(getSessionHarness(context.session).__testHighlights).toHaveLength(1);
    expect(context.view.currentDrafts).toEqual({
      'h-delete': 'draft to keep'
    });
    expect(wrapper.isConnected).toBe(true);
    expect(document.querySelectorAll('[data-reader-highlight-id="h-delete"]')).toHaveLength(1);
    expect(context.view.updateHint).toHaveBeenLastCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    warnSpy.mockRestore();
  });

  it('removes deleted highlight comment drafts from the durable reader draft before save', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();
    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    const deleteWrapper = document.createElement('mark');
    deleteWrapper.className = 'aiob-reader-highlight';
    deleteWrapper.dataset.readerHighlightId = 'h-delete';
    deleteWrapper.textContent = 'Delete me';
    const keepWrapper = document.createElement('mark');
    keepWrapper.className = 'aiob-reader-highlight';
    keepWrapper.dataset.readerHighlightId = 'h-keep';
    keepWrapper.textContent = 'Keep me';
    document.body.append(deleteWrapper, keepWrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-delete',
        selectedHtml: '<mark>Delete me</mark>',
        selectedText: 'Delete me',
        comment: 'delete note',
        fragmentUrl: '#delete-me',
        wrapper: deleteWrapper
      },
      {
        id: 'h-keep',
        selectedHtml: '<mark>Keep me</mark>',
        selectedText: 'Keep me',
        comment: 'keep note',
        fragmentUrl: '#keep-me',
        wrapper: keepWrapper
      }
    ]);
    context.view.currentDrafts = {
      'h-delete': 'orphan draft',
      'h-keep': 'keep draft'
    };
    context.highlightManager.unwrapHighlight.mockImplementation(
      (highlight: ReaderHighlightRecord) => {
        highlight.wrapper.remove();
      }
    );

    const deletePromise = Promise.resolve(callbacks.onDeleteHighlight('h-delete'));
    await flushDraftPersistence();
    await deletePromise;

    const draft = await loadLatestReaderDraft(context);
    if (!draft) {
      throw new Error('reader draft missing after delete');
    }
    expect(draft.payload.highlights?.map(({ id }) => id)).toEqual(['h-keep']);
    expect(draft.payload.commentDrafts).toEqual({
      'h-keep': 'keep draft'
    });
    expect(draft.payload.commentDrafts).not.toHaveProperty('h-delete');
  });

  it('does not overwrite the durable reader draft with a deleted highlight when delete save fails', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();
    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    const deleteWrapper = document.createElement('mark');
    deleteWrapper.className = 'aiob-reader-highlight';
    deleteWrapper.dataset.readerHighlightId = 'h-delete';
    deleteWrapper.textContent = 'Delete me';
    document.body.appendChild(deleteWrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-delete',
        selectedHtml: '<mark>Delete me</mark>',
        selectedText: 'Delete me',
        comment: 'delete note',
        fragmentUrl: '#delete-me',
        wrapper: deleteWrapper
      }
    ]);
    context.view.currentDrafts = {
      'h-delete': 'draft to keep'
    };

    const initialPersist = getSessionHarness(context.session).persistDraftMutation();
    await flushDraftPersistence();
    await initialPersist;
    const beforeDelete = await loadLatestReaderDraft(context);
    if (!beforeDelete) {
      throw new Error('reader draft missing before delete');
    }
    expect(beforeDelete.payload.highlights?.map(({ id }) => id)).toEqual(['h-delete']);
    expect(beforeDelete.payload.commentDrafts).toEqual({
      'h-delete': 'draft to keep'
    });

    context.highlightManager.unwrapHighlight.mockImplementation(
      (highlight: ReaderHighlightRecord) => {
        highlight.wrapper.remove();
      }
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(context.storageLocal, 'remove').mockRejectedValueOnce(
      new Error('durable delete failed')
    );

    const deletePromise = Promise.resolve(callbacks.onDeleteHighlight('h-delete'));
    const deleteExpectation = expect(deletePromise).rejects.toThrow(
      'Failed to save reader highlight removal.'
    );
    await Promise.resolve();
    expect(getSessionHarness(context.session).__testHighlights).toHaveLength(0);
    expect(context.view.currentDrafts).toEqual({});
    expect(deleteWrapper.isConnected).toBe(false);

    await flushDraftPersistence();
    await deleteExpectation;

    expect(getSessionHarness(context.session).__testHighlights).toHaveLength(1);
    expect(context.view.currentDrafts).toEqual({
      'h-delete': 'draft to keep'
    });
    expect(deleteWrapper.isConnected).toBe(true);
    await expect(loadLatestReaderDraft(context)).resolves.toEqual(beforeDelete);
    warnSpy.mockRestore();
  });

  it('emits reader_highlight_added only after durable add save succeeds', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }

    const selectionPromise = Promise.resolve(
      getSessionHarness(context.session).handleSelection(createSelectionPayload(content.firstChild))
    );
    await Promise.resolve();

    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_highlight_added')
    ).toBeUndefined();

    await flushDraftPersistence();
    await selectionPromise;

    const highlightEvent = getTelemetryMessages(context).find(
      (message) => message.event === 'reader_highlight_added'
    );
    expect(highlightEvent).toEqual({
      type: 'ANALYTICS_EVENT',
      event: 'reader_highlight_added',
      params: {
        selection_length_bucket: 'twenty_one_to_fifty',
        highlight_count_bucket: 'one'
      }
    });
    expectCanonicalReaderTelemetry(getTelemetryMessages(context));
  });

  it('rolls back edited comments and keeps editing state coherent when durable edit save fails', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();
    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-edit';
    wrapper.dataset.readerComment = 'memo';
    wrapper.dataset.readerFootnote = '2';
    wrapper.textContent = 'Edit me';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-edit',
        selectedHtml: '<mark>Edit me</mark>',
        selectedText: 'Edit me',
        comment: 'memo',
        fragmentUrl: '#edit-me',
        wrapper
      }
    ]);
    const [highlight] = getSessionHarness(context.session).__testHighlights;
    if (!highlight) {
      throw new Error('reader highlight missing');
    }
    highlight.footnoteIndex = 2;
    context.view.currentDrafts = {
      'h-edit': 'updated memo'
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(context.storageLocal, 'setMany').mockRejectedValueOnce(new Error('edit failed'));

    const editPromise = Promise.resolve(
      callbacks.onSubmitHighlightEdit('h-edit', ' updated memo ')
    );
    const editExpectation = expect(editPromise).rejects.toThrow();
    await Promise.resolve();

    expect(highlight.comment).toBe('updated memo');
    expect(wrapper.dataset.readerComment).toBe('updated memo');
    expect(wrapper.dataset.readerFootnote).toBeUndefined();

    await flushDraftPersistence();
    await editExpectation;

    expect(highlight.comment).toBe('memo');
    expect(highlight.footnoteIndex).toBe(2);
    expect(wrapper.dataset.readerComment).toBe('memo');
    expect(wrapper.dataset.readerFootnote).toBe('2');
    expect(context.view.currentDrafts).toEqual({
      'h-edit': 'updated memo'
    });
    expect(context.view.stopEditing).not.toHaveBeenCalled();
    expect(context.view.updateHint).toHaveBeenLastCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    warnSpy.mockRestore();
  });

  it('removes committed highlight input drafts from the durable reader draft before edit save', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();
    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-edit';
    wrapper.dataset.readerComment = 'old memo';
    wrapper.textContent = 'Edit me';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-edit',
        selectedHtml: '<mark>Edit me</mark>',
        selectedText: 'Edit me',
        comment: 'old memo',
        fragmentUrl: '#edit-me',
        wrapper
      }
    ]);
    context.view.currentDrafts = {
      'h-edit': 'new memo'
    };

    const editPromise = Promise.resolve(callbacks.onSubmitHighlightEdit('h-edit', ' new memo '));
    await flushDraftPersistence();
    await editPromise;

    const draft = await loadLatestReaderDraft(context);
    if (!draft) {
      throw new Error('reader draft missing after edit');
    }
    expect(draft.payload.highlights?.find(({ id }) => id === 'h-edit')?.comment).toBe('new memo');
    expect(draft.payload.commentDrafts).toEqual({});
    expect(draft.payload.commentDrafts).not.toHaveProperty('h-edit');
  });

  it('does not overwrite the durable reader draft with an edited comment when edit save fails', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();
    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-edit';
    wrapper.dataset.readerComment = 'old memo';
    wrapper.dataset.readerFootnote = '3';
    wrapper.textContent = 'Edit me';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-edit',
        selectedHtml: '<mark>Edit me</mark>',
        selectedText: 'Edit me',
        comment: 'old memo',
        fragmentUrl: '#edit-me',
        wrapper
      }
    ]);
    const [highlight] = getSessionHarness(context.session).__testHighlights;
    if (!highlight) {
      throw new Error('reader highlight missing');
    }
    highlight.footnoteIndex = 3;
    context.view.currentDrafts = {
      'h-edit': 'new memo'
    };

    const initialPersist = getSessionHarness(context.session).persistDraftMutation();
    await flushDraftPersistence();
    await initialPersist;
    const beforeEdit = await loadLatestReaderDraft(context);
    if (!beforeEdit) {
      throw new Error('reader draft missing before edit');
    }
    expect(beforeEdit.payload.highlights?.find(({ id }) => id === 'h-edit')?.comment).toBe(
      'old memo'
    );
    expect(beforeEdit.payload.commentDrafts).toEqual({
      'h-edit': 'new memo'
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(context.storageLocal, 'setMany').mockRejectedValueOnce(new Error('edit failed'));

    const editPromise = Promise.resolve(callbacks.onSubmitHighlightEdit('h-edit', ' new memo '));
    const editExpectation = expect(editPromise).rejects.toThrow(
      'Failed to save reader highlight edit.'
    );
    await Promise.resolve();

    expect(highlight.comment).toBe('new memo');
    expect(context.view.currentDrafts).toEqual({});

    await flushDraftPersistence();
    await editExpectation;

    expect(highlight.comment).toBe('old memo');
    expect(highlight.footnoteIndex).toBe(3);
    expect(wrapper.dataset.readerComment).toBe('old memo');
    expect(wrapper.dataset.readerFootnote).toBe('3');
    expect(context.view.currentDrafts).toEqual({
      'h-edit': 'new memo'
    });
    expect(context.view.stopEditing).not.toHaveBeenCalled();
    expect(getTelemetryMessages(context).map((message) => message.event)).toEqual([
      'reader_session_started'
    ]);
    await expect(loadLatestReaderDraft(context)).resolves.toEqual(beforeEdit);
    warnSpy.mockRestore();
  });

  it('restores the previous destination preview when durable destination save fails', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();
    const callbacks = context.getCallbacks();
    if (!callbacks?.onSelectDestination) {
      throw new Error('destination callback missing');
    }

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-destination';
    wrapper.textContent = 'Destination highlight';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-destination',
        selectedHtml: '<mark>Destination highlight</mark>',
        selectedText: 'Destination highlight',
        comment: '',
        fragmentUrl: '#destination-highlight',
        wrapper
      }
    ]);

    const firstSelectionPromise = Promise.resolve(callbacks.onSelectDestination('research'));
    await flushDraftPersistence();
    await firstSelectionPromise;

    expect(context.view.updateDestination).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'research',
        kind: 'vault',
        label: 'Research Vault'
      })
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(context.storageLocal, 'setMany').mockRejectedValueOnce(
      new Error('destination save failed')
    );

    const secondSelectionPromise = Promise.resolve(callbacks.onSelectDestination('downloads'));
    await Promise.resolve();
    await flushDraftPersistence();
    await secondSelectionPromise;

    expect(context.view.updateDestination).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'research',
        kind: 'vault',
        label: 'Research Vault'
      })
    );
    const destinationDraft = await context.draftRepository.loadLatest(
      'reader',
      'https://example.com/article'
    );
    if (!destinationDraft || destinationDraft.mode !== 'reader') {
      throw new Error('reader draft missing after destination rollback');
    }
    expect(destinationDraft.payload.destination).toEqual({
      kind: 'vault',
      vaultId: 'research'
    });
    warnSpy.mockRestore();
  });

  it('keeps typed comment drafts visible, applies a failure hint, and preserves draft identity when autosave rejects', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }

    await settleReaderMutation(
      Promise.resolve(
        getSessionHarness(context.session).handleSelection(
          createSelectionPayload(content.firstChild)
        )
      )
    );

    const [highlight] = getSessionHarness(context.session).__testHighlights;
    if (!highlight) {
      throw new Error('reader highlight missing');
    }

    const draftIdentity = getDraftIdentity(context.session);
    const saveError = new Error('autosave failed');
    vi.spyOn(context.storageLocal, 'setMany').mockRejectedValueOnce(saveError);

    context.emitCommentDraftChange({
      [highlight.id]: 'typed note'
    });
    await flushDraftPersistence();

    expect(context.view.currentDrafts).toEqual({
      [highlight.id]: 'typed note'
    });
    expect(context.view.updateHint).toHaveBeenLastCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    expect(getDraftIdentity(context.session)).toEqual(draftIdentity);
  });

  it('preserves draft identity when exact-key reader draft cleanup fails', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }

    await settleReaderMutation(
      Promise.resolve(
        getSessionHarness(context.session).handleSelection(
          createSelectionPayload(content.firstChild)
        )
      )
    );

    const persistedIdentity = getDraftIdentity(context.session);
    if (!persistedIdentity.draftStorageKey) {
      throw new Error('expected persisted draft key');
    }

    getSessionHarness(context.session).__setTestHighlights([]);

    const removeError = new Error('remove failed');
    const removeSpy = vi.spyOn(context.storageLocal, 'remove').mockRejectedValueOnce(removeError);

    const removePromise = getSessionHarness(context.session).persistDraftMutation();
    await expect(removePromise).rejects.toThrow(removeError);

    expect(removeSpy).toHaveBeenCalledWith([persistedIdentity.draftStorageKey]);
    expect(getDraftIdentity(context.session)).toEqual(persistedIdentity);
  });

  it('reports selection failures', async () => {
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    context.highlightManager.createHighlight.mockImplementationOnce(() => {
      throw new Error('network');
    });
    await getSessionHarness(context.session).handleSelection(
      createSelectionPayload(content.firstChild)
    );
    expect(context.view.updateHint).toHaveBeenCalledWith(
      DEFAULT_SESSION_MESSAGES.hintSelectionFailure
    );
    errorSpy.mockRestore();
  });

  it('ingests external highlights and clears selection', async () => {
    const context = createSessionContext();
    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }
    const range = setSelectionFor(content.firstChild);
    const selection = window.getSelection();
    if (!selection) {
      throw new Error('selection missing');
    }
    const removeSpy = vi.spyOn(selection, 'removeAllRanges');

    context.session.ingestExternalHighlight(range, '<p>ext</p>', 'ext', 'memo');
    await Promise.resolve();

    const highlights = getSessionHarness(context.session).__testHighlights;
    expect(highlights).toHaveLength(1);
    expect(highlights[0]?.comment).toBe('memo');
    expect(removeSpy).toHaveBeenCalledTimes(1);
    removeSpy.mockRestore();
  });

  it('start is a no-op when another session is already active', async () => {
    const context = createSessionContext();
    registerReaderSession({ id: 'existing-reader' }, document);

    await context.session.start();

    expect(context.environment.start).not.toHaveBeenCalled();
    expect(context.getCallbacks()).toBeUndefined();
    expect(context.view.updateCount).not.toHaveBeenCalled();
  });

  it('falls back to default reading config when repository loading fails', async () => {
    const context = createSessionContext();
    context.readerRepository.getReadingConfig.mockRejectedValueOnce(new Error('boom'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await context.session.initialize();

    expect(document.body.dataset.aiobReaderHighlight).toBe('gradient');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('reacts to injected reading config updates', async () => {
    const context = createSessionContext();
    await context.session.initialize();

    context.emitReadingConfig({ exportMode: 'highlights', highlightTheme: 'neonGreen' });

    expect(document.body.dataset.aiobReaderHighlight).toBe('neonGreen');
  });

  it('finish exports markdown and cleans up the session', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-export';
    wrapper.textContent = 'Export me';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-export',
        selectedHtml: '<mark>Export me</mark>',
        selectedText: 'Export me',
        comment: 'note',
        fragmentUrl: '#export',
        wrapper
      }
    ]);
    context.emitCommentDraftChange({});
    await flushDraftPersistence();

    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    await callbacks.onFinish();
    expect(context.dispatchClipResult).toHaveBeenCalledTimes(1);
    await flushDraftPersistence();
    expect(context.showSupportProgress).toHaveBeenCalledWith({
      value: 10,
      message: {
        key: 'supportProgressReaderPreparing',
        fallback: 'Preparing reader export'
      }
    });
    expect(context.showSupportProgress).toHaveBeenCalledWith({
      value: 24,
      message: {
        key: 'supportProgressReaderOrganizing',
        fallback: 'Organizing highlights'
      }
    });
    expect(context.showSupportProgress).toHaveBeenCalledWith({
      value: 32,
      message: {
        key: 'supportProgressReaderGenerating',
        fallback: 'Generating reader note'
      }
    });
    expect(context.showSupportProgress).toHaveBeenCalledWith({
      value: 36,
      message: {
        key: 'supportProgressReaderSending',
        fallback: 'Sending to Obsidian'
      }
    });
    expect(context.view.destroy).toHaveBeenCalledTimes(1);
    expect(isReaderSessionActive(document)).toBe(false);
    await expect(
      context.draftRepository.loadLatest('reader', 'https://example.com/article')
    ).resolves.toBeNull();
  });

  it('tracks exported reader sessions with canonical destination and duration bucket only', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T00:00:00.000Z'));

    const context = createSessionContext();
    await context.session.initialize();

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-export';
    wrapper.textContent = 'Export me';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-export',
        selectedHtml: '<mark>Export me</mark>',
        selectedText: 'Export me',
        comment: 'note',
        fragmentUrl: '#export',
        wrapper
      }
    ]);

    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }
    if (!callbacks.onSelectDestination) {
      throw new Error('destination callback missing');
    }

    await settleReaderMutation(Promise.resolve(callbacks.onSelectDestination('downloads')));
    vi.setSystemTime(new Date('2026-06-05T00:00:01.500Z'));
    await callbacks.onFinish();

    const exportedEvent = getTelemetryMessages(context).find(
      (message) => message.event === 'reader_exported'
    );
    expect(exportedEvent).toEqual({
      type: 'ANALYTICS_EVENT',
      event: 'reader_exported',
      params: {
        destination: 'downloads',
        duration_bucket: '1s_to_2s',
        highlight_count_bucket: 'one'
      }
    });
    expectCanonicalReaderTelemetry(getTelemetryMessages(context));
  });

  it('cleans up after cancel when exact-key draft removal fails after the terminal envelope is written', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-cancel-terminal';
    wrapper.textContent = 'Cancel me';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-cancel-terminal',
        selectedHtml: '<mark>Cancel me</mark>',
        selectedText: 'Cancel me',
        comment: 'pending note',
        fragmentUrl: '#cancel-terminal',
        wrapper
      }
    ]);
    context.emitCommentDraftChange({});
    await flushDraftPersistence();

    const { draftStorageKey: currentDraftKey, draftId: currentDraftId } = getDraftIdentity(
      context.session
    );
    if (!currentDraftKey || !currentDraftId) {
      throw new Error('expected an active current draft');
    }

    const passthroughRemove = context.storageLocal.remove.bind(context.storageLocal);
    vi.spyOn(context.storageLocal, 'remove').mockImplementation(async (value) => {
      if (removalCallIncludesKey(value, currentDraftKey)) {
        throw new Error('remove current exact key after terminal cancel failed');
      }
      return await passthroughRemove(value);
    });

    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    callbacks.onCancel();
    await vi.waitFor(() => {
      expect(context.view.destroy).toHaveBeenCalledTimes(1);
    });

    expect(isReaderSessionActive(document)).toBe(false);
    await expect(loadLatestReaderDraft(context)).resolves.toBeNull();
    await expect(listReaderDraftCandidates(context)).resolves.toEqual([]);
    expect(await readDraftIndex(context)).toMatchObject({
      entries: [expect.objectContaining({ draftId: currentDraftId, status: 'discarded' })]
    });
    await expect(readStoredReaderDraft(context, currentDraftKey)).resolves.toMatchObject({
      draftId: currentDraftId,
      status: 'discarded'
    });
  });

  it('keeps the session active and suppresses cancel analytics when terminal draft persistence fails', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-cancel-failure';
    wrapper.textContent = 'Cancel me';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-cancel-failure',
        selectedHtml: '<mark>Cancel me</mark>',
        selectedText: 'Cancel me',
        comment: 'pending note',
        fragmentUrl: '#cancel-failure',
        wrapper
      }
    ]);
    context.emitCommentDraftChange({});
    await flushDraftPersistence();
    context.messaging.send.mockClear();
    context.view.updateHint.mockClear();
    vi.spyOn(context.storageLocal, 'setMany').mockImplementationOnce(() =>
      Promise.reject(new Error('cancel terminal save failed'))
    );

    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    callbacks.onCancel();
    await vi.waitFor(() => {
      expect(context.view.updateHint).toHaveBeenCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    });

    expect(context.view.destroy).not.toHaveBeenCalled();
    expect(isReaderSessionActive(document)).toBe(true);
    expect(getReaderSession()).toBe(context.session);
    expect(getSessionHarness(context.session).__testHighlights).toHaveLength(1);
    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_session_cancelled')
    ).toBeUndefined();
    await expect(loadLatestReaderDraft(context)).resolves.toMatchObject({ status: 'active' });
  });

  it('preserves same-page other-owner drafts after cancel when the current exact-key cleanup fails', async () => {
    vi.useFakeTimers();
    const previousChrome = globalThis.chrome;
    const currentOwner: SessionDraftOwnerContext = { tabId: 11, windowId: 1, frameId: 0 };
    const otherOwner: SessionDraftOwnerContext = { tabId: 22, windowId: 2, frameId: 0 };
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        runtime: {
          sendMessage: vi.fn(
            (message: object | null, callback?: (response: TabContextProbeResponse) => void) => {
              if (isTabContextProbeMessage(message)) {
                callback?.({ success: true, active: true });
                return;
              }
              callback?.({ success: true, ...currentOwner });
            }
          )
        }
      }
    });
    configureSessionDraftRuntimeMessenger(async <TResult = unknown>() => {
      return { success: true, active: true, ...currentOwner } as TResult;
    });

    const context = createSessionContext();
    const pageUrl = 'https://example.com/article';
    const existing = buildReaderSessionDraftEnvelope({
      draftId: 'existing-draft',
      createdAt: 2_000_000_000_049,
      now: 2_000_000_000_050,
      pageUrl,
      pageTitle: 'Existing title',
      highlights: [
        createPersistedHighlightRecord({
          id: 'existing-highlight',
          selectedText: 'Existing highlight',
          selectedHtml: '<mark>Existing highlight</mark>',
          comment: 'existing note',
          fragmentUrl: '#existing-highlight',
          createdAt: 2_000_000_000_050
        })
      ],
      commentDrafts: {
        'existing-highlight': 'existing note'
      },
      status: 'active'
    });

    if (!existing) {
      throw new Error('expected existing reader draft envelope');
    }

    try {
      await context.draftRepository.save(existing, { ownerContext: otherOwner });
      await context.session.initialize();

      const content = document.getElementById('content');
      if (!content?.firstChild) {
        throw new Error('content node missing');
      }

      await settleReaderMutation(
        Promise.resolve(
          getSessionHarness(context.session).handleSelection(
            createSelectionPayload(content.firstChild)
          )
        )
      );

      const beforeCancel = await context.draftRepository.listCandidates(
        'reader',
        pageUrl,
        undefined,
        { ownerContext: null }
      );
      expect(beforeCancel).toHaveLength(2);

      const currentDraft = beforeCancel.find((candidate) => candidate.draftId !== 'existing-draft');
      if (!currentDraft) {
        throw new Error('expected a current draft before cancel');
      }

      const currentDraftKey = createSessionDraftStorageKey({
        mode: 'reader',
        pageKey: currentDraft.pageKey,
        draftId: currentDraft.draftId
      });
      const existingDraftKey = createSessionDraftStorageKey({
        mode: 'reader',
        pageKey: existing.pageKey,
        draftId: existing.draftId
      });
      const passthroughRemove = context.storageLocal.remove.bind(context.storageLocal);
      const removeSpy = vi
        .spyOn(context.storageLocal, 'remove')
        .mockImplementation(async (value) => {
          if (removalCallIncludesKey(value, currentDraftKey)) {
            throw new Error('keep current key to verify terminal suppression');
          }
          return await passthroughRemove(value);
        });

      const callbacks = context.getCallbacks();
      if (!callbacks) {
        throw new Error('panel callbacks missing');
      }

      callbacks.onCancel();
      await vi.waitFor(() => {
        expect(context.view.destroy).toHaveBeenCalledTimes(1);
      });

      const afterCancel = await context.draftRepository.listCandidates(
        'reader',
        pageUrl,
        undefined,
        { ownerContext: null }
      );
      expect(afterCancel).toHaveLength(1);
      expect(afterCancel[0]?.draftId).toBe('existing-draft');
      await expect(
        context.draftRepository.loadLatest('reader', pageUrl, undefined, { ownerContext: null })
      ).resolves.toMatchObject({
        draftId: 'existing-draft'
      });
      const draftIndex = await readDraftIndex(context);
      if (!draftIndex) {
        throw new Error('Expected session draft index');
      }
      expect(draftIndex.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ draftId: 'existing-draft', status: 'active' }),
          expect.objectContaining({ draftId: currentDraft.draftId, status: 'discarded' })
        ])
      );
      await expect(readStoredReaderDraft(context, currentDraftKey)).resolves.toMatchObject({
        draftId: currentDraft.draftId,
        status: 'discarded'
      });
      expect(
        removeSpy.mock.calls.filter(([value]) => removalCallIncludesKey(value, currentDraftKey))
      ).toHaveLength(1);
      expect(
        removeSpy.mock.calls.filter(([value]) => removalCallIncludesKey(value, existingDraftKey))
      ).toHaveLength(0);
    } finally {
      configureSessionDraftRuntimeMessenger(null);
      if (previousChrome === undefined) {
        Reflect.deleteProperty(globalThis, 'chrome');
      } else {
        Object.defineProperty(globalThis, 'chrome', {
          configurable: true,
          value: previousChrome
        });
      }
      vi.useRealTimers();
    }
  });

  it('keeps the session active when pending draft flush fails before cancel terminalization', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-cancel-flush-failure';
    wrapper.textContent = 'Cancel me';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-cancel-flush-failure',
        selectedHtml: '<mark>Cancel me</mark>',
        selectedText: 'Cancel me',
        comment: 'persisted note',
        fragmentUrl: '#cancel-flush-failure',
        wrapper
      }
    ]);
    context.emitCommentDraftChange({});
    await flushDraftPersistence();

    const { draftId: currentDraftId } = getDraftIdentity(context.session);
    if (!currentDraftId) {
      throw new Error('expected an active current draft');
    }

    context.emitCommentDraftChange({
      'h-cancel-flush-failure': 'pending unsaved comment'
    });
    context.messaging.send.mockClear();
    context.view.updateHint.mockClear();
    const setManySpy = vi
      .spyOn(context.storageLocal, 'setMany')
      .mockImplementationOnce(() => Promise.reject(new Error('cancel pending flush failed')));

    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    callbacks.onCancel();
    await vi.waitFor(() => {
      expect(context.view.updateHint).toHaveBeenCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    });

    expect(context.view.destroy).not.toHaveBeenCalled();
    expect(isReaderSessionActive(document)).toBe(true);
    expect(getReaderSession()).toBe(context.session);
    expect(context.view.currentDrafts).toEqual({
      'h-cancel-flush-failure': 'pending unsaved comment'
    });
    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_session_cancelled')
    ).toBeUndefined();
    expect(setManySpy).toHaveBeenCalledTimes(1);
    await expect(loadLatestReaderDraft(context)).resolves.toMatchObject({
      draftId: currentDraftId,
      status: 'active'
    });
  });

  it('cleans up after export when exact-key draft removal fails after the terminal envelope is written', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-export-terminal';
    wrapper.textContent = 'Export me';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-export-terminal',
        selectedHtml: '<mark>Export me</mark>',
        selectedText: 'Export me',
        comment: 'pending note',
        fragmentUrl: '#export-terminal',
        wrapper
      }
    ]);
    context.emitCommentDraftChange({});
    await flushDraftPersistence();

    const { draftStorageKey: currentDraftKey, draftId: currentDraftId } = getDraftIdentity(
      context.session
    );
    if (!currentDraftKey || !currentDraftId) {
      throw new Error('expected an active current draft');
    }

    const passthroughRemove = context.storageLocal.remove.bind(context.storageLocal);
    vi.spyOn(context.storageLocal, 'remove').mockImplementation(async (value) => {
      if (removalCallIncludesKey(value, currentDraftKey)) {
        throw new Error('remove current exact key after terminal export failed');
      }
      return await passthroughRemove(value);
    });

    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    await callbacks.onFinish();

    expect(context.dispatchClipResult).toHaveBeenCalledTimes(1);
    expect(context.view.destroy).toHaveBeenCalledTimes(1);
    expect(isReaderSessionActive(document)).toBe(false);
    await expect(loadLatestReaderDraft(context)).resolves.toBeNull();
    await expect(listReaderDraftCandidates(context)).resolves.toEqual([]);
    expect(await readDraftIndex(context)).toMatchObject({
      entries: [expect.objectContaining({ draftId: currentDraftId, status: 'exported' })]
    });
    await expect(readStoredReaderDraft(context, currentDraftKey)).resolves.toMatchObject({
      draftId: currentDraftId,
      status: 'exported'
    });
  });

  it('keeps the session active and suppresses export success analytics when terminal draft persistence fails', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-export-failure';
    wrapper.textContent = 'Export me';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-export-failure',
        selectedHtml: '<mark>Export me</mark>',
        selectedText: 'Export me',
        comment: 'pending note',
        fragmentUrl: '#export-failure',
        wrapper
      }
    ]);
    context.emitCommentDraftChange({});
    await flushDraftPersistence();
    context.messaging.send.mockClear();
    context.view.updateHint.mockClear();
    vi.spyOn(context.storageLocal, 'setMany').mockImplementationOnce(() =>
      Promise.reject(new Error('export terminal save failed'))
    );

    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    await callbacks.onFinish();

    expect(context.dispatchClipResult).toHaveBeenCalledTimes(1);
    expect(context.view.destroy).not.toHaveBeenCalled();
    expect(isReaderSessionActive(document)).toBe(true);
    expect(getSessionHarness(context.session).__testHighlights).toHaveLength(1);
    expect(context.view.updateHint).toHaveBeenCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_exported')
    ).toBeUndefined();
    await expect(loadLatestReaderDraft(context)).resolves.toMatchObject({ status: 'active' });
  });

  it('keeps the session active when pending draft flush fails after export dispatch succeeds', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-export-flush-failure';
    wrapper.textContent = 'Export me';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-export-flush-failure',
        selectedHtml: '<mark>Export me</mark>',
        selectedText: 'Export me',
        comment: 'persisted note',
        fragmentUrl: '#export-flush-failure',
        wrapper
      }
    ]);
    context.emitCommentDraftChange({});
    await flushDraftPersistence();

    const { draftId: currentDraftId } = getDraftIdentity(context.session);
    if (!currentDraftId) {
      throw new Error('expected an active current draft');
    }

    context.emitCommentDraftChange({
      'h-export-flush-failure': 'pending unsaved comment'
    });
    context.messaging.send.mockClear();
    context.view.updateHint.mockClear();
    const setManySpy = vi
      .spyOn(context.storageLocal, 'setMany')
      .mockImplementationOnce(() => Promise.reject(new Error('export pending flush failed')));

    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    await callbacks.onFinish();

    expect(context.dispatchClipResult).toHaveBeenCalledTimes(1);
    expect(context.view.destroy).not.toHaveBeenCalled();
    expect(isReaderSessionActive(document)).toBe(true);
    expect(context.view.currentDrafts).toEqual({
      'h-export-flush-failure': 'pending unsaved comment'
    });
    expect(context.view.updateHint).toHaveBeenCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    expect(context.showSupportProgress).toHaveBeenCalledWith({
      value: 100,
      variant: 'failure'
    });
    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_exported')
    ).toBeUndefined();
    expect(setManySpy).toHaveBeenCalledTimes(1);
    await expect(loadLatestReaderDraft(context)).resolves.toMatchObject({
      draftId: currentDraftId,
      status: 'active'
    });
  });

  it.each([
    {
      name: 'permission-denied export surfaces',
      rejection: new Error('permission denied'),
      expectedCategory: 'permission'
    },
    {
      name: 'message timeout failures',
      rejection: new DOMException('timed out', 'AbortError'),
      expectedCategory: 'timeout'
    },
    {
      name: 'extraction app errors',
      rejection: {
        code: 'EXTRACTION_CONTENT_NO_MARKDOWN',
        domain: 'extraction',
        message: 'EXTRACTION_CONTENT_NO_MARKDOWN',
        severity: 'error',
        recoverable: false
      },
      expectedCategory: 'extraction'
    },
    {
      name: 'unknown failures stay unknown',
      rejection: new Error('boom'),
      expectedCategory: 'unknown'
    }
  ])(
    'tracks failed exports for $name without swallowing the existing failure behavior',
    async ({ rejection, expectedCategory }) => {
      vi.useFakeTimers();
      const context = createSessionContext();
      await context.session.initialize();
      context.dispatchClipResult.mockRejectedValueOnce(rejection);

      const wrapper = document.createElement('mark');
      wrapper.className = 'aiob-reader-highlight';
      wrapper.dataset.readerHighlightId = 'h-fail';
      wrapper.textContent = 'Export me';
      document.body.appendChild(wrapper);
      getSessionHarness(context.session).__setTestHighlights([
        {
          id: 'h-fail',
          selectedHtml: '<mark>Export me</mark>',
          selectedText: 'Export me',
          comment: 'note',
          fragmentUrl: '#export',
          wrapper
        }
      ]);

      const callbacks = context.getCallbacks();
      if (!callbacks) {
        throw new Error('panel callbacks missing');
      }
      if (!callbacks.onSelectDestination) {
        throw new Error('destination callback missing');
      }

      await settleReaderMutation(Promise.resolve(callbacks.onSelectDestination('downloads')));
      const { draftStorageKey: currentDraftKey, draftId: currentDraftId } = getDraftIdentity(
        context.session
      );
      if (!currentDraftKey || !currentDraftId) {
        throw new Error('expected an active current draft');
      }
      await callbacks.onFinish();

      const failedEvent = getTelemetryMessages(context).find(
        (message) => message.event === 'reader_export_failed'
      );
      expect(failedEvent).toEqual({
        type: 'ANALYTICS_EVENT',
        event: 'reader_export_failed',
        params: {
          destination: 'downloads',
          failure_category: expectedCategory
        }
      });
      expect(context.view.updateHint).toHaveBeenLastCalledWith(
        DEFAULT_SESSION_MESSAGES.hintFailure
      );
      expect(context.view.destroy).not.toHaveBeenCalled();
      expect(isReaderSessionActive(document)).toBe(true);
      await expect(loadLatestReaderDraft(context)).resolves.toMatchObject({
        status: 'active'
      });
      await expect(listReaderDraftCandidates(context)).resolves.toEqual([
        expect.objectContaining({ draftId: currentDraftId, status: 'active' })
      ]);
      await expect(readStoredReaderDraft(context, currentDraftKey)).resolves.toMatchObject({
        draftId: currentDraftId,
        status: 'active'
      });
      expectCanonicalReaderTelemetry(getTelemetryMessages(context));
    }
  );

  it('does not emit reader draft restore telemetry when no draft candidate exists', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();

    await context.session.initialize();

    expect(
      getTelemetryMessages(context).find((message) => message.event === 'reader_draft_restored')
    ).toBeUndefined();
  });

  it('does not let reader draft restore analytics failures block hydration', async () => {
    vi.useFakeTimers();
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.setSystemTime(new Date('2026-06-05T00:00:00.000Z'));
    const context = createSessionContext();
    const now = Date.now();
    const envelope = buildReaderSessionDraftEnvelope({
      draftId: 'reader-draft-analytics',
      createdAt: now - 10,
      now,
      pageUrl: 'https://example.com/article',
      pageTitle: 'Restored article',
      destination: { kind: 'downloads' },
      highlights: [
        createPersistedHighlightRecord({
          id: 'saved-1',
          selectedText: 'Hello reader session world.',
          selectedHtml: '<mark>Hello reader session world.</mark>',
          comment: 'remember this',
          fragmentUrl: '#saved-1',
          createdAt: 15
        })
      ],
      commentDrafts: {},
      status: 'restorable'
    });
    if (!envelope) {
      throw new Error('expected analytics restore envelope');
    }
    await context.draftRepository.save(envelope);
    context.messaging.send.mockRejectedValueOnce(new Error('analytics down'));

    await context.session.initialize();

    expect(context.messaging.send.mock.calls[0]?.[0]).toMatchObject({
      event: 'reader_draft_restored'
    });
    expect(getSessionHarness(context.session).__testHighlights).toEqual([
      expect.objectContaining({
        id: 'saved-1',
        selectedText: 'Hello reader session world.',
        comment: 'remember this',
        createdAt: 15
      })
    ]);
    expect(debugSpy).toHaveBeenCalledWith(
      '[ReaderSession] Failed to send analytics event:',
      expect.any(Error)
    );
    debugSpy.mockRestore();
  });

  it('does not let analytics send failures block export cleanup', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const context = createSessionContext();
    context.messaging.send.mockRejectedValue(new Error('analytics down'));

    await context.session.initialize();

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-export';
    wrapper.textContent = 'Export me';
    document.body.appendChild(wrapper);
    getSessionHarness(context.session).__setTestHighlights([
      {
        id: 'h-export',
        selectedHtml: '<mark>Export me</mark>',
        selectedText: 'Export me',
        comment: 'note',
        fragmentUrl: '#export',
        wrapper
      }
    ]);

    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    await callbacks.onFinish();

    expect(context.dispatchClipResult).toHaveBeenCalledTimes(1);
    expect(context.view.destroy).toHaveBeenCalledTimes(1);
    expect(isReaderSessionActive(document)).toBe(false);
    expect(debugSpy).toHaveBeenCalled();
    debugSpy.mockRestore();
  });

  it('tracks cancellation with canonical duration bucket only', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T00:00:00.000Z'));

    const context = createSessionContext();
    await context.session.initialize();
    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }
    await settleReaderMutation(
      getSessionHarness(context.session).handleSelection(createSelectionPayload(content.firstChild))
    );

    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    vi.setSystemTime(new Date('2026-06-05T00:00:35.000Z'));
    callbacks.onCancel();
    await vi.waitFor(() => {
      expect(context.view.destroy).toHaveBeenCalledTimes(1);
    });

    const cancelledEvent = getTelemetryMessages(context).find(
      (message) => message.event === 'reader_session_cancelled'
    );
    expect(cancelledEvent).toEqual({
      type: 'ANALYTICS_EVENT',
      event: 'reader_session_cancelled',
      params: {
        duration_bucket: '30s_to_119s'
      }
    });
    await vi.waitFor(async () => {
      expect(
        await context.draftRepository.loadLatest('reader', 'https://example.com/article')
      ).toBeNull();
    });
    expectCanonicalReaderTelemetry(getTelemetryMessages(context));
  });

  it('does not create a durable reader draft when the session stays empty', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const callbacks = context.getCallbacks();
    if (!callbacks?.onSelectDestination) {
      throw new Error('destination callback missing');
    }

    await settleReaderMutation(Promise.resolve(callbacks.onSelectDestination('downloads')));

    await expect(
      context.draftRepository.loadLatest('reader', 'https://example.com/article')
    ).resolves.toBeNull();
  });

  it('never sends raw reader content or off-catalog params in telemetry payloads', async () => {
    vi.useFakeTimers();
    document.title = 'Private Title';
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!(content?.firstChild instanceof Text)) {
      throw new Error('content node missing');
    }
    content.firstChild.textContent = 'Private Quote';

    await settleReaderMutation(
      getSessionHarness(context.session).handleSelection({
        ...createSelectionPayload(content.firstChild),
        selectedHtml: '<mark>Private Quote</mark>',
        selectedText: 'Private Quote'
      })
    );
    const [restoredHighlight] = getSessionHarness(context.session).__testHighlights;
    if (!restoredHighlight) {
      throw new Error('reader highlight missing');
    }
    context.emitCommentDraftChange({
      [restoredHighlight.id]: 'Private Draft'
    });
    await flushDraftPersistence();

    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }
    if (!callbacks.onSelectDestination) {
      throw new Error('destination callback missing');
    }

    await settleReaderMutation(Promise.resolve(callbacks.onSelectDestination('downloads')));
    await callbacks.onFinish();

    const telemetryMessages = getTelemetryMessages(context);
    const serialized = JSON.stringify(telemetryMessages);

    expect(serialized).not.toContain('Private Quote');
    expect(serialized).not.toContain('Private Draft');
    expect(serialized).not.toContain('<mark>Private Quote</mark>');
    expect(serialized).not.toContain('https://example.com/article');
    expect(serialized).not.toContain('Private Title');
    expect(serialized).not.toContain('reader_session_exported');
    expect(serialized).not.toContain('reader_session_failed');
    expect(serialized).not.toContain('entry_point');
    expect(serialized).not.toContain('export_mode');
    expect(serialized).not.toContain('export_destination');
    expect(serialized).not.toContain('duration_ms');
    expect(serialized).not.toContain('outcome');
    expectCanonicalReaderTelemetry(telemetryMessages);
  });
});
