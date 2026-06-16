/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { setWindowProp } from '../../utils/typeHelpers';
import { MockClipRepository } from '../../utils/repositories';
import {
  __resetContentSessionRegistryForTests,
  registerReaderSession
} from '@content/runtime/contentSessionRegistry';
import type { StorageService } from '../../../src/platform/interfaces/storage';
import type { RuntimeService } from '../../../src/platform/interfaces/runtime';
import type { ErrorHandler } from '@shared/errors';
import type { ClipperDialogDependencies } from '@content/clipper/components/dialogDependencies';

type StyleSheetManagerModule =
  typeof import('../../../src/content/clipper/shared/styleSheetManager');

const initializeStylesMock =
  vi.fn<
    (
      ...args: Parameters<StyleSheetManagerModule['clipperStyleSheetManager']['initialize']>
    ) => ReturnType<StyleSheetManagerModule['clipperStyleSheetManager']['initialize']>
  >();
const applyStylesMock =
  vi.fn<
    (
      ...args: Parameters<StyleSheetManagerModule['clipperStyleSheetManager']['applyTo']>
    ) => ReturnType<StyleSheetManagerModule['clipperStyleSheetManager']['applyTo']>
  >();
const applyStitchRuntimeStylesMock = vi.fn();
const ensureContentI18nMock = vi.fn();
const getContentI18nBinderMock = vi.fn();
const getContentMessagesMock = vi.fn();
let clipRepo: MockClipRepository;
let storageService: StorageService;
let runtimeService: RuntimeService;
let errorHandler: ErrorHandler;

vi.mock('../../../src/content/i18n/context', () => ({
  ensureContentI18n: ensureContentI18nMock,
  getContentI18nBinder: getContentI18nBinderMock,
  getContentMessages: getContentMessagesMock
}));

vi.mock('../../../src/content/clipper/shared/styleSheetManager', () => ({
  clipperStyleSheetManager: {
    initialize: initializeStylesMock,
    applyTo: applyStylesMock,
    applyStitchRuntimeStyles: applyStitchRuntimeStylesMock
  },
  supportsAdoptedStyleSheets: () => true
}));

const dialogMessages = {
  clipDialogTitle: 'Clip Selection',
  clipDialogInstructions:
    'Use Tab to move between controls. Press Alt + Arrow keys to reposition the dialog.',
  cancelButton: 'Cancel',
  clipButton: 'Save',
  commentLabel: 'Comment',
  commentPlaceholder: 'Add a note',
  openReaderButton: 'Open reader',
  addToReaderButton: 'Add to reader'
};

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));
const expectDialogResult = (result: unknown, expected: { action: string; comment: string }) => {
  expect(result).toEqual({
    ...expected,
    destination: { kind: 'downloads' }
  });
};
const getDialogRoot = () => {
  const host = document.getElementById('obsidian-clipper-dialog');
  if (!host) {
    return null;
  }
  return host.shadowRoot ?? host;
};
const getTextarea = (): HTMLTextAreaElement => {
  const textarea =
    getDialogRoot()?.querySelector<HTMLTextAreaElement>('#clipper-comment-input') ?? null;
  if (!textarea) {
    throw new Error('textarea missing');
  }
  return textarea;
};

async function createDialog() {
  const { ClipperDialog } = await import('@content/clipper/components/dialog');
  const optionsRepository = {
    get: vi.fn(() =>
      Promise.resolve({
        rest: {
          rootDir: '',
          vault: 'Test Vault',
          baseUrl: '',
          apiKey: ''
        },
        vaultRouter: {
          defaultVaultId: 'default',
          vaults: [],
          rules: []
        }
      })
    ),
    set: vi.fn(() => Promise.resolve()),
    onChange: vi.fn(() => () => undefined)
  } as unknown as ClipperDialogDependencies['optionsRepository'];
  return new ClipperDialog({
    clipRepo,
    storage: storageService,
    runtime: runtimeService,
    errorHandler,
    optionsRepository
  });
}

let restorePointerEvent: (() => void) | undefined;
beforeAll(() => {
  if (typeof window.PointerEvent === 'undefined') {
    class TestPointerEvent extends MouseEvent {
      constructor(type: string, init?: PointerEventInit) {
        super(type, init);
      }
    }
    restorePointerEvent = setWindowProp(
      'PointerEvent',
      TestPointerEvent as unknown as typeof PointerEvent
    );
  }
});

afterAll(() => {
  restorePointerEvent?.();
});

describe('ClipperDialog Keyboard Shortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureContentI18nMock.mockResolvedValue(undefined);
    getContentI18nBinderMock.mockReturnValue(null);
    getContentMessagesMock.mockResolvedValue(dialogMessages);
    initializeStylesMock.mockResolvedValue(undefined);
    applyStylesMock.mockResolvedValue(undefined);
    applyStitchRuntimeStylesMock.mockReturnValue(undefined);
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    clipRepo = new MockClipRepository();
    storageService = {
      local: {
        get: vi.fn(async () => undefined),
        set: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
        clear: vi.fn(async () => undefined),
        getBytesInUse: vi.fn(async () => 0),
        watch: vi.fn(() => () => {}),
        watchKey: vi.fn(() => () => {})
      }
    } as unknown as StorageService;
    runtimeService = {
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`)
    } as unknown as RuntimeService;
    errorHandler = {
      handle: vi.fn(async () => undefined)
    } as unknown as ErrorHandler;

    // Clear any reader mode indicators
    __resetContentSessionRegistryForTests(document);
    document.body.removeAttribute('data-aiob-reader-active');
    const existingPanel = document.getElementById('aiob-reader-panel');
    if (existingPanel) {
      existingPanel.remove();
    }
  });

  it('renders shortcut hints with modifier labels from dialogShortcuts', async () => {
    const { renderShortcutHint } =
      await import('../../../src/content/clipper/components/dialogPresenterEvents');
    const hint = document.createElement('div');

    renderShortcutHint(
      hint,
      {
        header: 'Comment editing completed. Use shortcuts to finish:',
        doubleEnterLabel: 'Double-Enter',
        doubleEnterAction: 'Double ↵',
        modifierAction: 'Clip directly',
        escapeAction: 'Cancel'
      },
      'MacIntel'
    );

    expect(hint.hidden).toBe(false);
    expect(hint.innerHTML).toContain('Cmd+Enter');
    expect(hint.textContent).toContain('Clip directly');
  });

  describe('when keyboard shortcuts are enabled', () => {
    it('double-enter triggers reader mode in normal mode', async () => {
      const dialog = await createDialog();

      const resultPromise = dialog.show('Test selection');
      await flushPromises();

      const textarea = getTextarea();
      expect(textarea).not.toBeNull();

      textarea.value = 'Test comment';

      // First Enter
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true
        })
      );

      // Second Enter within 600ms
      setTimeout(() => {
        textarea.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true
          })
        );
      }, 100);

      const result = await resultPromise;
      expectDialogResult(result, { action: 'reader', comment: 'Test comment' });
    });

    it('Cmd+Enter triggers clip action on Mac', async () => {
      // Mock Mac platform
      Object.defineProperty(navigator, 'platform', {
        value: 'MacIntel',
        configurable: true
      });

      const dialog = await createDialog();

      const resultPromise = dialog.show('Test selection');
      await flushPromises();

      const textarea = getTextarea();
      textarea.value = 'Test comment';

      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          metaKey: true,
          bubbles: true,
          cancelable: true
        })
      );

      const result = await resultPromise;
      expectDialogResult(result, { action: 'clip', comment: 'Test comment' });
    });

    it('Alt+Enter triggers clip action on Windows', async () => {
      // Mock Windows platform
      Object.defineProperty(navigator, 'platform', {
        value: 'Win32',
        configurable: true
      });

      const dialog = await createDialog();

      const resultPromise = dialog.show('Test selection');
      await flushPromises();

      const textarea = getTextarea();
      textarea.value = 'Test comment';

      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          altKey: true,
          bubbles: true,
          cancelable: true
        })
      );

      const result = await resultPromise;
      expectDialogResult(result, { action: 'clip', comment: 'Test comment' });
    });

    it('double-enter triggers clip action in reader mode', async () => {
      // Mock reader mode
      registerReaderSession({ id: 'reader-session' }, document);

      const dialog = await createDialog();

      const resultPromise = dialog.show('Test selection');
      await flushPromises();

      const textarea = getTextarea();
      textarea.value = 'Test comment';

      // First Enter
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true
        })
      );

      // Second Enter within 600ms
      setTimeout(() => {
        textarea.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true
          })
        );
      }, 100);

      const result = await resultPromise;
      expectDialogResult(result, { action: 'clip', comment: 'Test comment' });
    });
  });

  describe('when keyboard shortcuts are disabled', () => {
    beforeEach(async () => {
      await clipRepo.setFragmentConfig({ keyboardShortcutsEnabled: false });
    });

    it('double-enter shows shortcut hint and temporarily activates shortcuts', async () => {
      const dialog = await createDialog();

      void dialog.show('Test selection');
      await flushPromises();

      const textarea = getTextarea();
      textarea.value = 'Test comment';

      // First Enter
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true
        })
      );

      // Second Enter within 600ms
      await new Promise((resolve) => {
        setTimeout(() => {
          textarea.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'Enter',
              bubbles: true,
              cancelable: true
            })
          );
          resolve(undefined);
        }, 100);
      });

      await flushPromises();

      // Check that textarea becomes readonly
      expect(textarea.readOnly).toBe(true);
      expect(textarea.style.opacity).toBe('0.8');

      // Check that hint is displayed
      const hint = getDialogRoot()?.querySelector('.clipper-comment-completed-hint');
      expect(hint).not.toBeNull();
      expect(hint?.textContent).toContain(
        'Comment editing completed, you can use keyboard shortcuts to complete the following actions:'
      );
    });

    it('shows correct modifier key in hint based on platform', async () => {
      // Test Mac
      Object.defineProperty(navigator, 'platform', {
        value: 'MacIntel',
        configurable: true
      });

      const dialog = await createDialog();

      void dialog.show('Test selection');
      await flushPromises();

      const textarea = getTextarea();
      textarea.value = 'Test comment';

      // Trigger double-enter
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await new Promise((resolve) => {
        setTimeout(() => {
          textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
          resolve(undefined);
        }, 100);
      });

      await flushPromises();

      const hint = getDialogRoot()?.querySelector('.clipper-comment-completed-hint');
      expect(hint).not.toBeNull();
      expect(hint?.innerHTML).toContain('Cmd+Enter');
    });

    it('temporarily activated shortcuts work after double-enter', async () => {
      const dialog = await createDialog();

      const resultPromise = dialog.show('Test selection');
      await flushPromises();

      const textarea = getTextarea();
      textarea.value = 'Test comment';

      // First double-enter to activate shortcuts
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      setTimeout(() => {
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      }, 100);

      await flushPromises();

      // Now try double-enter again (should trigger reader mode)
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      setTimeout(() => {
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      }, 100);

      const result = await resultPromise;
      expectDialogResult(result, { action: 'reader', comment: 'Test comment' });
    });

    it('Escape cancels when shortcuts are temporarily activated', async () => {
      const dialog = await createDialog();

      const resultPromise = dialog.show('Test selection');
      await flushPromises();

      const textarea = getTextarea();
      textarea.value = 'Test comment';

      // First double-enter to activate shortcuts
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      setTimeout(() => {
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      }, 100);

      await flushPromises();

      // Now press Escape
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true
        })
      );

      const result = await resultPromise;
      expectDialogResult(result, { action: 'cancel', comment: '' });
    });
  });

  describe('edge cases', () => {
    it('ignores Enter with other modifier keys', async () => {
      const dialog = await createDialog();

      void dialog.show('Test selection');
      await flushPromises();

      const textarea = getTextarea();
      textarea.value = 'Test comment';

      // Shift+Enter should be ignored
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          shiftKey: true,
          bubbles: true,
          cancelable: true
        })
      );

      await flushPromises();

      // Dialog should still be open
      const dialogElement = document.getElementById('obsidian-clipper-dialog');
      expect(dialogElement).not.toBeNull();

      // Clean up
      const cancelBtn = getDialogRoot()?.querySelector<HTMLButtonElement>(
        '[data-i18n="cancelButton"]'
      );
      cancelBtn?.click();
    });

    it('handles timeout between Enter presses correctly', async () => {
      const dialog = await createDialog();

      void dialog.show('Test selection');
      await flushPromises();

      const textarea = getTextarea();
      textarea.value = 'Test comment';

      // First Enter
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      // Wait longer than timeout (600ms)
      await new Promise((resolve) => setTimeout(resolve, 700));

      // Second Enter (should not trigger double-enter)
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      await flushPromises();

      // Dialog should still be open
      const dialogElement = document.getElementById('obsidian-clipper-dialog');
      expect(dialogElement).not.toBeNull();

      // Clean up
      const cancelBtn = getDialogRoot()?.querySelector<HTMLButtonElement>(
        '[data-i18n="cancelButton"]'
      );
      cancelBtn?.click();
    });
  });
});
