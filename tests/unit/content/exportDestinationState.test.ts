import { describe, expect, it, vi } from 'vitest';
import { ContentExportDestinationState } from '@content/shared/exportDestinationState';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';
import type { CompleteOptions } from '@shared/types/options';
import { getRestDefaults } from '../../utils/restDefaults';

const REST_DEFAULTS = getRestDefaults();

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
  const repository = {
    get: vi.fn(() => Promise.resolve(initial)),
    onChange: vi.fn((nextListener: (options: CompleteOptions) => void) => {
      listener = nextListener;
      return unsubscribe;
    })
  } as unknown as IOptionsRepository;

  return {
    repository,
    unsubscribe,
    emit: (options: CompleteOptions) => listener?.(options)
  };
}

describe('ContentExportDestinationState live runtime projection', () => {
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
