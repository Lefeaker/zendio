/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import {
  ContentExportDestinationState,
  reconcileLiveExportDestinationRow
} from '@content/shared/exportDestinationState';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import type { CompleteOptions } from '@shared/types/options';
import { getRestDefaults } from '../../utils/restDefaults';
import type { ExportDestinationSurfacePreview } from '@ui/stitch-runtime';
import { el, renderRuntimeNode, surfaceComponents } from '@ui/stitch-runtime';
import { exportDestinationRow } from '@ui/stitch-surfaces/builders/surfaceChrome';
import { resolveClipperDestinationId } from '@content/clipper/components/clipperDialogBuildContext';
import { createTaskSuccessSurfaceContent } from '@content/stitch/runtimeSurfaceContent';
import { bindReaderDialogPanelEvents } from '@content/reader/ui/readerDialogPanelEvents';
import { bindVideoDialogPanelEvents } from '@content/video/ui/videoDialogPanelEvents';

const REST_DEFAULTS = getRestDefaults();

function eventPreview(ids: string[]): ExportDestinationSurfacePreview {
  const selected = ids[0] ?? 'downloads';
  return {
    id: selected,
    kind: selected === 'downloads' ? 'downloads' : 'vault',
    label: selected,
    path: 'notes/item.md',
    hasConfiguredVault: ids.some((id) => id !== 'downloads'),
    options: ids.map((id) => ({
      id,
      kind: id === 'downloads' ? 'downloads' : 'vault',
      label: id,
      path: `notes/${id}.md`,
      selected: id === selected
    }))
  };
}

function renderedDestination(onSelect: (id: string) => void): HTMLElement {
  const row = renderRuntimeNode(exportDestinationRow(eventPreview(['downloads'])), {
    appData: createTaskSuccessSurfaceContent(),
    state: { previewTheme: 'dark' },
    el,
    ui: surfaceComponents,
    dispatch: (_id, _args, _value, event) => {
      const id = resolveClipperDestinationId(event);
      if (id) onSelect(id);
    }
  });
  if (!(row instanceof HTMLElement)) throw new Error('Destination row missing');
  return row;
}

function requiredElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`Element missing: ${selector}`);
  return element;
}

describe('real destination renderer event ownership', () => {
  it('dispatches newly inserted nested options exactly once through a stable container', () => {
    const seen: string[] = [];
    const root = document.createElement('div');
    const row = renderedDestination((id) => seen.push(id));
    root.append(row);
    const container = requiredElement(row, '.export-destination-options');
    const downloads = requiredElement(row, '[data-destination-id="downloads"]');
    downloads.click();
    expect(seen).toEqual(['downloads']);
    seen.length = 0;
    expect(reconcileLiveExportDestinationRow(root, eventPreview(['vault-a', 'downloads']))).toBe(
      true
    );
    expect(root.firstChild).toBe(row);
    expect(requiredElement(row, '.export-destination-options')).toBe(container);
    expect(requiredElement(row, '[data-destination-id="downloads"]')).toBe(downloads);
    const inserted = requiredElement(row, '[data-destination-id="vault-a"]');
    requiredElement(inserted, 'span').click();
    expect(seen).toEqual(['vault-a']);
    for (let index = 0; index < 20; index += 1) {
      expect(reconcileLiveExportDestinationRow(root, eventPreview(['vault-a', 'downloads']))).toBe(
        true
      );
    }
    seen.length = 0;
    inserted.click();
    requiredElement(downloads, 'span').click();
    expect(seen).toEqual(['vault-a', 'downloads']);
    seen.length = 0;
    container.click();
    requiredElement(row, 'summary').click();
    if (!(inserted instanceof HTMLButtonElement)) throw new Error('Expected native button');
    inserted.disabled = true;
    requiredElement(inserted, 'span').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(seen).toEqual([]);
    inserted.disabled = false;
    expect(reconcileLiveExportDestinationRow(root, eventPreview(['downloads']))).toBe(true);
    requiredElement(inserted, 'span').click();
    expect(seen).toEqual([]);
  });

  it.each([
    { name: 'Reader', bind: bindReaderDialogPanelEvents },
    { name: 'Video', bind: bindVideoDialogPanelEvents }
  ])('$name retains one delegated owner after cloning and disposes it', ({ bind }) => {
    const direct = vi.fn<(id: string) => void>();
    const root = document.createElement('div');
    root.append(renderedDestination(direct).cloneNode(true));
    const selectDestination = vi.fn<(id: string) => void>();
    const noop = () => undefined;
    const handle = {
      root,
      dialog: root,
      sessionWindow: root,
      sessionModal: root,
      collapseTrigger: document.createElement('button'),
      itemList: root,
      status: root,
      patchChrome: noop,
      updateSessionPresentation: noop,
      dispose: noop
    };
    const handlers = {
      isCollapsed: () => false,
      expandCollapsedPanel: noop,
      finish: noop,
      cancel: noop,
      toggleCollapse: noop,
      selectDestination,
      deleteHighlight: noop,
      saveHighlight: noop,
      focusHighlight: noop,
      focusInput: noop,
      input: noop,
      keydown: noop,
      addCapture: noop,
      deleteCapture: noop,
      toggleScreenshot: noop,
      focusCapture: noop,
      blurInput: noop
    };
    const dispose = bind(handle, handlers);
    expect(reconcileLiveExportDestinationRow(root, eventPreview(['vault-a', 'downloads']))).toBe(
      true
    );
    requiredElement(root, '[data-destination-id="vault-a"] span').click();
    requiredElement(root, '[data-destination-id="downloads"]').click();
    expect(selectDestination.mock.calls).toEqual([['vault-a'], ['downloads']]);
    expect(direct).not.toHaveBeenCalled();
    dispose();
    requiredElement(root, '[data-destination-id="vault-a"]').click();
    expect(selectDestination).toHaveBeenCalledTimes(2);
  });
});

function createOptions(
  vaults: NonNullable<CompleteOptions['vaultRouter']>['vaults']
): CompleteOptions {
  return mergeOptions({
    rest: { vault: '', baseUrl: '', apiKey: '' },
    templates: { article: 'Articles/{title}.md' },
    vaultRouter: {
      defaultVaultId: vaults[0]?.id ?? 'default',
      vaults,
      rules: []
    }
  });
}

function createVault(id: string, name: string) {
  return {
    id,
    name,
    vault: name,
    localFolderId: `folder-${id}`,
    localFolderName: name,
    httpsUrl: `https://localhost:${REST_DEFAULTS.httpsPort}`,
    httpUrl: `http://localhost:${REST_DEFAULTS.httpPort}`,
    apiKey: '',
    enabled: true,
    isDefault: id === 'default'
  };
}

function createPayload() {
  return {
    title: 'Live destination',
    markdown: 'Body',
    type: 'article' as const,
    meta: { url: 'https://example.com/article', domain: 'example.com' }
  };
}

function createRepository(initial: CompleteOptions) {
  let listener: ((options: CompleteOptions) => void) | undefined;
  const unsubscribe = vi.fn();
  const repository: IOptionsRepository = {
    get: vi.fn(() => Promise.resolve(initial)),
    patch: vi.fn(() => Promise.resolve(initial)),
    replace: vi.fn(() => Promise.resolve(initial)),
    onChange: vi.fn((nextListener: (options: CompleteOptions) => void) => {
      listener = nextListener;
      return unsubscribe;
    })
  };

  return {
    repository,
    unsubscribe,
    emit: (options: CompleteOptions) => listener?.(options)
  };
}

describe('ContentExportDestinationState live runtime projection', () => {
  it('inserts and renames destination options without replacing the mounted row', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="export-destination-row" data-live-runtime-marker="same-row">
        <details class="export-destination-menu">
          <summary>
            <strong class="export-destination-label">Downloads</strong>
            <span class="export-destination-path">Downloads/live-destination.md</span>
          </summary>
          <div class="export-destination-options">
            <button class="export-destination-option is-selected" data-destination-id="downloads">
              <span class="export-destination-option-label">Downloads</span>
              <span class="export-destination-option-path">Downloads/live-destination.md</span>
            </button>
          </div>
        </details>
        <a class="export-destination-setup-link" href="https://example.com/setup">Configure</a>
      </div>
    `;
    const mountedRow = root.querySelector('.export-destination-row');
    const createPreview = (label: string): ExportDestinationSurfacePreview => ({
      id: 'default',
      kind: 'vault',
      label,
      path: 'Articles/live-destination.md',
      hasConfiguredVault: true,
      options: [
        {
          id: 'default',
          kind: 'vault',
          label,
          path: 'Articles/live-destination.md',
          selected: true
        },
        {
          id: 'downloads',
          kind: 'downloads',
          label: 'Downloads',
          path: 'Downloads/live-destination.md',
          selected: false
        }
      ]
    });

    expect(reconcileLiveExportDestinationRow(root, createPreview('Current Live Vault'))).toBe(true);
    expect(root.querySelector('.export-destination-row')).toBe(mountedRow);
    expect(root.querySelector('.export-destination-label')?.textContent).toBe('Current Live Vault');
    expect(
      Array.from(root.querySelectorAll<HTMLElement>('[data-destination-id]')).map(
        (button) => button.dataset.destinationId
      )
    ).toEqual(['default', 'downloads']);

    expect(reconcileLiveExportDestinationRow(root, createPreview('Live Renamed Vault'))).toBe(true);
    expect(root.querySelector('.export-destination-row')).toBe(mountedRow);
    expect(mountedRow?.getAttribute('data-live-runtime-marker')).toBe('same-row');
    expect(root.querySelector('.export-destination-label')?.textContent).toBe('Live Renamed Vault');
  });

  it('projects configured-vault creation and rename into an already-open implicit destination', async () => {
    const fixture = createRepository(createOptions([]));
    const state = new ContentExportDestinationState(
      fixture.repository,
      createPayload,
      'chrome-extension://test/options/index.html#storage'
    );
    const updates = vi.fn();

    await state.startWatching(updates);
    expect(updates).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'downloads', label: 'Downloads' })
    );

    fixture.emit(createOptions([createVault('default', 'Current Live Vault')]));
    await vi.waitFor(() => {
      expect(updates).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 'default', label: 'Current Live Vault' })
      );
    });

    fixture.emit(createOptions([createVault('default', 'Live Renamed Vault')]));
    await vi.waitFor(() => {
      expect(updates).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 'default', label: 'Live Renamed Vault' })
      );
    });
    expect(state.metadata).toEqual({ kind: 'vault', vaultId: 'default' });
  });

  it('keeps an explicit Downloads selection across later repository changes', async () => {
    const fixture = createRepository(createOptions([]));
    const state = new ContentExportDestinationState(fixture.repository, createPayload);
    state.select('downloads');
    const updates = vi.fn();

    await state.startWatching(updates);
    fixture.emit(createOptions([createVault('default', 'Current Live Vault')]));

    await vi.waitFor(() => {
      expect(updates).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 'downloads', label: 'Downloads' })
      );
    });
  });

  it('unsubscribes once and ignores a queued live delivery after disposal', async () => {
    let releasePayload: (() => void) | undefined;
    const fixture = createRepository(createOptions([]));
    const state = new ContentExportDestinationState(fixture.repository, () => {
      if (!releasePayload) {
        return createPayload();
      }
      releasePayload();
      return createPayload();
    });
    const updates = vi.fn();

    await state.startWatching(updates);
    updates.mockClear();
    const queued = new Promise<void>((resolve) => {
      releasePayload = resolve;
    });
    fixture.emit(createOptions([createVault('default', 'Late Vault')]));
    state.dispose();
    state.dispose();
    await queued;
    await Promise.resolve();

    expect(fixture.unsubscribe).toHaveBeenCalledTimes(1);
    expect(updates).not.toHaveBeenCalled();
  });
});
