/* @vitest-environment jsdom */

import type { VideoDestinationBootstrap } from '@content/video/application/videoSessionPort';
import type { ExportDestinationSurfacePreview } from '@ui/stitch-runtime/types/surfaceTypes';
import { __resetContentSessionRegistryForTests } from '@content/runtime/contentSessionRegistry';
import { createSessionDraftRepository } from '@content/sessionDrafts/sessionDraftRepository';
import { configProvider } from '@shared/config';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import type { CompleteOptions } from '@shared/types/options';
import { VideoSession } from '@content/video/session';
import {
  buildVideoSessionDraftPayload,
  createVideoSessionDraftEnvelope
} from '@content/video/sessionDrafts';
import type { VideoSessionViewOptions } from '@content/video/application/videoSessionView';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDependencies,
  createView,
  getVideoSessionHarnessMocks,
  loadLatestVideoDraft,
  readVideoDraftPayload,
  resetVideoSessionHarnessMocks,
  restoreVideoSessionHarnessGlobals,
  toDraftControllerTestApi,
  toSessionTestApi
} from './videoSessionTestHarness';

const { exportMock } = getVideoSessionHarnessMocks();

function createVault(id: string, name: string) {
  const restDefaults = configProvider.getRestDefaults();
  return {
    id,
    name,
    vault: name,
    localFolderId: `folder-${id}`,
    localFolderName: name,
    httpsUrl: restDefaults.httpsUrl,
    httpUrl: restDefaults.httpUrl,
    apiKey: '',
    enabled: true,
    isDefault: false
  };
}

function createOptions(
  vaults: NonNullable<CompleteOptions['vaultRouter']>['vaults'],
  defaultVaultId = vaults[0]?.id ?? 'default'
): CompleteOptions {
  return mergeOptions({
    rest: { vault: '', baseUrl: '', apiKey: '' },
    templates: { video: 'Videos/{title}.md' },
    vaultRouter: { defaultVaultId, vaults, rules: [] }
  });
}

function installOptionsRepository(
  deps: ReturnType<typeof createDependencies>,
  initial: CompleteOptions
) {
  let current = initial;
  let listener: ((options: CompleteOptions) => void) | undefined;
  deps.optionsRepository = {
    get: vi.fn(() => Promise.resolve(current)),
    patch: vi.fn(() => Promise.resolve(current)),
    replace: vi.fn(() => Promise.resolve(current)),
    onChange: vi.fn<IOptionsRepository['onChange']>((nextListener) => {
      listener = nextListener;
      return () => {
        listener = undefined;
      };
    })
  } satisfies IOptionsRepository;
  return {
    emit(next: CompleteOptions) {
      current = next;
      listener?.(next);
    }
  };
}

async function seedRestorableDraft(
  deps: ReturnType<typeof createDependencies>,
  destination: { kind: 'downloads' } | { kind: 'vault'; vaultId: string }
): Promise<void> {
  const draft = createVideoSessionDraftEnvelope({
    draftId: 'restored-destination',
    pageUrl: document.location.href,
    pageTitle: 'Restored title',
    updatedAt: 2_000_000_000_100,
    status: 'restorable',
    payload: buildVideoSessionDraftPayload({
      captures: [
        {
          kind: 'timestamp',
          id: 'restored-capture',
          timeSec: 42,
          url: 'https://video.example/watch?t=42',
          comment: 'restored note',
          createdAt: 2_000_000_000_100
        }
      ],
      commentDrafts: { 'restored-capture': 'restored comment draft' },
      destination,
      platform: 'bilibili',
      videoId: 'BV1xx411c7mD',
      videoTitle: 'Restored title',
      videoUrl: document.location.href,
      canonicalUrl: document.location.href
    })
  });
  await createSessionDraftRepository(deps.storage.local).save(draft);
}

function createDestinationView() {
  const view = createView();
  view.updateDestination = vi.fn();
  return view;
}

describe('VideoSession destination bootstrap', () => {
  beforeEach(() => {
    document.body.innerHTML = '<h1>Video Title</h1><video></video>';
    document.title = 'Video Title___哔哩哔哩_bilibili';
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: vi.fn(),
      configurable: true
    });
    __resetContentSessionRegistryForTests(document);
    resetVideoSessionHarnessMocks();
  });

  afterEach(() => {
    restoreVideoSessionHarnessGlobals();
  });

  const explicitCases: {
    label: string;
    bootstrap: Extract<VideoDestinationBootstrap, { provenance: 'explicit' }>;
    initial: CompleteOptions;
    expected: Pick<ExportDestinationSurfacePreview, 'kind' | 'id'>;
  }[] = [
    {
      label: 'Downloads',
      bootstrap: { provenance: 'explicit', destination: { kind: 'downloads' } },
      initial: createOptions([createVault('default', 'Default Vault')]),
      expected: { kind: 'downloads', id: 'downloads' }
    },
    {
      label: 'Vault',
      bootstrap: {
        provenance: 'explicit',
        destination: { kind: 'vault', vaultId: 'selected' }
      },
      initial: createOptions(
        [createVault('default', 'Default Vault'), createVault('selected', 'Selected Vault')],
        'default'
      ),
      expected: { kind: 'vault', id: 'selected' }
    }
  ];
  it.each(explicitCases)(
    'uses explicit $label for first view, first draft, and export',
    async (fixture) => {
      const deps = createDependencies();
      installOptionsRepository(deps, fixture.initial);
      const createViewMock = vi.fn((_callbacks, _texts, _options?: VideoSessionViewOptions) =>
        createView()
      );
      deps.viewFactory.createView = createViewMock;
      const session = new VideoSession(document, deps);

      await session.start({ destinationBootstrap: fixture.bootstrap });

      expect(createViewMock.mock.calls[0]?.[2]?.initialDestination).toMatchObject(fixture.expected);
      session.ingestTextCapture('<p>Selected</p>', 'Selected', 'note');
      await toDraftControllerTestApi(session).flushNow('active');
      expect(readVideoDraftPayload(await loadLatestVideoDraft(deps))?.destination).toEqual(
        fixture.bootstrap.destination
      );
      await toSessionTestApi(session).finish();
      expect(exportMock).toHaveBeenCalledWith(
        expect.objectContaining({ exportDestination: fixture.bootstrap.destination })
      );
    }
  );

  it('keeps implicit bootstrap live while preserving restored capture and comment state', async () => {
    const deps = createDependencies();
    const repository = installOptionsRepository(deps, createOptions([]));
    await seedRestorableDraft(deps, { kind: 'vault', vaultId: 'restored' });
    const view = createDestinationView();
    const updateDestination = vi.spyOn(view, 'updateDestination');
    const createViewMock = vi.fn((_callbacks, _texts, _options?: VideoSessionViewOptions) => view);
    deps.viewFactory.createView = createViewMock;
    const session = new VideoSession(document, deps);
    const sessionApi = toSessionTestApi(session);

    await session.start({ destinationBootstrap: { provenance: 'implicit-default' } });

    expect(createViewMock.mock.calls[0]?.[2]?.initialDestination).toMatchObject({
      kind: 'downloads',
      id: 'downloads'
    });
    expect(sessionApi.state.captures).toEqual([
      expect.objectContaining({ id: 'restored-capture', comment: 'restored note' })
    ]);
    expect(sessionApi.state.commentDrafts).toEqual({
      'restored-capture': 'restored comment draft'
    });

    repository.emit(createOptions([createVault('live', 'Live Vault')], 'live'));
    await vi.waitFor(() => {
      expect(updateDestination).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'vault', id: 'live', label: 'Live Vault' })
      );
    });
    session.ingestTextCapture('<p>Selected</p>', 'Selected', 'note');
    await toDraftControllerTestApi(session).flushNow('active');
    expect(readVideoDraftPayload(await loadLatestVideoDraft(deps))?.destination).toEqual({
      kind: 'vault',
      vaultId: 'live'
    });
    await sessionApi.finish();
    expect(exportMock).toHaveBeenCalledWith(
      expect.objectContaining({ exportDestination: { kind: 'vault', vaultId: 'live' } })
    );
  });

  it('keeps explicit Downloads pinned across later default-vault insertion', async () => {
    const deps = createDependencies();
    const repository = installOptionsRepository(deps, createOptions([]));
    const view = createDestinationView();
    const updateDestination = vi.spyOn(view, 'updateDestination');
    deps.viewFactory.createView = vi.fn(() => view);
    const session = new VideoSession(document, deps);

    await session.start({
      destinationBootstrap: {
        provenance: 'explicit',
        destination: { kind: 'downloads' }
      }
    });
    repository.emit(createOptions([createVault('live', 'Live Vault')], 'live'));

    await vi.waitFor(() => {
      expect(updateDestination).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'downloads', id: 'downloads' })
      );
    });
    session.ingestTextCapture('<p>Selected</p>', 'Selected', 'note');
    await toDraftControllerTestApi(session).flushNow('active');
    expect(readVideoDraftPayload(await loadLatestVideoDraft(deps))?.destination).toEqual({
      kind: 'downloads'
    });
    toSessionTestApi(session).cleanup();
  });

  it('keeps an explicit Vault id pinned while refreshing its label', async () => {
    const deps = createDependencies();
    const repository = installOptionsRepository(
      deps,
      createOptions([createVault('selected', 'Original Name')], 'selected')
    );
    const view = createDestinationView();
    const updateDestination = vi.spyOn(view, 'updateDestination');
    deps.viewFactory.createView = vi.fn(() => view);
    const session = new VideoSession(document, deps);

    await session.start({
      destinationBootstrap: {
        provenance: 'explicit',
        destination: { kind: 'vault', vaultId: 'selected' }
      }
    });
    repository.emit(createOptions([createVault('selected', 'Renamed Vault')], 'selected'));

    await vi.waitFor(() => {
      expect(updateDestination).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 'selected', label: 'Renamed Vault' })
      );
    });
    session.ingestTextCapture('<p>Selected</p>', 'Selected', 'note');
    await toDraftControllerTestApi(session).flushNow('active');
    expect(readVideoDraftPayload(await loadLatestVideoDraft(deps))?.destination).toEqual({
      kind: 'vault',
      vaultId: 'selected'
    });
    toSessionTestApi(session).cleanup();
  });

  it('lets an ordinary no-bootstrap start restore its draft destination', async () => {
    const deps = createDependencies();
    installOptionsRepository(
      deps,
      createOptions([createVault('restored', 'Restored Vault')], 'restored')
    );
    await seedRestorableDraft(deps, { kind: 'vault', vaultId: 'restored' });
    const view = createDestinationView();
    const updateDestination = vi.spyOn(view, 'updateDestination');
    deps.viewFactory.createView = vi.fn(() => view);
    const session = new VideoSession(document, deps);

    await session.start();

    expect(updateDestination).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'vault', id: 'restored' })
    );
    session.ingestTextCapture('<p>Selected</p>', 'Selected', 'note');
    await toDraftControllerTestApi(session).flushNow('active');
    expect(readVideoDraftPayload(await loadLatestVideoDraft(deps))?.destination).toEqual({
      kind: 'vault',
      vaultId: 'restored'
    });
    toSessionTestApi(session).cleanup();
  });

  it('does not let a restored draft destination override an explicit bootstrap', async () => {
    const deps = createDependencies();
    installOptionsRepository(
      deps,
      createOptions([createVault('restored', 'Restored Vault')], 'restored')
    );
    await seedRestorableDraft(deps, { kind: 'vault', vaultId: 'restored' });
    const session = new VideoSession(document, deps);

    await session.start({
      destinationBootstrap: {
        provenance: 'explicit',
        destination: { kind: 'downloads' }
      }
    });

    session.ingestTextCapture('<p>Selected</p>', 'Selected', 'note');
    await toDraftControllerTestApi(session).flushNow('active');
    expect(readVideoDraftPayload(await loadLatestVideoDraft(deps))?.destination).toEqual({
      kind: 'downloads'
    });
    expect(toSessionTestApi(session).state.captures).toEqual([
      expect.objectContaining({ id: 'restored-capture' }),
      expect.objectContaining({ kind: 'fragment', selectedText: 'Selected' })
    ]);
    toSessionTestApi(session).cleanup();
  });
});
