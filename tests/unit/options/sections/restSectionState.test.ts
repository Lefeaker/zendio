/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '@shared/config';
import type { VaultRouterConfig } from '@shared/types';
import type { RestOptions } from '@shared/types/options';
import {
  applyRestSectionSnapshot,
  collectAdditionalVaultConfigsForTest,
  collectRestDraftForTest,
  collectRestSectionChanges,
  readRestRowValue,
  resolveRestDefaultVaultId,
  updateLocalFolderButton
} from '@options/components/sections/restSectionState';

const defaults = DEFAULT_OPTIONS.rest;

function createInputs() {
  return {
    nameInput: document.createElement('input'),
    localFolderButton: document.createElement('button'),
    httpsInput: document.createElement('input'),
    httpInput: document.createElement('input'),
    apiKeyInput: document.createElement('input')
  };
}

describe('restSectionState helpers', () => {
  it('resolves the default vault id from explicit, default, first, and empty inputs', () => {
    const vaults = [
      { id: 'one', vault: 'One', name: 'One', httpsUrl: '', httpUrl: '', apiKey: '', rules: [] },
      {
        id: 'two',
        vault: 'Two',
        name: 'Two',
        httpsUrl: '',
        httpUrl: '',
        apiKey: '',
        isDefault: true,
        rules: []
      }
    ];

    expect(resolveRestDefaultVaultId(vaults, 'explicit')).toBe('explicit');
    expect(resolveRestDefaultVaultId(vaults, null)).toBe('two');
    expect(resolveRestDefaultVaultId([{ ...vaults[0], isDefault: false }], undefined)).toBe('one');
    expect(resolveRestDefaultVaultId([], undefined)).toBeNull();
  });

  it('applies snapshots to present inputs while tolerating missing controls', () => {
    const inputs = createInputs();
    const folderWrap = document.createElement('div');
    folderWrap.className = 'flex';
    const clearButton = document.createElement('button');
    clearButton.className = 'rest-vault-local-folder-clear';
    folderWrap.append(inputs.localFolderButton, clearButton);

    const resolved = applyRestSectionSnapshot({
      options: { rest: { vault: 'StoredVault', apiKey: 'stored-key' } },
      defaultInputs: inputs,
      defaultVaultId: 'default',
      vaultRouterSnapshot: {
        defaultVaultId: 'default',
        vaults: [
          {
            id: 'default',
            vault: 'RouterVault',
            name: 'RouterVault',
            httpsUrl: 'https://router.example/',
            httpUrl: 'http://router.example/',
            apiKey: 'router-key',
            localFolderId: 'folder-1',
            localFolderName: 'Folder One',
            rules: []
          }
        ]
      },
      defaults
    });

    expect(resolved).toEqual({
      name: 'StoredVault',
      localFolderId: 'folder-1',
      localFolderName: 'Folder One',
      httpsUrl: 'https://router.example/',
      httpUrl: 'http://router.example/',
      apiKey: 'stored-key'
    });
    expect(inputs.nameInput.value).toBe('StoredVault');
    expect(inputs.localFolderButton.textContent).toBe('Folder One');
    expect(clearButton.hidden).toBe(false);

    expect(
      applyRestSectionSnapshot({
        options: {},
        defaultInputs: {
          nameInput: null,
          localFolderButton: null,
          httpsInput: null,
          httpInput: null,
          apiKeyInput: null
        },
        defaultVaultId: null,
        vaultRouterSnapshot: null,
        defaults
      }).name
    ).toBe(defaults.vault);
  });

  it('collects default vault changes and draft values from populated and blank inputs', () => {
    const inputs = createInputs();
    inputs.nameInput.value = '  DraftVault  ';
    inputs.httpsInput.value = '  https://draft.example/ ';
    inputs.httpInput.value = '';
    inputs.apiKeyInput.value = ' draft-key ';
    inputs.localFolderButton.dataset.localFolderId = ' folder-id ';
    inputs.localFolderButton.dataset.localFolderName = ' folder-name ';

    expect(
      collectRestSectionChanges({
        previous: { rest: { rootDir: 'LegacyRoot' } },
        defaultInputs: inputs,
        defaults
      })
    ).toEqual({
      rest: {
        baseUrl: 'https://draft.example/',
        vault: 'DraftVault',
        apiKey: ' draft-key ',
        httpsUrl: 'https://draft.example/',
        rootDir: 'LegacyRoot',
        localFolderId: 'folder-id',
        localFolderName: 'folder-name'
      }
    });

    expect(collectRestDraftForTest(inputs)).toEqual({
      httpsUrl: 'https://draft.example/',
      vault: 'DraftVault',
      localFolderId: 'folder-id',
      localFolderName: 'folder-name',
      apiKey: ' draft-key ',
      baseUrl: 'https://draft.example/'
    });

    const blankInputs = {
      nameInput: document.createElement('input'),
      httpsInput: document.createElement('input'),
      httpInput: document.createElement('input'),
      apiKeyInput: document.createElement('input')
    };
    expect(
      collectRestSectionChanges({
        previous: null,
        defaultInputs: {
          nameInput: null,
          localFolderButton: null,
          httpsInput: null,
          httpInput: null,
          apiKeyInput: null
        },
        defaults
      }).rest?.baseUrl
    ).toBe(defaults.baseUrl);
    expect(collectRestDraftForTest(blankInputs)).toEqual({});
  });

  it('updates local folder button metadata and reads row values safely', () => {
    const wrap = document.createElement('div');
    wrap.className = 'flex';
    const button = document.createElement('button');
    const clearButton = document.createElement('button');
    clearButton.className = 'rest-vault-local-folder-clear';
    wrap.append(button, clearButton);

    updateLocalFolderButton(button, 'folder-id', 'Folder');
    expect(button.dataset.localFolderId).toBe('folder-id');
    expect(button.dataset.localFolderName).toBe('Folder');
    expect(button.textContent).toBe('Folder');
    expect(clearButton.hidden).toBe(false);

    updateLocalFolderButton(button, undefined, undefined);
    expect(button.textContent).toBe('选择目录');
    expect(clearButton.hidden).toBe(true);
    expect(updateLocalFolderButton(null, 'ignored', 'ignored')).toBeUndefined();

    const row = document.createElement('div');
    row.innerHTML = '<input class="trimmed" value="  value  "><input class="raw" value="  raw  ">';
    expect(readRestRowValue(row, '.trimmed')).toBe('value');
    expect(readRestRowValue(row, '.raw', false)).toBe('  raw  ');
    expect(readRestRowValue(row, '.missing')).toBeNull();
  });

  it('collects additional vault rows with fallbacks, clearing, and disabled filtering', () => {
    const host = document.createElement('div');
    host.innerHTML = `
      <div data-vault-id="edited">
        <input class="rest-vault-enabled" type="checkbox" checked>
        <input class="rest-vault-name" value="Edited Vault">
        <input class="rest-vault-https" value="https://edited.example/">
        <input class="rest-vault-http" value="">
        <input class="rest-vault-api" value=" edited-key ">
        <button class="rest-vault-local-folder" data-local-folder-id="" data-local-folder-name=""></button>
      </div>
      <div data-vault-id="disabled">
        <input class="rest-vault-enabled" type="checkbox">
      </div>
    `;
    const snapshot: VaultRouterConfig = {
      defaultVaultId: 'default',
      vaults: [
        {
          id: 'default',
          vault: 'Default',
          name: 'Default',
          httpsUrl: '',
          httpUrl: '',
          apiKey: '',
          rules: []
        },
        {
          id: 'edited',
          vault: 'Original',
          name: 'Original',
          httpsUrl: 'https://original.example/',
          httpUrl: 'http://original.example/',
          apiKey: 'original-key',
          localFolderId: 'old-folder',
          localFolderName: 'Old Folder',
          rules: []
        },
        {
          id: 'missing-row',
          vault: 'Missing',
          name: 'Missing',
          httpsUrl: '',
          httpUrl: '',
          apiKey: '',
          enabled: true,
          rules: []
        },
        {
          id: 'disabled',
          vault: 'Disabled',
          name: 'Disabled',
          httpsUrl: '',
          httpUrl: '',
          apiKey: '',
          enabled: true,
          rules: []
        }
      ]
    };

    expect(
      collectAdditionalVaultConfigsForTest({
        additionalRowsHost: host,
        vaultRouterSnapshot: snapshot,
        defaultVaultId: null
      })
    ).toEqual([
      {
        id: 'edited',
        vault: 'Edited Vault',
        name: 'Edited Vault',
        httpsUrl: 'https://edited.example/',
        httpUrl: '',
        apiKey: ' edited-key ',
        enabled: true,
        localFolderId: 'old-folder',
        localFolderName: 'Old Folder',
        rules: []
      },
      {
        id: 'missing-row',
        vault: 'Missing',
        name: 'Missing',
        httpsUrl: '',
        httpUrl: '',
        apiKey: '',
        enabled: true,
        rules: []
      }
    ]);

    expect(
      collectAdditionalVaultConfigsForTest({
        additionalRowsHost: null,
        vaultRouterSnapshot: null,
        defaultVaultId: null
      })
    ).toEqual([]);
  });
});
