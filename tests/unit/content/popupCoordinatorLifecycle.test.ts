/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorageService } from '../../../src/platform/preview/memoryStorage';
import {
  __setContentBootstrapLoadersForTests,
  bootstrapContentScript,
  getContentService,
  resetGlobalContentContext
} from '../../../src/content/bootstrap';
import { createClipperDialogPromptGateway } from '../../../src/content/clipper/presentation/clipperDialogPrompt';
import { ReaderDialogPanel } from '../../../src/content/reader/ui/ReaderDialogPanel';
import { SupportPrompt } from '../../../src/content/ui/supportPrompt';
import { VideoDialogPanel } from '../../../src/content/video/ui/VideoDialogPanel';
import type { PopupCoordinator } from '../../../src/content/runtime/popupCoordinator';
import {
  registerMockRepositories,
  registry,
  resetGlobalRegistry,
  TOKENS,
  repositoryContainer
} from '@shared/di';
import type { PlatformServices } from '../../../src/platform/types';
import type {
  ReaderPanelCallbacks,
  ReaderPanelTexts
} from '../../../src/content/reader/application/readerPanelModel';
import type {
  VideoPanelCallbacks,
  VideoPanelTexts
} from '../../../src/content/video/application/videoPanelModel';
import {
  MockClipRepository,
  MockMessagingRepository,
  MockNavigationRepository,
  MockOptionsRepository,
  MockReaderRepository,
  MockVideoRepository,
  MockYamlRepository
} from '../../utils/repositories';

vi.mock('focus-trap', () => ({
  createFocusTrap: () => ({
    activate: vi.fn(),
    deactivate: vi.fn(),
    pause: vi.fn(),
    unpause: vi.fn()
  })
}));

const ensureContentI18nMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const getContentI18nBinderMock = vi.hoisted(() => vi.fn(() => null));
const getContentI18nResourceMock = vi.hoisted(() => vi.fn(() => ({ messages: null })));
const getContentMessagesMock = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      clipDialogTitle: 'Clip Selection',
      clipDialogInstructions: 'Use Tab to move between controls.',
      cancelButton: 'Cancel',
      clipButton: 'Save',
      openReaderButton: 'Open reader',
      addToReaderButton: 'Add to reader',
      openVideoModeButton: 'Enter video mode',
      commentLabel: 'Comment',
      commentPlaceholder: 'Add a note',
      clipperCommentEditCompleted: 'Done',
      clipperShortcutHintDoubleEnter: 'Double enter',
      clipperShortcutDoubleEnter: 'Double enter',
      clipperShortcutHintModifierEnter: 'Modifier enter',
      clipperShortcutModifierEnter: 'Cmd+Enter',
      clipperShortcutHintEscape: 'Escape',
      clipperShortcutEsc: 'Esc',
      supportPromptDialogLabel: 'Support All in Ob',
      supportPromptTitle: 'Support All in Ob',
      supportPromptKoFiTitle: 'Ko-fi',
      supportPromptKoFiDescription: 'Buy me a coffee',
      supportPromptAfdianTitle: 'Afdian',
      supportPromptAfdianDescription: 'CN sponsor',
      supportPromptGithubTitle: 'GitHub',
      supportPromptGithubDescription: 'File feedback',
      supportPromptFeedbackGroupLabel: 'Quick feedback',
      supportPromptLikeLabel: 'Thumbs up',
      supportPromptDislikeLabel: 'Thumbs down',
      supportPromptDismiss: 'Click outside to close',
      supportPromptStatusSuccess: 'Sent',
      supportPromptStatusSuccessWithVault: 'Sent to {vault}',
      supportPromptStatusWarning: 'Saved with warning',
      supportPromptStatusWarningWithReason: 'Saved with warning: {reason}',
      supportPromptStatusFailure: 'Failed',
      supportPromptStatusFailureWithReason: 'Failed: {reason}',
      supportPromptLikeThankYou: 'Thanks!',
      supportPromptReviewLinkLabel: 'Write review',
      supportPromptReviewAcknowledgedLabel: 'I already reviewed',
      supportPromptDislikeToastTitle: 'Share feedback',
      supportPromptDislikeRedditLinkLabel: 'Discuss on Reddit',
      supportPromptDislikeQrLinkLabel: 'Join Xiaohongshu',
      supportPromptDislikeQrPlaceholder: 'QR soon'
    })
  )
);

vi.mock('../../../src/content/i18n/context', () => ({
  ensureContentI18n: ensureContentI18nMock,
  getContentI18nBinder: getContentI18nBinderMock,
  getContentI18nResource: getContentI18nResourceMock,
  getContentMessages: getContentMessagesMock
}));

const initializeClipperStylesMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const applyClipperStylesMock = vi.hoisted(() => vi.fn());
vi.mock('../../../src/content/clipper/shared/styleSheetManager', () => ({
  clipperStyleSheetManager: {
    initialize: initializeClipperStylesMock,
    applyTo: applyClipperStylesMock
  }
}));

const initializePanelStylesMock = vi.hoisted(() => vi.fn());
const applyReaderStylesMock = vi.hoisted(() => vi.fn());
vi.mock('../../../src/content/shared/panels/styleSheetManager', () => ({
  panelStyleSheetManager: {
    initialize: initializePanelStylesMock,
    applyReaderStyles: applyReaderStylesMock
  }
}));

const loadClipperStyleMock = vi.hoisted(() =>
  vi.fn((name: string) => Promise.resolve(`.${name}{display:block;}`))
);
vi.mock('../../../src/content/clipper/shared/styleRegistry', () => ({
  loadClipperStyle: loadClipperStyleMock
}));

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const readerTexts: ReaderPanelTexts = {
  title: 'Reader Panel',
  status: 'Ready',
  counter: '{count} highlights',
  counterZero: 'No highlights',
  finish: 'Finish',
  cancel: 'Cancel',
  hint: 'hint',
  highlightEditLabel: 'Edit',
  highlightDeleteLabel: 'Delete',
  highlightNoComment: 'Add note',
  highlightSaveLabel: 'Save',
  highlightCancelLabel: 'Cancel',
  highlightEditPlaceholder: 'Enter note',
  highlightFocusLabel: 'Focus {index}'
};

const readerCallbacks: ReaderPanelCallbacks = {
  onFinish: vi.fn(),
  onCancel: vi.fn(),
  onDeleteHighlight: vi.fn(),
  onFocusHighlight: vi.fn(),
  onSubmitHighlightEdit: vi.fn()
};

const videoTexts: VideoPanelTexts = {
  title: 'Video Panel',
  status: 'Ready',
  counter: '{count} captures',
  counterZero: 'No captures',
  add: 'Add',
  finish: 'Finish',
  cancel: 'Cancel',
  hint: 'Pick a moment',
  captureEditLabel: 'Edit',
  captureDeleteLabel: 'Delete',
  captureNoComment: 'Add comment',
  captureSaveLabel: 'Save',
  captureCancelLabel: 'Cancel',
  captureEditPlaceholder: 'Write a note',
  captureFocusLabel: 'Focus {index}'
};

const videoCallbacks: VideoPanelCallbacks = {
  onAddCapture: vi.fn(),
  onFinish: vi.fn(),
  onCancel: vi.fn(),
  onDeleteCapture: vi.fn(),
  onFocusCapture: vi.fn(),
  onSubmitCaptureEdit: vi.fn()
};

describe('content popup coordinator lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    resetGlobalContentContext();
    resetGlobalRegistry();
    registry.reset();
    repositoryContainer.reset();

    const storage = createMemoryStorageService();
    const platformServices = {
      storage,
      runtime: {
        getURL: (path: string) => `chrome-extension://${path}`
      }
    } as PlatformServices;

    __setContentBootstrapLoadersForTests({
      loadPlatformModule: () => ({
        getPlatformServices: () => platformServices
      }),
      loadStyleManagers: () => ({
        clipperStyleSheetManager: { initialize: initializeClipperStylesMock },
        panelStyleSheetManager: { initialize: initializePanelStylesMock }
      })
    });

    registerMockRepositories({
      options: MockOptionsRepository,
      messaging: MockMessagingRepository,
      yaml: MockYamlRepository,
      clip: MockClipRepository,
      video: MockVideoRepository,
      reader: MockReaderRepository,
      navigation: MockNavigationRepository
    });

    bootstrapContentScript(storage);

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      writable: true,
      value: false
    });
  });

  afterEach(() => {
    resetGlobalContentContext();
    resetGlobalRegistry();
    registry.reset();
    repositoryContainer.reset();
    __setContentBootstrapLoadersForTests(null);
    document.body.innerHTML = '';
  });

  async function openAllPopups() {
    const reader = new ReaderDialogPanel({ callbacks: readerCallbacks, texts: readerTexts });
    reader.show();

    const video = new VideoDialogPanel({ callbacks: videoCallbacks, texts: videoTexts });
    video.show();

    const support = new SupportPrompt(document);
    await support.show({ status: 'success', vaultName: 'Main Vault' });

    const clipperGateway = createClipperDialogPromptGateway();
    void clipperGateway.requestSelectionAction({
      selectedText: 'Hello popup coordinator',
      allowReaderMode: true,
      readerModeBehavior: 'start'
    });
    await flushPromises();
    await flushPromises();

    return {
      reader,
      video,
      support,
      popupCoordinator: getContentService<PopupCoordinator>(TOKENS.dialogRegistry)
    };
  }

  function expectReaderAndVideoClosed(reader: ReaderDialogPanel, video: VideoDialogPanel): void {
    const readerOverlay = reader.element.shadowRoot?.querySelector('.modal');
    const videoOverlay = video.element.shadowRoot?.querySelector('.modal');
    expect(readerOverlay?.classList.contains('modal-open')).toBe(false);
    expect(videoOverlay?.classList.contains('modal-open')).toBe(false);
  }

  it('closes clipper, reader, video, and support popups on visibilitychange', async () => {
    const { reader, video, popupCoordinator } = await openAllPopups();

    expect(document.getElementById('obsidian-clipper-dialog')).toBeTruthy();
    expect(document.getElementById('aiob-support-prompt')).toBeTruthy();
    expect(reader.element.shadowRoot?.querySelector('.modal-open')).toBeTruthy();
    expect(video.element.shadowRoot?.querySelector('.modal-open')).toBeTruthy();
    expect(popupCoordinator.getActive()).toBeTruthy();

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(document.getElementById('obsidian-clipper-dialog')).toBeNull();
    expect(document.getElementById('aiob-support-prompt')).toBeNull();
    expectReaderAndVideoClosed(reader, video);
    expect(popupCoordinator.getActive()).toBeNull();
  });

  it('closes clipper, reader, video, and support popups on pagehide', async () => {
    const { reader, video, popupCoordinator } = await openAllPopups();

    window.dispatchEvent(new Event('pagehide'));

    expect(document.getElementById('obsidian-clipper-dialog')).toBeNull();
    expect(document.getElementById('aiob-support-prompt')).toBeNull();
    expectReaderAndVideoClosed(reader, video);
    expect(popupCoordinator.getActive()).toBeNull();
  });
});
