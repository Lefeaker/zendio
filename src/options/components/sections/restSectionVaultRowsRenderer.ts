import type { VaultConfig } from '@shared/types/vault';
import type { RestSectionMessagesLike } from './restSectionLayout';
import { buildRestVaultRow } from './restSectionLayout';
import { renderRestVaultRows } from './restSectionVaultRow';
import type { RestSectionLocalFolderActions } from './restSectionLocalFolders';

export function renderRestSectionVaultRows(params: {
  additionalRowsHost: HTMLElement | null;
  additionalEmptyHint: HTMLElement | null;
  vaults: VaultConfig[];
  defaultVaultId?: string;
  createElement: typeof document.createElement;
  messages: RestSectionMessagesLike | null;
  updateVault: (vaultId: string, updates: Partial<VaultConfig>) => void;
  removeVault: (vaultId: string) => void;
  localFolders: RestSectionLocalFolderActions;
}): void {
  renderRestVaultRows({
    additionalRowsHost: params.additionalRowsHost,
    additionalEmptyHint: params.additionalEmptyHint,
    vaults: params.vaults,
    ...(params.defaultVaultId !== undefined ? { defaultVaultId: params.defaultVaultId } : {}),
    createRow: (vault) =>
      buildRestVaultRow({
        createElement: params.createElement,
        messages: params.messages,
        vault,
        updateVault: params.updateVault,
        removeVault: params.removeVault,
        chooseLocalFolder: (targetVault) => {
          void params.localFolders.chooseVault(targetVault);
        },
        clearLocalFolder: (targetVault) => params.localFolders.clearVault(targetVault)
      })
  });
}
