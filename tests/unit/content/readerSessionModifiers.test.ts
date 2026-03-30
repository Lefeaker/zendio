/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { testPlatformHarness } from '../../setup/globalSetup';
import type { TestPlatformHarness } from '../../utils/platformTestHarness';
import { DEFAULT_FRAGMENT_CONFIG } from '@content/clipper/services/fragmentConfig';
import { ReaderPanelCoordinator } from '@content/reader/panelCoordinator';
import { ReaderSession } from '@content/reader/session';
import { DEFAULT_SESSION_MESSAGES } from '@content/reader/sessionMessages';
import { ReaderSessionExporter } from '@content/reader/services/exporter';
import { ReaderHighlightManager } from '@content/reader/services/highlightManager';
import { ReaderSelectionController } from '@content/reader/services/selectionController';
import type { ReaderSessionDependencies } from '@content/reader/session';
import { ReaderSessionLifecycle } from '@content/reader/sessionLifecycle';
import {
  buildReaderFullMarkdown,
  buildReaderHighlightsMarkdown
} from '@content/reader/utils/markdownBuilder';
import { __resetContentSessionRegistryForTests } from '@content/runtime/contentSessionRegistry';
import type { FragmentClipperOptions } from '@shared/types/options';

const promptMock = vi.hoisted(() => vi.fn());
const platformHarness: TestPlatformHarness = testPlatformHarness;

vi.mock('../../../src/content/clipper/shared/styleManager', () => ({
  InlineStyleManager: vi.fn().mockImplementation(() => ({
    mount: vi.fn(),
    unmount: vi.fn()
  }))
}));

const loadClipperStyleMock = vi.hoisted(() =>
  vi.fn<[], Promise<string>>(() => Promise.resolve('/* reader styles */'))
);

vi.mock('../../../src/content/clipper/shared/styleRegistry', () => ({
  loadClipperStyle: loadClipperStyleMock,
  clearClipperStyleCache: vi.fn()
}));

const readerMessages = vi.hoisted(() => ({
  readerPanelTitle: 'title',
  readerPanelStatus: 'status',
  readerPanelHint: 'hint',
  readerPanelFinish: 'finish',
  readerPanelCancel: 'cancel',
  readerPanelCounter: 'counter {count}',
  readerPanelCounterZero: 'counter zero',
  readerHighlightEditLabel: 'edit',
  readerHighlightDeleteLabel: 'delete',
  readerHighlightNoComment: 'no comment',
  readerHighlightSaveLabel: 'save',
  readerHighlightCancelLabel: 'cancel',
  readerHighlightEditPlaceholder: 'placeholder',
  readerHighlightFocusLabel: 'focus {index}',
  readerHintNoHighlights: 'no highlights',
  readerHintExporting: 'exporting',
  readerHintFailure: 'failure',
  readerHintSelectionFailure: 'selection failure'
}));

const ensureContentI18nMock = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      registerDynamic: vi.fn()
    })
  )
);
const getContentI18nResourceMock = vi.hoisted(() =>
  vi.fn(() => ({
    messages: readerMessages
  }))
);
const getContentMessagesMock = vi.hoisted(() => vi.fn().mockResolvedValue(readerMessages));

vi.mock('../../../src/content/i18n/context', () => ({
  ensureContentI18n: ensureContentI18nMock,
  getContentI18nResource: getContentI18nResourceMock,
  getContentMessages: getContentMessagesMock
}));

vi.mock('../../../src/content/clipper/services/fragmentConfig', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/content/clipper/services/fragmentConfig')
  >('../../src/content/clipper/services/fragmentConfig');
  return {
    ...actual,
    loadFragmentConfig: vi.fn()
  };
});

describe('ReaderSession selection modifiers', () => {
  beforeEach(async () => {
    promptMock.mockReset();
    promptMock.mockResolvedValue({ action: 'clip', comment: '' });
    ensureContentI18nMock.mockClear();
    getContentI18nResourceMock.mockClear();
    getContentMessagesMock.mockClear();
    await platformHarness.storage.sync.clear();
    await platformHarness.storage.sync.set('options', {});
    __resetContentSessionRegistryForTests(document);
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    __resetContentSessionRegistryForTests(document);
  });

  async function createSessionWithConfig(config: Partial<FragmentClipperOptions>) {
    const dependencies: ReaderSessionDependencies = {
      viewFactory: {
        createView: vi.fn(() => ({
          element: document.createElement('div'),
          updateCount: vi.fn(),
          setHighlights: vi.fn(),
          updateHint: vi.fn(),
          updateTexts: vi.fn(),
          stopEditing: vi.fn(),
          isEditing: vi.fn(() => false),
          destroy: vi.fn()
        }))
      },
      optionsRepository: {
        get: vi.fn(),
        set: vi.fn(),
        onChange: vi.fn(() => () => undefined)
      },
      storage: platformHarness.storage as never,
      messaging: {
        send: vi.fn()
      },
      readerRepository: {
        getReadingConfig: vi.fn().mockResolvedValue({
          exportMode: 'highlights',
          highlightTheme: 'gradient'
        }),
        sendReadingClip: vi.fn(),
        onConfigChange: vi.fn(() => () => undefined)
      },
      createHighlightManager: (doc) => new ReaderHighlightManager(doc),
      createSelectionController: (options) => new ReaderSelectionController(options),
      createPanelCoordinator: (options) => new ReaderPanelCoordinator(options),
      createEnvironmentController: (_deps, handlers) =>
        ({
          start: vi.fn(async () => {
            const fragmentConfig = {
              ...DEFAULT_FRAGMENT_CONFIG,
              ...config
            };
            handlers.onMessagesUpdate(DEFAULT_SESSION_MESSAGES);
            handlers.onFragmentConfigUpdate(fragmentConfig);
            return {
              controller: null,
              messages: DEFAULT_SESSION_MESSAGES,
              fragmentConfig
            };
          }),
          stop: vi.fn()
        }) as never,
      createLifecycle: (deps, handlers) => new ReaderSessionLifecycle(deps, handlers),
      exporter: new ReaderSessionExporter({
        buildHighlightsMarkdown: buildReaderHighlightsMarkdown,
        buildFullMarkdown: buildReaderFullMarkdown
      }),
      dispatchClipResult: vi.fn().mockResolvedValue(undefined)
    };

    const session = new ReaderSession(
      document,
      'https://example.com',
      {
        requestSelectionAction: promptMock
      },
      dependencies
    );
    await session.start();
    return { session };
  }

  function selectTargetText(): HTMLElement {
    const target = document.createElement('p');
    target.id = 'target';
    target.textContent = 'Selected text content';
    document.body.appendChild(target);

    const range = document.createRange();
    range.selectNodeContents(target);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return target;
  }

  async function flushAsyncWork(): Promise<void> {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('adds highlight when configured modifier keys are satisfied', async () => {
    const { session } = await createSessionWithConfig({
      selectionModifierEnabled: true,
      selectionModifierKeys: ['meta']
    });

    const target = selectTargetText();

    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, metaKey: true }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    await flushAsyncWork();

    expect(promptMock).toHaveBeenCalled();

    const highlights = (session as unknown as { __testHighlights: unknown[] }).__testHighlights;
    expect(highlights).toHaveLength(1);
  });

  it('does not add highlight when modifier keys are missing', async () => {
    const { session } = await createSessionWithConfig({
      selectionModifierEnabled: true,
      selectionModifierKeys: ['meta']
    });

    const target = selectTargetText();

    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, metaKey: false }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    await flushAsyncWork();

    expect(promptMock).not.toHaveBeenCalled();

    const highlights = (session as unknown as { __testHighlights: unknown[] }).__testHighlights;
    expect(highlights).toHaveLength(0);
  });

  it('ignores modifier requirement when disabled', async () => {
    const { session } = await createSessionWithConfig({
      selectionModifierEnabled: false,
      selectionModifierKeys: []
    });
    const target = selectTargetText();

    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    // Keep selection active as if user dragged before releasing mouse.
    selectTargetText();
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    await flushAsyncWork();

    expect(promptMock).toHaveBeenCalled();
    const highlights = (session as unknown as { __testHighlights: unknown[] }).__testHighlights;
    expect(highlights).toHaveLength(1);
  });
});
