/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoSessionControllers } from '@content/video/videoSessionControllers';
import { VideoSessionState } from '@content/video/sessionState';
import type { VideoSessionDependencies } from '@content/video/sessionTypes';
import type {
  PlatformSelectionInput,
  VideoPlatformAdapter,
  VideoPlatformContext
} from '@content/video/platforms';
import type { FragmentClipperOptions } from '@shared/types/options';
import { asType, selection as mkSelection } from '../../../utils/typeHelpers';
import type { DocumentMutationHubApi } from '@content/runtime/documentMutationTypes';
import { configureSessionDraftRuntimeMessenger } from '@content/sessionDrafts/sessionDraftTabContext';

function createDocumentMutationHub(): {
  hub: DocumentMutationHubApi;
  subscribe: ReturnType<typeof vi.fn>;
} {
  const subscribe = vi.fn(() => vi.fn());
  return { hub: { subscribe }, subscribe };
}

function createPlatformContext(documentMutationHub: DocumentMutationHubApi): VideoPlatformContext {
  return {
    doc: document,
    documentMutationHub,
    highlightSelection: vi.fn(),
    decorateHighlight: vi.fn(),
    scheduleFragmentHighlightRestore: vi.fn(),
    getElementByIdDeep: vi.fn(() => null),
    querySelectorDeep: <T extends Element>(): T | null => null,
    createScopedMutationObserver: vi.fn(() => null),
    observeWithFragmentObserver: vi.fn(),
    registerShadowSelectionBridge: vi.fn(),
    unregisterShadowSelectionBridge: vi.fn(),
    ensureHighlightStyles: vi.fn()
  };
}

function createFragmentConfig(): FragmentClipperOptions {
  return {
    useFootnoteFormat: false,
    captureContext: true,
    contextLength: 100,
    contextMode: 'chars' as const,
    selectionTriggerMode: 'direct',
    selectionModifierKeys: [],
    keyboardShortcutsEnabled: true
  };
}

describe('createVideoSessionControllers', () => {
  beforeEach(() => {
    configureSessionDraftRuntimeMessenger(vi.fn().mockResolvedValue({ success: true }));
  });

  afterEach(() => {
    configureSessionDraftRuntimeMessenger(null);
  });

  it('returns a stable code when no screenshot cache repository is wired', async () => {
    const state = new VideoSessionState('gradient');
    state.fragmentConfig = createFragmentConfig();
    const documentMutationHub = createDocumentMutationHub();

    const controllers = createVideoSessionControllers({
      doc: document,
      dependencies: asType<VideoSessionDependencies>({
        viewFactory: {},
        optionsRepository: {},
        videoRepository: {},
        storage: {
          local: {},
          sync: {}
        }
      }),
      state,
      destinationState: asType({
        metadata: undefined,
        applyMetadata: vi.fn()
      }),
      getMessages: () =>
        asType({
          ready: 'ready'
        }),
      readCleanupState: () => ({ isCleaningUp: false, shouldTrackSavingState: true }),
      documentMutationHub: documentMutationHub.hub,
      createPlatformContext,
      getDocumentSelection: () => null,
      isRangeInsideUi: () => false,
      ensureCaptureHighlight: vi.fn(),
      onSelectionAccepted: vi.fn(),
      findVideoElement: () => null,
      handleUrlChange: vi.fn(),
      handleVideoElementChange: vi.fn()
    });

    await expect(
      controllers.persistPreparedScreenshot('capture-1', asType({ id: 'shot-1' }))
    ).resolves.toEqual({
      status: 'skipped',
      reason: 'serialize-failed',
      error: 'VIDEO_SCREENSHOT_CACHE_REPOSITORY_UNAVAILABLE'
    });
  });

  it('passes the same hub identity to fragment and platform composition', () => {
    const state = new VideoSessionState('gradient');
    state.fragmentConfig = createFragmentConfig();
    state.platform = 'bilibili';
    state.captures = [
      {
        kind: 'fragment',
        id: 'fragment-identity',
        comment: '',
        selectedText: 'Identity',
        selectedHtml: '<p>Identity</p>',
        fragmentUrl: 'https://www.bilibili.com/video/BV1/#:~:text=Identity',
        createdAt: 1
      }
    ];
    const documentMutationHub = createDocumentMutationHub();
    const createPlatformContextSpy = vi.fn(createPlatformContext);
    const controllers = createVideoSessionControllers({
      doc: document,
      dependencies: asType<VideoSessionDependencies>({
        viewFactory: {},
        optionsRepository: {},
        videoRepository: {},
        storage: { local: {}, sync: {} }
      }),
      state,
      destinationState: asType({ metadata: undefined, applyMetadata: vi.fn() }),
      getMessages: () => asType({ ready: 'ready' }),
      readCleanupState: () => ({ isCleaningUp: false, shouldTrackSavingState: true }),
      documentMutationHub: documentMutationHub.hub,
      createPlatformContext: createPlatformContextSpy,
      getDocumentSelection: () => null,
      isRangeInsideUi: () => false,
      ensureCaptureHighlight: vi.fn(),
      onSelectionAccepted: vi.fn(),
      findVideoElement: () => null,
      handleUrlChange: vi.fn(),
      handleVideoElementChange: vi.fn()
    });

    controllers.fragmentHighlightCoordinator.ensureStartedForFragments();
    controllers.platformController.syncPlatformAdapter();

    expect(documentMutationHub.subscribe).toHaveBeenCalledTimes(2);
    expect(createPlatformContextSpy).toHaveBeenCalledWith(documentMutationHub.hub);
  });

  it('passes shadow drag event fallback activation through the session controller wiring', async () => {
    document.body.innerHTML = '<div id="host"></div>';
    const host = document.getElementById('host');
    if (!host) throw new Error('missing host');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<span>Shadow selected text</span>';

    const state = new VideoSessionState('gradient');
    state.fragmentConfig = createFragmentConfig();
    const documentMutationHub = createDocumentMutationHub();
    state.platformAdapter = asType<VideoPlatformAdapter>({
      platform: 'bilibili',
      shouldActivate: vi.fn(() => true),
      resolveSelection: vi.fn((input: PlatformSelectionInput) =>
        input.event && input.range === null
          ? {
              text: 'Shadow selected text',
              html: '<p>Shadow selected text</p>'
            }
          : null
      ),
      findTextRange: vi.fn(() => null),
      highlight: vi.fn(() => undefined),
      restoreHighlight: vi.fn(() => undefined),
      buildTimestampUrl: vi.fn(() => null),
      formatVideoTitle: vi.fn(() => null),
      dispose: vi.fn()
    });

    const onSelectionAccepted = vi.fn();
    const controllers = createVideoSessionControllers({
      doc: document,
      dependencies: asType<VideoSessionDependencies>({
        viewFactory: {},
        optionsRepository: {},
        videoRepository: {},
        storage: {
          local: {},
          sync: {}
        }
      }),
      state,
      destinationState: asType({
        metadata: undefined,
        applyMetadata: vi.fn()
      }),
      getMessages: () =>
        asType({
          ready: 'ready'
        }),
      readCleanupState: () => ({ isCleaningUp: false, shouldTrackSavingState: true }),
      documentMutationHub: documentMutationHub.hub,
      createPlatformContext,
      getDocumentSelection: () =>
        mkSelection({
          rangeCount: 0,
          isCollapsed: true,
          toString: () => ''
        }),
      isRangeInsideUi: () => false,
      ensureCaptureHighlight: vi.fn(),
      onSelectionAccepted,
      findVideoElement: () => null,
      handleUrlChange: vi.fn(),
      handleVideoElementChange: vi.fn()
    });

    controllers.shadowSelectionBridge.register(root);
    root.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        composed: true,
        button: 0,
        clientX: 1,
        clientY: 1
      })
    );
    root.dispatchEvent(
      new MouseEvent('mouseup', {
        bubbles: true,
        composed: true,
        button: 0,
        clientX: 20,
        clientY: 1
      })
    );
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    expect(onSelectionAccepted).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedText: 'Shadow selected text',
        selectedHtml: '<p>Shadow selected text</p>',
        range: null
      })
    );
    expect(documentMutationHub.subscribe).not.toHaveBeenCalled();
  });
});
