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
import {
  __resetContentSessionRegistryForTests,
  getReaderSession,
  isReaderSessionActive,
  registerReaderSession
} from '@content/runtime/contentSessionRegistry';
import { createSessionDraftRepository } from '@content/sessionDrafts';
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
  }>;
  handleSelection(payload: unknown): void | Promise<void>;
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
  'outcome',
  'selectedText',
  'selectedHtml',
  'comment',
  'fragmentUrl',
  'url',
  'title',
  'markdown'
]);

type TelemetryMessage = {
  type: 'TRACK_USAGE_EVENT';
  event: string;
  params?: Record<string, unknown>;
};

function getTelemetryMessages(context: { messaging: { send: Mock } }): TelemetryMessage[] {
  return context.messaging.send.mock.calls.flatMap(([message]) => {
    if (typeof message !== 'object' || message === null) {
      return [];
    }
    const candidate = message as { type?: unknown; event?: unknown; params?: unknown };
    if (candidate.type !== 'TRACK_USAGE_EVENT' || typeof candidate.event !== 'string') {
      return [];
    }
    return [
      {
        type: 'TRACK_USAGE_EVENT',
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
  const readerConfigListener = vi.fn();
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
      onConfigChange: vi.fn((listener) => {
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

async function flushDraftPersistence(): Promise<void> {
  await vi.advanceTimersByTimeAsync(250);
  await Promise.resolve();
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
    expect((context.session as { __testHighlights: unknown[] }).__testHighlights).toEqual([]);
  });

  it('tracks session start with the unknown source fallback', async () => {
    const context = createSessionContext();

    await context.session.initialize();

    expect(getTelemetryMessages(context)).toEqual([
      {
        type: 'TRACK_USAGE_EVENT',
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

    expect(
      (context.session as unknown as { __testHighlights: ReaderHighlightRecord[] }).__testHighlights
    ).toEqual([
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

    expect(
      (context.session as unknown as { __testHighlights: ReaderHighlightRecord[] }).__testHighlights
    ).toEqual([
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

    await expect(
      context.draftRepository.loadLatest('reader', 'https://example.com/article')
    ).resolves.toMatchObject({
      draftId: 'reader-draft-1',
      status: 'active',
      payload: expect.objectContaining({
        destination: { kind: 'vault', vaultId: 'research' },
        commentDrafts: {
          'saved-1': 'unsaved note'
        },
        highlights: expect.arrayContaining([
          expect.objectContaining({
            id: 'saved-1',
            selectedText: 'Hello reader session world.',
            comment: 'remember this'
          }),
          expect.objectContaining({
            selectedText: 'reader session',
            comment: 'fresh note'
          })
        ])
      })
    });
  });

  it('flushes a restorable reader draft on pagehide after prior mutation-time saves', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }

    await (
      context.session as unknown as { handleSelection(payload: unknown): Promise<void> }
    ).handleSelection(createSelectionPayload(content.firstChild));
    await flushDraftPersistence();

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

    expect(context.environment.stop).toHaveBeenCalledTimes(1);
    expect(context.view.destroy).toHaveBeenCalledTimes(1);
    expect(isReaderSessionActive(document)).toBe(false);
    expect(getReaderSession()).toBeNull();
    expect(document.documentElement.dataset.aiobReaderActive).toBeUndefined();
    expect(document.body.dataset.aiobReaderHighlight).toBeUndefined();
  });

  it('panel callbacks delegate to finish, cancel, delete, edit, and focus flows', async () => {
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
    (
      context.session as {
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
      }
    ).__setTestHighlights([
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

    void callbacks.onSubmitHighlightEdit('h-1', '  updated memo  ');
    expect(context.view.stopEditing).toHaveBeenCalled();
    expect(context.view.updateHint).toHaveBeenLastCalledWith(DEFAULT_SESSION_MESSAGES.panel.hint);

    callbacks.onDeleteHighlight('h-1');
    expect((context.session as { __testHighlights: unknown[] }).__testHighlights).toEqual([]);
    expect(context.view.updateHint).toHaveBeenLastCalledWith(
      DEFAULT_SESSION_MESSAGES.hintNoHighlights
    );

    callbacks.onCancel();
    expect(context.view.destroy).toHaveBeenCalled();
  });

  it('captures selection directly inside reader mode without opening the clipper prompt', async () => {
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }
    await (
      context.session as unknown as { handleSelection(payload: unknown): Promise<void> }
    ).handleSelection(createSelectionPayload(content.firstChild));

    const highlights = (
      context.session as {
        __testHighlights: Array<{ comment: string; selectedText: string }>;
      }
    ).__testHighlights;
    expect(highlights).toHaveLength(1);
    expect(highlights[0]?.comment).toBe('');
    expect(highlights[0]?.selectedText).toContain('Hello reader session world.');
    expect(context.clipPrompt.requestSelectionAction).not.toHaveBeenCalled();
    expect(context.view.updateCount).toHaveBeenLastCalledWith(1);
    expect(context.view.setHighlights).toHaveBeenCalled();
  });

  it('keeps selection draft persistence and current telemetry behavior before P04', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }

    await getSessionHarness(context.session).handleSelection(
      createSelectionPayload(content.firstChild)
    );
    await flushDraftPersistence();

    await expect(
      context.draftRepository.loadLatest('reader', 'https://example.com/article')
    ).resolves.toMatchObject({
      status: 'active',
      payload: expect.objectContaining({
        highlights: [
          expect.objectContaining({
            selectedText: 'Hello reader session world.',
            comment: ''
          })
        ]
      })
    });

    const highlightEvent = getTelemetryMessages(context).find(
      (message) => message.event === 'reader_highlight_added'
    );
    expect(highlightEvent).toEqual({
      type: 'TRACK_USAGE_EVENT',
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
    expect(getDraftIdentity(context.session)).toEqual({
      draftId: expect.any(String),
      draftCreatedAt: expect.any(Number),
      draftStorageKey: expect.any(String)
    });
  });

  it('serializes durable reader mutations and ignores new selections while saving is in flight', async () => {
    const context = createSessionContext();
    await context.session.initialize();

    const firstSave = createDeferred<void>();
    const events: string[] = [];

    const firstRun = getSessionHarness(context.session).runDraftMutation({
      apply: () => {
        events.push('first:apply');
        return 'first-result' as const;
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
        return 'second-result' as const;
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

  it('tracks highlight additions with canonical bucket params only', async () => {
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }

    await (
      context.session as unknown as { handleSelection(payload: unknown): Promise<void> }
    ).handleSelection(createSelectionPayload(content.firstChild));

    const highlightEvent = getTelemetryMessages(context).find(
      (message) => message.event === 'reader_highlight_added'
    );
    expect(highlightEvent).toEqual({
      type: 'TRACK_USAGE_EVENT',
      event: 'reader_highlight_added',
      params: {
        selection_length_bucket: 'twenty_one_to_fifty',
        highlight_count_bucket: 'one'
      }
    });
    expectCanonicalReaderTelemetry(getTelemetryMessages(context));
  });

  it('keeps typed comment drafts visible, applies a failure hint, and preserves draft identity when autosave rejects', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();

    const content = document.getElementById('content');
    if (!content?.firstChild) {
      throw new Error('content node missing');
    }

    await getSessionHarness(context.session).handleSelection(
      createSelectionPayload(content.firstChild)
    );
    await flushDraftPersistence();

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

    await getSessionHarness(context.session).handleSelection(
      createSelectionPayload(content.firstChild)
    );
    await flushDraftPersistence();

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
    await (
      context.session as unknown as { handleSelection(payload: unknown): Promise<void> }
    ).handleSelection(createSelectionPayload(content.firstChild));
    expect(context.view.updateHint).toHaveBeenCalledWith(
      DEFAULT_SESSION_MESSAGES.hintSelectionFailure
    );
    errorSpy.mockRestore();
  });

  it('ingests external highlights and clears selection', () => {
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

    const highlights = (
      context.session as {
        __testHighlights: Array<{ selectedText: string; comment: string }>;
      }
    ).__testHighlights;
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
    (
      context.session as {
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
      }
    ).__setTestHighlights([
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
      label: '正在准备阅读导出'
    });
    expect(context.showSupportProgress).toHaveBeenCalledWith({
      value: 24,
      label: '正在整理阅读标注'
    });
    expect(context.showSupportProgress).toHaveBeenCalledWith({
      value: 32,
      label: '正在生成阅读笔记'
    });
    expect(context.showSupportProgress).toHaveBeenCalledWith({
      value: 36,
      label: '正在发送到 Obsidian'
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
    (
      context.session as {
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
      }
    ).__setTestHighlights([
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

    await callbacks.onSelectDestination('downloads');
    vi.setSystemTime(new Date('2026-06-05T00:00:01.500Z'));
    await callbacks.onFinish();

    const exportedEvent = getTelemetryMessages(context).find(
      (message) => message.event === 'reader_exported'
    );
    expect(exportedEvent).toEqual({
      type: 'TRACK_USAGE_EVENT',
      event: 'reader_exported',
      params: {
        destination: 'downloads',
        duration_bucket: '1s_to_2s'
      }
    });
    expectCanonicalReaderTelemetry(getTelemetryMessages(context));
  });

  it('tracks failed exports without swallowing the existing failure behavior', async () => {
    vi.useFakeTimers();
    const context = createSessionContext();
    await context.session.initialize();
    context.dispatchClipResult.mockRejectedValueOnce(new Error('boom'));

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.dataset.readerHighlightId = 'h-fail';
    wrapper.textContent = 'Export me';
    document.body.appendChild(wrapper);
    (
      context.session as {
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
      }
    ).__setTestHighlights([
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

    await callbacks.onSelectDestination('downloads');
    await flushDraftPersistence();
    await callbacks.onFinish();

    const failedEvent = getTelemetryMessages(context).find(
      (message) => message.event === 'reader_export_failed'
    );
    expect(failedEvent).toEqual({
      type: 'TRACK_USAGE_EVENT',
      event: 'reader_export_failed',
      params: {
        destination: 'downloads',
        failure_category: 'unknown'
      }
    });
    expect(context.view.updateHint).toHaveBeenLastCalledWith(DEFAULT_SESSION_MESSAGES.hintFailure);
    expect(context.view.destroy).not.toHaveBeenCalled();
    expect(isReaderSessionActive(document)).toBe(true);
    await expect(
      context.draftRepository.loadLatest('reader', 'https://example.com/article')
    ).resolves.toMatchObject({
      status: 'active'
    });
    expectCanonicalReaderTelemetry(getTelemetryMessages(context));
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
    (
      context.session as {
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
      }
    ).__setTestHighlights([
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
    await (
      context.session as unknown as { handleSelection(payload: unknown): Promise<void> }
    ).handleSelection(createSelectionPayload(content.firstChild));
    await flushDraftPersistence();

    const callbacks = context.getCallbacks();
    if (!callbacks) {
      throw new Error('panel callbacks missing');
    }

    vi.setSystemTime(new Date('2026-06-05T00:00:35.000Z'));
    callbacks.onCancel();
    await Promise.resolve();
    await Promise.resolve();

    const cancelledEvent = getTelemetryMessages(context).find(
      (message) => message.event === 'reader_session_cancelled'
    );
    expect(cancelledEvent).toEqual({
      type: 'TRACK_USAGE_EVENT',
      event: 'reader_session_cancelled',
      params: {
        duration_bucket: '30s_to_119s'
      }
    });
    expect(context.view.destroy).toHaveBeenCalledTimes(1);
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

    await callbacks.onSelectDestination('downloads');
    await flushDraftPersistence();

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

    await (
      context.session as unknown as { handleSelection(payload: unknown): Promise<void> }
    ).handleSelection({
      ...createSelectionPayload(content.firstChild),
      selectedHtml: '<mark>Private Quote</mark>',
      selectedText: 'Private Quote'
    });
    const [restoredHighlight] = (context.session as { __testHighlights: Array<{ id: string }> })
      .__testHighlights;
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

    await callbacks.onSelectDestination('downloads');
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
