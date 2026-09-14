/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getService, TOKENS } from '@shared/di';
import type { PlatformServices } from '@platform/types';
import { patchExportDestinationRow } from '@content/shared/exportDestinationDom';
import { createI18nResource } from '@i18n/resource';
import { getMessagesForLanguage, type I18nResource } from '@i18n';
import { loadRuntimeLocaleAsset } from '@i18n/runtime/assets';
import {
  createClipperSurfaceContent,
  createReaderSurfaceContent,
  createVideoSurfaceContent
} from '@content/stitch/runtimeSurfaceContent';
import { DEFAULT_SESSION_MESSAGES as READER_MESSAGES } from '@content/reader/sessionMessages';
import { DEFAULT_SESSION_MESSAGES as VIDEO_MESSAGES } from '@content/video/sessionMessages';
import {
  renderStitchRuntimeSessionSurface,
  renderStitchRuntimeSessionTemplate,
  renderStitchRuntimeSurface
} from '@content/stitch/runtimeSurfaceRenderer';
import type { ExportDestinationSurfacePreview } from '@ui/stitch-runtime';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

const contentI18nControllerHarness = vi.hoisted(() => {
  const state: { resource: I18nResource | null } = { resource: null };
  const load = vi.fn(() => Promise.resolve());
  const mount = vi.fn();
  const dispose = vi.fn();
  const controller = {
    load,
    mount,
    dispose,
    getCurrentResource: vi.fn(() => state.resource),
    getBinder: vi.fn(() => ({ bindText: vi.fn(), bindAttr: vi.fn(), bindHtml: vi.fn() })),
    registerDynamic: vi.fn(),
    changeLanguage: vi.fn(() => Promise.resolve())
  };
  return {
    state,
    load,
    mount,
    dispose,
    controller,
    createController: vi.fn(() => controller),
    configureStorage: vi.fn()
  };
});

const loadSchemaMessagesAssetMock = vi.hoisted(() => vi.fn());

vi.mock('@i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@i18n')>()),
  createDefaultPageI18nController: contentI18nControllerHarness.createController,
  configureI18nStorage: contentI18nControllerHarness.configureStorage
}));

vi.mock('@i18n/runtime/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@i18n/runtime/assets')>()),
  loadSchemaMessagesAsset: loadSchemaMessagesAssetMock
}));

const getContentI18nResourceMock = vi.hoisted(() => vi.fn<() => I18nResource | null>(() => null));

vi.mock('@content/i18n/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@content/i18n/context')>()),
  getContentI18nResource: getContentI18nResourceMock
}));

function createDestination(): ExportDestinationSurfacePreview {
  return {
    id: 'downloads',
    kind: 'downloads',
    label: 'Downloads',
    path: 'Downloads/clip.md',
    hasConfiguredVault: true,
    options: [
      {
        id: 'downloads',
        kind: 'downloads',
        label: 'Downloads',
        path: 'Downloads/clip.md',
        selected: true
      }
    ]
  };
}

function createSurfaceContent() {
  return createClipperSurfaceContent({
    selectedText: 'Selected text',
    commentPlaceholder: 'Comment',
    labels: {
      title: 'Clip selection',
      selectionPreview: 'Selection preview',
      commentLabel: 'Comment'
    },
    source: {
      title: 'Article',
      host: 'example.com',
      initials: 'EX',
      verifiedLabel: 'Verified'
    },
    destination: createDestination(),
    actions: [],
    iconUrl: 'icons/60x60/zendio_icon_clipt.png'
  });
}

describe('runtimeSurfaceRenderer content translation context', () => {
  it('opens vault settings exactly once for a setup link inserted into an existing clipper', () => {
    const messaging = getService<PlatformServices>(TOKENS.platformServices).messaging;
    const send = vi.spyOn(messaging, 'send').mockResolvedValue(undefined);
    try {
      const surface = renderStitchRuntimeSurface({
        surfaceId: 'clipper',
        appData: createSurfaceContent()
      });
      expect(surface.querySelector('.export-destination-setup-link')).toBeNull();
      expect(
        patchExportDestinationRow(surface, {
          ...createDestination(),
          hasConfiguredVault: false,
          setupUrl: 'chrome-extension://test/options/index.html#section-storage'
        })
      ).toBe(true);
      const link = surface.querySelector<HTMLAnchorElement>('.export-destination-setup-link');
      if (!link) throw new Error('Expected recreated vault setup link');
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      link.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(send).toHaveBeenCalledExactlyOnceWith({
        type: 'openOptionsPage',
        section: 'section-storage'
      });
    } finally {
      send.mockRestore();
    }
  });

  beforeEach(() => {
    getContentI18nResourceMock.mockReset();
    getContentI18nResourceMock.mockReturnValue(null);
  });

  it.each<I18nResource['language']>([
    'en',
    'zh-CN',
    'zh-TW',
    'de',
    'fr',
    'ja',
    'ko',
    'it',
    'pt-BR',
    'ru',
    'es-ES',
    'es-419'
  ])('renders already localized session counters once in %s', async (language) => {
    const messages = await getMessagesForLanguage(language);
    getContentI18nResourceMock.mockReturnValue(
      createI18nResource({ language, messages, fallbackChain: [] })
    );
    for (const count of [4, 0, 1]) {
      const readerCounter =
        count === 0
          ? messages.readerPanelCounterZero
          : messages.readerPanelCounter.replace('{count}', String(count));
      const videoCounter =
        count === 0
          ? messages.videoPanelCounterZero
          : messages.videoPanelCounter.replace('{count}', String(count));
      const reader = renderStitchRuntimeSurface({
        surfaceId: 'reader',
        appData: createReaderSurfaceContent({
          texts: READER_MESSAGES.panel,
          highlights: [],
          counter: readerCounter,
          actions: [],
          iconUrl: 'icons/60x60/zendio_icon_readingt.png'
        })
      });
      const video = renderStitchRuntimeSurface({
        surfaceId: 'video',
        appData: createVideoSurfaceContent({
          texts: VIDEO_MESSAGES.panel,
          captures: [],
          counter: videoCounter,
          actions: [],
          iconUrl: 'icons/60x60/zendio_icon_videot.png'
        })
      });
      expect([
        reader.querySelector('.session-counter')?.textContent,
        video.querySelector('.session-counter')?.textContent
      ]).toEqual([readerCounter, videoCounter]);
      for (const panel of [reader, video]) {
        expect(panel.querySelector('.session-first-use-guide-title')?.textContent).toBe(
          messages.sessionPanelGuideTitle
        );
        expect(panel.querySelector('.session-first-use-guide-resize')?.textContent).toBe(
          messages.sessionPanelGuideResize
        );
        expect(panel.querySelector('.session-first-use-guide-settings')?.textContent).toBe(
          messages.sessionPanelGuideSettings
        );
      }
    }
  });

  it('updates guide language without replacing its button or changing acknowledgement state', async () => {
    const appData = createSurfaceContent();
    appData.video.labels.subtitle = 'Capture timestamps and quick notes';
    const handle = renderStitchRuntimeSessionSurface({ surfaceId: 'video', appData });
    const button = handle.root.querySelector('[data-action-id="session:dismissFirstUseGuide"]');
    const clicked = vi.fn();
    button?.addEventListener('click', clicked);
    handle.root.dataset.sessionFirstUse = 'true';
    const messages = await getMessagesForLanguage('zh-CN');
    getContentI18nResourceMock.mockReturnValue(
      createI18nResource({ language: 'zh-CN', messages, fallbackChain: [] })
    );
    const next = renderStitchRuntimeSessionTemplate({ surfaceId: 'video', appData });
    handle.patchChrome(next);
    expect(handle.root.dataset.sessionFirstUse).toBe('true');
    expect(handle.root.querySelector('.session-first-use-guide-title')?.textContent).toBe(
      messages.sessionPanelGuideTitle
    );
    expect(handle.root.querySelector('.session-first-use-guide-settings')?.textContent).toBe(
      messages.sessionPanelGuideSettings
    );
    expect(handle.root.querySelector('[data-action-id="session:dismissFirstUseGuide"]')).toBe(
      button
    );
    expect(button?.textContent).toBe(messages.infoDialogConfirm);
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicked).toHaveBeenCalledOnce();
    delete handle.root.dataset.sessionFirstUse;
    handle.patchChrome(next);
    expect(handle.root.dataset.sessionFirstUse).toBeUndefined();
    handle.dispose();
  });

  it('renders the mounted zh-CN schema copy from the current content resource', async () => {
    const messages = await getMessagesForLanguage('zh-CN');
    getContentI18nResourceMock.mockReturnValue(
      createI18nResource({ language: 'zh-CN', messages, fallbackChain: [] })
    );

    const rendered = renderStitchRuntimeSurface({
      surfaceId: 'clipper',
      appData: createSurfaceContent()
    });

    expect(rendered.querySelector('.export-destination-eyebrow')?.textContent).toBe('保存到');
  });

  it('preserves the schema English fallback when the content resource is absent', () => {
    const rendered = renderStitchRuntimeSurface({
      surfaceId: 'clipper',
      appData: createSurfaceContent()
    });

    expect(rendered.querySelector('.export-destination-eyebrow')?.textContent).toBe('Save to');
  });

  it('formats ICU values with the current resource language through the renderer context', async () => {
    const messages = await getMessagesForLanguage('en');
    getContentI18nResourceMock.mockReturnValue(
      createI18nResource({
        language: 'ru',
        messages: {
          ...messages,
          videoPanelCounter:
            '{count, plural, one {one item} few {few items} many {many items} other {other items}}'
        },
        fallbackChain: []
      })
    );
    const appData = createSurfaceContent();
    appData.video.counter = 2;
    appData.video.destination = createDestination();

    const rendered = renderStitchRuntimeSurface({ surfaceId: 'video', appData });

    expect(rendered.querySelector('.session-counter')?.textContent).toBe('few items');
  });

  it('keeps repeated destination action IDs outside the generic chrome patcher', () => {
    const currentData = createSurfaceContent();
    currentData.video.labels.subtitle = 'Video subtitle';
    currentData.video.destination = {
      id: 'vault-a',
      kind: 'vault',
      label: 'Vault A',
      path: 'Vault A/video.md',
      hasConfiguredVault: true,
      options: [
        {
          id: 'vault-a',
          kind: 'vault',
          label: 'Vault A',
          path: 'Vault A/video.md',
          selected: true
        },
        {
          id: 'downloads',
          kind: 'downloads',
          label: 'Downloads',
          path: 'Downloads/video.md',
          selected: false
        }
      ]
    };
    const handle = renderStitchRuntimeSessionSurface({
      surfaceId: 'video',
      appData: currentData
    });
    const nextData = createSurfaceContent();
    nextData.video.labels.subtitle = 'Updated video subtitle';
    nextData.video.destination = {
      ...currentData.video.destination,
      id: 'downloads',
      kind: 'downloads',
      label: 'Downloads',
      path: 'Downloads/video.md',
      options: currentData.video.destination.options.map((option) => ({
        ...option,
        selected: option.id === 'downloads'
      }))
    };
    const next = renderStitchRuntimeSessionTemplate({ surfaceId: 'video', appData: nextData });
    const currentButtons = Array.from(
      handle.root.querySelectorAll<HTMLElement>('.export-destination-option')
    );

    const counterfactual = handle.root.cloneNode(true);
    if (!(counterfactual instanceof HTMLElement)) {
      throw new Error('Counterfactual runtime surface must be an element');
    }
    next.querySelectorAll<HTMLElement>('.export-destination-option').forEach((nextButton) => {
      const firstMatch = Array.from(
        counterfactual.querySelectorAll<HTMLElement>('[data-action-id]')
      ).find((candidate) => candidate.dataset.actionId === nextButton.dataset.actionId);
      if (firstMatch && nextButton.dataset.destinationId) {
        firstMatch.dataset.destinationId = nextButton.dataset.destinationId;
      }
    });
    const corruptedIds = Array.from(
      counterfactual.querySelectorAll<HTMLElement>('.export-destination-option')
    ).map((button) => button.dataset.destinationId);
    expect(corruptedIds).toEqual(['downloads', 'downloads']);
    expect(new Set(corruptedIds).size).not.toBe(corruptedIds.length);

    handle.patchChrome(next);
    expect(
      Array.from(handle.root.querySelectorAll<HTMLElement>('.export-destination-option'))
    ).toEqual(currentButtons);
    expect(currentButtons.map((button) => button.dataset.destinationId)).toEqual([
      'vault-a',
      'downloads'
    ]);
    handle.dispose();
  });
});

describe('content i18n schema asset lifecycle', () => {
  beforeEach(async () => {
    const context =
      await vi.importActual<typeof import('@content/i18n/context')>('@content/i18n/context');
    context.disposeContentI18n();
    contentI18nControllerHarness.state.resource = null;
    contentI18nControllerHarness.load.mockReset();
    contentI18nControllerHarness.load.mockResolvedValue(undefined);
    contentI18nControllerHarness.mount.mockReset();
    contentI18nControllerHarness.dispose.mockReset();
    contentI18nControllerHarness.createController.mockClear();
    contentI18nControllerHarness.configureStorage.mockClear();
    loadSchemaMessagesAssetMock.mockReset();
  });

  async function createRuntimeOnlyZhResource(): Promise<I18nResource> {
    const definition = await loadRuntimeLocaleAsset('zh-CN');
    return createI18nResource({
      language: 'zh-CN',
      messages: definition.runtime,
      fallbackChain: []
    });
  }

  it('keeps mounting with the schema fallback when the schema asset fails', async () => {
    const context =
      await vi.importActual<typeof import('@content/i18n/context')>('@content/i18n/context');
    const resource = await createRuntimeOnlyZhResource();
    contentI18nControllerHarness.state.resource = resource;
    loadSchemaMessagesAssetMock.mockRejectedValueOnce(new Error('schema unavailable'));

    await expect(context.ensureContentI18n(document)).resolves.toBe(
      contentI18nControllerHarness.controller
    );

    expect(contentI18nControllerHarness.mount).toHaveBeenCalledOnce();
    expect(
      context.createContentI18nTranslator(resource)?.('schemaRuntimeSurfaceSaveToLabel', 'Save to')
    ).toBe('Save to');
  });

  it('retries and recovers the schema translator after an earlier asset failure', async () => {
    const context =
      await vi.importActual<typeof import('@content/i18n/context')>('@content/i18n/context');
    const resource = await createRuntimeOnlyZhResource();
    contentI18nControllerHarness.state.resource = resource;
    loadSchemaMessagesAssetMock
      .mockRejectedValueOnce(new Error('schema unavailable'))
      .mockResolvedValueOnce({ schemaRuntimeSurfaceSaveToLabel: '保存到' });

    await context.ensureContentI18n(document);
    await context.ensureContentI18n(document);

    expect(loadSchemaMessagesAssetMock).toHaveBeenCalledTimes(2);
    expect(
      context.createContentI18nTranslator(resource)?.('schemaRuntimeSurfaceSaveToLabel', 'Save to')
    ).toBe('保存到');
  });

  it('ignores a late schema completion after disposal without mounting or restoring its cache', async () => {
    const context =
      await vi.importActual<typeof import('@content/i18n/context')>('@content/i18n/context');
    const resource = await createRuntimeOnlyZhResource();
    const schemaGate = createDeferred<Record<string, string>>();
    contentI18nControllerHarness.state.resource = resource;
    loadSchemaMessagesAssetMock.mockReturnValueOnce(schemaGate.promise);

    const pendingEnsure = context.ensureContentI18n(document);
    await vi.waitFor(() => expect(loadSchemaMessagesAssetMock).toHaveBeenCalledOnce());
    context.disposeContentI18n();
    schemaGate.resolve({ schemaRuntimeSurfaceSaveToLabel: '保存到' });

    await expect(pendingEnsure).resolves.toBe(contentI18nControllerHarness.controller);
    expect(contentI18nControllerHarness.dispose).toHaveBeenCalledOnce();
    expect(contentI18nControllerHarness.mount).not.toHaveBeenCalled();
    expect(context.getContentI18nResource()).toBeNull();
    expect(
      context.createContentI18nTranslator(resource)?.('schemaRuntimeSurfaceSaveToLabel', 'Save to')
    ).toBe('Save to');
  });
});
