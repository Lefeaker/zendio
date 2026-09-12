import { describe, expect, it } from 'vitest';
import {
  composeDeviceLocalVaultBindings,
  normalizeDeviceLocalVaultBindingSnapshot,
  reconcileDeviceLocalVaultBindings,
  scrubDeviceLocalVaultBindings
} from '../../../src/shared/config/deviceLocalVaultBindings';
import { DEFAULT_OPTIONS } from '../../../src/shared/config/defaultOptions';
import type { CompleteOptions } from '../../../src/shared/types/options';

describe('device-local vault bindings', () => {
  it('scrubs REST and routed vault bindings without dropping opaque portable bytes', () => {
    expect(
      scrubDeviceLocalVaultBindings({
        rest: {
          vault: 'Primary',
          localFolderId: 'folder-primary',
          localFolderName: 'Primary Folder'
        },
        vaultRouter: {
          defaultVaultId: 'primary',
          vaults: [
            {
              id: 'primary',
              name: 'Primary',
              vault: 'Primary',
              httpsUrl: '',
              httpUrl: '',
              apiKey: '',
              localFolderId: 'folder-primary',
              localFolderName: 'Primary Folder'
            }
          ]
        },
        opaqueRoot: { keep: ['exact', 1] }
      })
    ).toEqual({
      rest: { vault: 'Primary' },
      vaultRouter: {
        defaultVaultId: 'primary',
        vaults: [
          {
            id: 'primary',
            name: 'Primary',
            vault: 'Primary',
            httpsUrl: '',
            httpUrl: '',
            apiKey: ''
          }
        ]
      },
      opaqueRoot: { keep: ['exact', 1] }
    });
  });

  it('keeps normalized local bindings authoritative and composes only configured stable ids', () => {
    const options: CompleteOptions = {
      ...structuredClone(DEFAULT_OPTIONS),
      vaultRouter: {
        defaultVaultId: 'primary',
        vaults: [
          {
            id: 'primary',
            name: 'Primary',
            vault: 'Primary',
            httpsUrl: '',
            httpUrl: '',
            apiKey: '',
            localFolderId: 'foreign-sync-id',
            localFolderName: 'Foreign Sync Name'
          }
        ]
      }
    };
    const snapshot = normalizeDeviceLocalVaultBindingSnapshot({
      version: 1,
      bindings: {
        primary: { folderId: 'folder-local', folderName: 'Local Folder' },
        removed: { folderId: 'folder-removed', folderName: 'Removed Folder' },
        invalid: { folderId: '', folderName: 'Invalid' }
      }
    });

    const reconciled = reconcileDeviceLocalVaultBindings(options, snapshot);
    const composed = composeDeviceLocalVaultBindings(options, reconciled);

    expect(reconciled.bindings).toEqual({
      primary: { folderId: 'folder-local', folderName: 'Local Folder' }
    });
    expect(composed.rest).toMatchObject({
      localFolderId: 'folder-local',
      localFolderName: 'Local Folder'
    });
    expect(composed.vaultRouter?.vaults[0]).toMatchObject({
      localFolderId: 'folder-local',
      localFolderName: 'Local Folder'
    });
  });

  it('F04 composes an ambiguous duplicate binding into the canonical first Vault only', () => {
    const options: CompleteOptions = {
      ...structuredClone(DEFAULT_OPTIONS),
      vaultRouter: {
        defaultVaultId: 'duplicate',
        vaults: [
          {
            id: 'duplicate',
            name: 'Canonical',
            vault: 'Canonical',
            httpsUrl: '',
            httpUrl: '',
            apiKey: ''
          },
          {
            id: 'duplicate',
            name: 'Requires reauthorization',
            vault: 'Duplicate',
            httpsUrl: '',
            httpUrl: '',
            apiKey: ''
          }
        ]
      }
    };
    const composed = composeDeviceLocalVaultBindings(options, {
      version: 1,
      bindings: {
        duplicate: { folderId: 'folder-canonical', folderName: 'Canonical Folder' }
      }
    });

    expect(composed.vaultRouter?.vaults[0]).toMatchObject({
      localFolderId: 'folder-canonical',
      localFolderName: 'Canonical Folder'
    });
    expect(composed.vaultRouter?.vaults[1]).not.toHaveProperty('localFolderId');
    expect(composed.vaultRouter?.vaults[1]).not.toHaveProperty('localFolderName');
  });
});
