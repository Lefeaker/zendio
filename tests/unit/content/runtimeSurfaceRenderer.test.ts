/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18nResource } from '@i18n/resource';
import { getMessagesForLanguage, type I18nResource } from '@i18n';
import { loadRuntimeLocaleAsset } from '@i18n/runtime/assets';
import { createClipperSurfaceContent } from '@content/stitch/runtimeSurfaceContent';
import { renderStitchRuntimeSurface } from '@content/stitch/runtimeSurfaceRenderer';
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
  beforeEach(() => {
    getContentI18nResourceMock.mockReset();
    getContentI18nResourceMock.mockReturnValue(null);
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
    appData.video.counter = '2';
    appData.video.destination = createDestination();

    const rendered = renderStitchRuntimeSurface({ surfaceId: 'video', appData });

    expect(rendered.querySelector('.session-counter')?.textContent).toBe('few items');
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
