import { getService, TOKENS } from '@shared/di';
import type { PlatformServices } from '@platform/types';
import type { VaultConfig } from '@shared/types/vault';
import { updateLocalFolderButton } from './restSectionState';

type LocalFolderSelection = { id: string; name: string };

export interface RestSectionLocalFolderActions {
  chooseDefault(): Promise<void>;
  clearDefault(): void;
  chooseVault(vault: VaultConfig): Promise<void>;
  clearVault(vault: VaultConfig): void;
}

export function createRestSectionLocalFolderActions(params: {
  getDefaultName: () => string | undefined;
  getDefaultButton: () => HTMLButtonElement | null;
  updateDefaultFolder: (selection: { id?: string | undefined; name?: string | undefined }) => void;
  updateVault: (id: string, updates: Partial<VaultConfig>) => void;
  renderError: (message: string) => void;
}): RestSectionLocalFolderActions {
  async function chooseLocalFolder(
    suggestedName: string | undefined
  ): Promise<LocalFolderSelection | null> {
    try {
      return await getService<PlatformServices>(
        TOKENS.platformServices
      ).fileSystemAccess.chooseDirectory({
        suggestedName
      });
    } catch (error) {
      console.warn('[RestSection] Failed to choose local vault folder:', error);
      params.renderError(
        '无法授权本地目录。Chromium 浏览器支持此功能，未授权时会继续使用 REST API。'
      );
      return null;
    }
  }
  async function removeLocalFolder(folderId: string | undefined): Promise<void> {
    if (!folderId) {
      return;
    }
    try {
      await getService<PlatformServices>(TOKENS.platformServices).fileSystemAccess.removeDirectory(
        folderId
      );
    } catch (error) {
      console.warn('[RestSection] Failed to remove stored local vault folder handle:', error);
    }
  }

  return {
    async chooseDefault(): Promise<void> {
      const previousFolderId = params.getDefaultButton()?.dataset.localFolderId || undefined;
      const selection = await chooseLocalFolder(params.getDefaultName());
      if (!selection) {
        return;
      }
      updateLocalFolderButton(params.getDefaultButton(), selection.id, selection.name);
      params.updateDefaultFolder(selection);
      if (previousFolderId !== selection.id) {
        void removeLocalFolder(previousFolderId);
      }
    },
    clearDefault(): void {
      const previousFolderId = params.getDefaultButton()?.dataset.localFolderId || undefined;
      updateLocalFolderButton(params.getDefaultButton(), undefined, undefined);
      params.updateDefaultFolder({});
      void removeLocalFolder(previousFolderId);
    },
    async chooseVault(vault: VaultConfig): Promise<void> {
      const selection = await chooseLocalFolder(vault.name || vault.vault);
      if (!selection) {
        return;
      }
      params.updateVault(vault.id, {
        localFolderId: selection.id,
        localFolderName: selection.name
      });
      if (vault.localFolderId !== selection.id) {
        void removeLocalFolder(vault.localFolderId);
      }
    },
    clearVault(vault: VaultConfig): void {
      params.updateVault(vault.id, {
        localFolderId: undefined,
        localFolderName: undefined
      });
      void removeLocalFolder(vault.localFolderId);
    }
  };
}
