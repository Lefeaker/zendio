/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const promptMock = vi.fn();

vi.mock('../../src/content/reader/ui/panel', () => ({
  ReaderPanel: vi.fn().mockImplementation(() => {
    const element = document.createElement('div');
    element.id = 'aiob-reader-panel';
    document.body.appendChild(element);
    return {
      element,
      updateCount: vi.fn(),
      setHighlights: vi.fn(),
      updateHint: vi.fn(),
      stopEditing: vi.fn(),
      isEditing: vi.fn().mockReturnValue(false),
      destroy: vi.fn()
    };
  })
}));

vi.mock('../../src/content/clipper/shared/styleManager', () => ({
  InlineStyleManager: vi.fn().mockImplementation(() => ({
    mount: vi.fn(),
    unmount: vi.fn()
  }))
}));

vi.mock('../../src/i18n', () => ({
  getMessages: vi.fn().mockResolvedValue({
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
  })
}));

vi.mock('../../src/content/clipper/services/fragmentConfig', async () => {
  const actual = await vi.importActual<typeof import('../../src/content/clipper/services/fragmentConfig')>(
    '../../src/content/clipper/services/fragmentConfig'
  );
  return {
    ...actual,
    loadFragmentConfig: vi.fn()
  };
});

describe('ReaderSession selection modifiers', () => {
  beforeEach(() => {
    promptMock.mockReset();
    promptMock.mockResolvedValue({ action: 'clip', comment: '' });
    (globalThis as unknown as { chrome?: unknown }).chrome = {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({})
        }
      }
    } as unknown as typeof chrome;
    window.__aiobReaderActive = false;
    window.__aiobReaderController = undefined;
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    delete (globalThis as { chrome?: unknown }).chrome;
    window.__aiobReaderActive = false;
    window.__aiobReaderController = undefined;
  });

  async function createSessionWithConfig(config: Partial<import('../../src/shared/types/options').FragmentClipperOptions>) {
    const fragmentConfigModule = await import('../../src/content/clipper/services/fragmentConfig');
    const loadFragmentConfigMock = fragmentConfigModule.loadFragmentConfig as unknown as vi.Mock;
    loadFragmentConfigMock.mockResolvedValue({
      ...fragmentConfigModule.DEFAULT_FRAGMENT_CONFIG,
      ...config
    });

    const { ReaderSession } = await import('../../src/content/reader/session');
    const session = new ReaderSession(document, 'https://example.com', {
      requestSelectionAction: promptMock
    });
    await session.start();
    return { session, loadFragmentConfigMock };
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

    const highlights = (session as unknown as { highlights: unknown[] }).highlights;
    expect(highlights).toHaveLength(1);

    (session as unknown as { cleanup: () => void }).cleanup();
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

    const highlights = (session as unknown as { highlights: unknown[] }).highlights;
    expect(highlights).toHaveLength(0);
    expect(promptMock).not.toHaveBeenCalled();

    (session as unknown as { cleanup: () => void }).cleanup();
  });

  it('ignores modifier requirement when disabled', async () => {
    const { session } = await createSessionWithConfig({
      selectionModifierEnabled: false,
      selectionModifierKeys: []
    });

    const target = selectTargetText();

    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    await flushAsyncWork();

    expect(promptMock).toHaveBeenCalled();

    const highlights = (session as unknown as { highlights: unknown[] }).highlights;
    expect(highlights).toHaveLength(1);

    (session as unknown as { cleanup: () => void }).cleanup();
  });
});
