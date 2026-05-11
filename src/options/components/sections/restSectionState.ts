import type { CompleteOptions, RestOptions, StoredOptions } from '@shared/types/options';
import type { VaultConfig } from '@shared/types/vault';
import type { VaultRouterConfig } from '@shared/types';

export interface RestSectionDefaultInputs {
  nameInput: HTMLInputElement | null;
  localFolderButton?: HTMLButtonElement | null;
  httpsInput: HTMLInputElement | null;
  httpInput: HTMLInputElement | null;
  apiKeyInput: HTMLInputElement | null;
}

export function resolveRestDefaultVaultId(
  vaults: VaultConfig[] | undefined,
  defaultVaultId: string | undefined | null
): string | null {
  return defaultVaultId ?? vaults?.find((vault) => vault.isDefault)?.id ?? vaults?.[0]?.id ?? null;
}

function resolveDefaultVault(
  snapshot: VaultRouterConfig | null,
  defaultVaultId: string | null
): VaultConfig | undefined {
  return (
    snapshot?.vaults.find(
      (vault) => vault.id === (snapshot.defaultVaultId ?? defaultVaultId ?? '')
    ) ?? snapshot?.vaults[0]
  );
}

export function applyRestSectionSnapshot(params: {
  options: StoredOptions | CompleteOptions;
  defaultInputs: RestSectionDefaultInputs;
  defaultVaultId: string | null;
  vaultRouterSnapshot: VaultRouterConfig | null;
  defaults: RestOptions;
}): {
  name: string;
  localFolderId: string;
  localFolderName: string;
  httpsUrl: string;
  httpUrl: string;
  apiKey: string;
} {
  const { options, defaultInputs, defaultVaultId, vaultRouterSnapshot, defaults } = params;
  const rest = (options.rest ?? {}) as Partial<RestOptions>;
  const defaultVault = resolveDefaultVault(vaultRouterSnapshot, defaultVaultId);

  const resolved = {
    name: rest.vault ?? defaultVault?.vault ?? defaults.vault,
    localFolderId: rest.localFolderId ?? defaultVault?.localFolderId ?? '',
    localFolderName: rest.localFolderName ?? defaultVault?.localFolderName ?? '',
    httpsUrl: rest.httpsUrl ?? defaultVault?.httpsUrl ?? '',
    httpUrl: rest.httpUrl ?? defaultVault?.httpUrl ?? '',
    apiKey: rest.apiKey ?? defaultVault?.apiKey ?? ''
  };

  if (defaultInputs.nameInput) {
    defaultInputs.nameInput.value = resolved.name;
  }
  updateLocalFolderButton(
    defaultInputs.localFolderButton ?? null,
    resolved.localFolderId,
    resolved.localFolderName
  );
  if (defaultInputs.httpsInput) {
    defaultInputs.httpsInput.value = resolved.httpsUrl;
  }
  if (defaultInputs.httpInput) {
    defaultInputs.httpInput.value = resolved.httpUrl;
  }
  if (defaultInputs.apiKeyInput) {
    defaultInputs.apiKeyInput.value = resolved.apiKey;
  }

  return resolved;
}

export function collectRestSectionChanges(params: {
  previous: StoredOptions | null;
  defaultInputs: RestSectionDefaultInputs;
  defaults: RestOptions;
}): Partial<CompleteOptions> {
  const { previous, defaultInputs, defaults } = params;
  const previousRest = previous?.rest ?? null;

  const https = defaultInputs.httpsInput?.value.trim() ?? '';
  const http = defaultInputs.httpInput?.value.trim() ?? '';
  const vault = defaultInputs.nameInput?.value.trim() ?? '';
  const localFolderId = defaultInputs.localFolderButton?.dataset.localFolderId?.trim() ?? '';
  const localFolderName = defaultInputs.localFolderButton?.dataset.localFolderName?.trim() ?? '';
  const apiKey = defaultInputs.apiKeyInput?.value ?? '';

  const httpsUrl = https.length > 0 ? https : undefined;
  const httpUrl = http.length > 0 ? http : undefined;
  const resolvedVault = vault.length > 0 ? vault : defaults.vault;
  const baseUrl = httpsUrl || httpUrl || defaults.baseUrl;

  return {
    rest: {
      baseUrl,
      vault: resolvedVault,
      apiKey,
      ...(httpsUrl !== undefined && { httpsUrl }),
      ...(httpUrl !== undefined && { httpUrl }),
      ...(previousRest?.rootDir !== undefined && { rootDir: previousRest.rootDir }),
      ...(localFolderId ? { localFolderId } : {}),
      ...(localFolderName ? { localFolderName } : {})
    }
  };
}

export function collectRestDraftForTest(
  defaultInputs: RestSectionDefaultInputs
): Partial<RestOptions> {
  const httpsInput = defaultInputs.httpsInput?.value.trim() ?? '';
  const httpInput = defaultInputs.httpInput?.value.trim() ?? '';
  const vaultInput = defaultInputs.nameInput?.value.trim() ?? '';
  const localFolderId = defaultInputs.localFolderButton?.dataset.localFolderId?.trim() ?? '';
  const localFolderName = defaultInputs.localFolderButton?.dataset.localFolderName?.trim() ?? '';
  const apiKeyInput = defaultInputs.apiKeyInput?.value ?? '';

  const draft: Partial<RestOptions> = {};
  if (httpsInput) {
    draft.httpsUrl = httpsInput;
  }
  if (httpInput) {
    draft.httpUrl = httpInput;
  }
  if (vaultInput) {
    draft.vault = vaultInput;
  }
  if (localFolderId) {
    draft.localFolderId = localFolderId;
  }
  if (localFolderName) {
    draft.localFolderName = localFolderName;
  }
  if (apiKeyInput) {
    draft.apiKey = apiKeyInput;
  }
  const baseCandidate = httpsInput || httpInput;
  if (baseCandidate) {
    draft.baseUrl = baseCandidate;
  }
  return draft;
}

export function updateLocalFolderButton(
  button: HTMLButtonElement | null,
  localFolderId: string | undefined,
  localFolderName: string | undefined
): void {
  if (!button) {
    return;
  }
  const resolvedName = localFolderName ?? '';
  button.dataset.localFolderId = localFolderId ?? '';
  button.dataset.localFolderName = resolvedName;
  button.textContent = resolvedName || '选择目录';
  const clearButton = button
    .closest('.flex')
    ?.querySelector<HTMLButtonElement>('.rest-vault-local-folder-clear');
  if (clearButton) {
    clearButton.hidden = !localFolderId;
  }
}

export function readRestRowValue(row: HTMLElement, selector: string, trim = true): string | null {
  const input = row.querySelector<HTMLInputElement>(selector);
  if (!input) {
    return null;
  }
  const value = input.value ?? '';
  return trim ? value.trim() : value;
}

export function collectAdditionalVaultConfigsForTest(params: {
  additionalRowsHost: HTMLElement | null;
  vaultRouterSnapshot: VaultRouterConfig | null;
  defaultVaultId: string | null;
}): VaultConfig[] {
  const { additionalRowsHost, vaultRouterSnapshot, defaultVaultId } = params;
  const vaults = vaultRouterSnapshot?.vaults ?? [];
  const resolvedDefaultId =
    vaultRouterSnapshot?.defaultVaultId ?? defaultVaultId ?? vaults[0]?.id ?? null;

  return vaults
    .filter((vault) => vault.id !== resolvedDefaultId)
    .map((vault) => {
      const row = additionalRowsHost?.querySelector<HTMLElement>(`[data-vault-id="${vault.id}"]`);
      if (!row) {
        return vault;
      }

      const enabledToggle = row.querySelector<HTMLInputElement>('.rest-vault-enabled');
      const https = readRestRowValue(row, '.rest-vault-https');
      const http = readRestRowValue(row, '.rest-vault-http');
      const name = readRestRowValue(row, '.rest-vault-name');
      const apiKey = readRestRowValue(row, '.rest-vault-api', false);
      const localFolderButton = row.querySelector<HTMLButtonElement>('.rest-vault-local-folder');
      const localFolderId = localFolderButton?.dataset.localFolderId?.trim();
      const localFolderName = localFolderButton?.dataset.localFolderName?.trim();

      return {
        ...vault,
        ...(enabledToggle
          ? { enabled: enabledToggle.checked }
          : vault.enabled !== undefined
            ? { enabled: vault.enabled }
            : {}),
        ...(https !== null
          ? { httpsUrl: https }
          : vault.httpsUrl !== undefined
            ? { httpsUrl: vault.httpsUrl }
            : {}),
        ...(http !== null
          ? { httpUrl: http }
          : vault.httpUrl !== undefined
            ? { httpUrl: vault.httpUrl }
            : {}),
        vault: name ?? vault.vault,
        name: name ?? vault.name,
        apiKey: apiKey ?? vault.apiKey,
        ...(localFolderId !== undefined
          ? localFolderId
            ? { localFolderId }
            : {}
          : vault.localFolderId
            ? { localFolderId: vault.localFolderId }
            : {}),
        ...(localFolderName !== undefined
          ? localFolderName
            ? { localFolderName }
            : {}
          : vault.localFolderName
            ? { localFolderName: vault.localFolderName }
            : {})
      };
    })
    .filter((vault) => vault.enabled !== false);
}
