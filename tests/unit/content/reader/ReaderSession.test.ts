/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import '../../../setup/globalSetup';
import type { ClipPromptGateway } from '@content/clipper/application/clipPromptGateway';
import { DEFAULT_FRAGMENT_CONFIG } from '@content/clipper/services/fragmentConfig';
import type {
  ReaderPanelCallbacks,
  ReaderPanelHighlight,
  ReaderPanelTexts
} from '@content/reader/application/readerPanelModel';
import type { ReaderSessionView } from '@content/reader/application/readerSessionView';
import { ReaderPanelCoordinator } from '@content/reader/panelCoordinator';
import { ReaderSession } from '@content/reader/session';
import type { ReaderSessionDependencies } from '@content/reader/session';
import { ReaderSessionLifecycle } from '@content/reader/sessionLifecycle';
import { DEFAULT_SESSION_MESSAGES } from '@content/reader/sessionMessages';
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
  stopEditing: Mock<(...args: []) => void>;
  isEditing: Mock<(...args: []) => boolean>;
  destroy: Mock<(...args: []) => void>;
};

function createView(): TestView {
  return {
    element: document.createElement('div'),
    updateCount: vi.fn(),
    updateHint: vi.fn(),
    updateTexts: vi.fn(),
    updateDestination: vi.fn(),
    setHighlights: vi.fn(),
    stopEditing: vi.fn(),
    isEditing: vi.fn(() => false),
    destroy: vi.fn()
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

function createSessionContext() {
  document.body.innerHTML = '<article><p id="content">Hello reader session world.</p></article>';
  const view = createView();
  let callbacks: ReaderPanelCallbacks | undefined;
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
      createView: vi.fn<ReaderSessionDependencies['viewFactory']['createView']>((nextCallbacks) => {
        callbacks = nextCallbacks;
        return view;
      })
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
      sync: {
        get: vi.fn(),
        set: vi.fn(),
        getMany: vi.fn(),
        setMany: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
        watchKey: vi.fn(() => () => undefined),
        watchAll: vi.fn(() => () => undefined)
      },
      local: {
        get: vi.fn(),
        set: vi.fn(),
        getMany: vi.fn(),
        setMany: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
        watchKey: vi.fn(() => () => undefined),
        watchAll: vi.fn(() => () => undefined)
      }
    },
    messaging: {
      send: vi.fn()
    },
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
    clipPrompt,
    environment,
    highlightManager,
    readerRepository: {
      ...dependencies.readerRepository,
      getReadingConfig
    },
    dispatchClipResult,
    showSupportProgress,
    getCallbacks: () => callbacks,
    emitReadingConfig: readerConfigListener
  };
}

describe('ReaderSession', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-aiob-reader-active');
    document.body.removeAttribute('data-aiobReaderHighlight');
    document.body.removeAttribute('data-aiobReaderHighlightTheme');
    __resetContentSessionRegistryForTests(document);
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

    void callbacks.onFinish();
    await vi.waitFor(() => {
      expect(context.dispatchClipResult).toHaveBeenCalledTimes(1);
    });
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
  });
});
