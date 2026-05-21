import type { VaultConfig, VaultRouterConfig } from '@shared/types/vault';
import type { ProductionStitchStorageControllerOptions } from './productionStitchStorageController';

export interface ProductionStitchStorageLoad {
  ensureVaultRouter(): VaultRouterConfig;
  syncDefaultRestFromVault(vault: VaultConfig): void;
  syncDefaultVaultFromRest(): void;
}

export function createProductionStitchStorageLoad(
  options: ProductionStitchStorageControllerOptions
): ProductionStitchStorageLoad {
  function ensureVaultRouter(): VaultRouterConfig {
    const draft = options.getDraft();
    if (!draft.vaultRouter?.vaults?.length) {
      draft.vaultRouter = {
        defaultVaultId: 'default',
        vaults: [
          {
            id: 'default',
            name: draft.rest.vault,
            vault: draft.rest.vault,
            ...(draft.rest.localFolderId ? { localFolderId: draft.rest.localFolderId } : {}),
            ...(draft.rest.localFolderName ? { localFolderName: draft.rest.localFolderName } : {}),
            httpsUrl: draft.rest.httpsUrl ?? draft.rest.baseUrl,
            httpUrl: draft.rest.httpUrl ?? draft.rest.baseUrl,
            apiKey: draft.rest.apiKey,
            enabled: true,
            isDefault: true
          }
        ],
        rules: []
      };
    }
    return draft.vaultRouter;
  }

  function syncDefaultRestFromVault(vault: VaultConfig): void {
    const draft = options.getDraft();
    draft.rest.vault = vault.name || vault.vault;
    draft.rest.baseUrl = vault.httpsUrl || vault.httpUrl || draft.rest.baseUrl;
    draft.rest.httpsUrl = vault.httpsUrl;
    draft.rest.httpUrl = vault.httpUrl;
    draft.rest.apiKey = vault.apiKey;
    draft.rest.localFolderId = vault.localFolderId;
    draft.rest.localFolderName = vault.localFolderName;
  }

  function syncDefaultVaultFromRest(): void {
    const draft = options.getDraft();
    const router = ensureVaultRouter();
    const defaultVault =
      router.vaults.find((vault) => vault.id === router.defaultVaultId) ?? router.vaults[0];
    if (!defaultVault) {
      return;
    }
    defaultVault.name = draft.rest.vault;
    defaultVault.vault = draft.rest.vault;
    defaultVault.httpsUrl = draft.rest.httpsUrl ?? draft.rest.baseUrl;
    defaultVault.httpUrl = draft.rest.httpUrl ?? draft.rest.baseUrl;
    defaultVault.apiKey = draft.rest.apiKey;
    defaultVault.localFolderId = draft.rest.localFolderId;
    defaultVault.localFolderName = draft.rest.localFolderName;
    defaultVault.enabled = true;
    defaultVault.isDefault = true;
  }

  return {
    ensureVaultRouter,
    syncDefaultRestFromVault,
    syncDefaultVaultFromRest
  };
}
