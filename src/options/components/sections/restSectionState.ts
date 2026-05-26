import type { CompleteOptions, RestOptions, StoredOptions } from '@shared/types/options';
import type { VaultConfig } from '@shared/types/vault';
import type { VaultRouterConfig } from '@shared/types';
import type {
  RestSectionBaseInputs,
  RestSectionLocalFolderInput
} from '@options/app/rest-settings/restSectionStateCore';
import {
  applyRestBaseSectionSnapshot,
  collectAdditionalVaultConfigsCore,
  collectRestBaseChanges,
  collectRestBaseDraft,
  resolveDefaultVault
} from '@options/app/rest-settings/restSectionStateCore';
export { readRestRowValue } from '@options/app/rest-settings/restSectionStateCore';

export interface RestSectionDefaultInputs
  extends RestSectionBaseInputs, RestSectionLocalFolderInput {}

export function resolveRestDefaultVaultId(
  vaults: VaultConfig[] | undefined,
  defaultVaultId: string | undefined | null
): string | null {
  return defaultVaultId ?? vaults?.find((vault) => vault.isDefault)?.id ?? vaults?.[0]?.id ?? null;
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
  const baseResolved = applyRestBaseSectionSnapshot({
    options,
    defaultInputs,
    defaultVaultId,
    vaultRouterSnapshot,
    defaults
  });
  const defaultVault = resolveDefaultVault(vaultRouterSnapshot, defaultVaultId);

  const resolved = {
    ...baseResolved,
    localFolderId: rest.localFolderId ?? defaultVault?.localFolderId ?? '',
    localFolderName: rest.localFolderName ?? defaultVault?.localFolderName ?? ''
  };

  updateLocalFolderButton(
    defaultInputs.localFolderButton ?? null,
    resolved.localFolderId,
    resolved.localFolderName
  );

  return resolved;
}

export function collectRestSectionChanges(params: {
  previous: StoredOptions | null;
  defaultInputs: RestSectionDefaultInputs;
  defaults: RestOptions;
}): Partial<CompleteOptions> {
  const { defaultInputs } = params;
  const baseChanges = collectRestBaseChanges(params);
  const rest = baseChanges.rest ?? {};
  const localFolderId = defaultInputs.localFolderButton?.dataset.localFolderId?.trim() ?? '';
  const localFolderName = defaultInputs.localFolderButton?.dataset.localFolderName?.trim() ?? '';

  return {
    rest: {
      ...rest,
      ...(localFolderId ? { localFolderId } : {}),
      ...(localFolderName ? { localFolderName } : {})
    }
  };
}

export function collectRestDraftForTest(
  defaultInputs: RestSectionDefaultInputs
): Partial<RestOptions> {
  const draft = collectRestBaseDraft(defaultInputs);
  const localFolderId = defaultInputs.localFolderButton?.dataset.localFolderId?.trim() ?? '';
  const localFolderName = defaultInputs.localFolderButton?.dataset.localFolderName?.trim() ?? '';

  if (localFolderId) {
    draft.localFolderId = localFolderId;
  }
  if (localFolderName) {
    draft.localFolderName = localFolderName;
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

export function collectAdditionalVaultConfigsForTest(params: {
  additionalRowsHost: HTMLElement | null;
  vaultRouterSnapshot: VaultRouterConfig | null;
  defaultVaultId: string | null;
}): VaultConfig[] {
  return collectAdditionalVaultConfigsCore({ ...params, includeLocalFolder: true });
}
