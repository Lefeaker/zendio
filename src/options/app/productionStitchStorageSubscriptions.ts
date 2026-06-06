import { getService } from '@shared/di';
import { TOKENS } from '@shared/di/tokens';
import type { PlatformServices } from '@platform/types';
import type {
  ProductionStitchStorageControllerOptions,
  ProductionStitchStorageLoad
} from './productionStitchStorageTypes';
import {
  classifyPermissionPromptErrorOutcome,
  emitLocalVaultPermissionPrompted,
  emitLocalVaultPermissionResolved
} from '@options/services/connectionTester';

export interface ProductionStitchStorageSubscriptions {
  activateVaultLocalFolder(index: number): Promise<void>;
  chooseVaultLocalFolder(index: number): Promise<void>;
  clearVaultLocalFolder(index: number): void;
}

export function createProductionStitchStorageSubscriptions(
  options: ProductionStitchStorageControllerOptions,
  load: ProductionStitchStorageLoad
): ProductionStitchStorageSubscriptions {
  async function removeStoredLocalFolder(folderId: string | undefined): Promise<void> {
    if (!folderId) {
      return;
    }
    try {
      await getService<PlatformServices>(TOKENS.platformServices).fileSystemAccess.removeDirectory(
        folderId
      );
    } catch (error) {
      console.warn('[Options] Failed to remove stored local vault folder handle:', error);
    }
  }

  async function chooseVaultLocalFolder(index: number): Promise<void> {
    const draft = options.getDraft();
    const state = options.getState();
    const router = load.ensureVaultRouter();
    const vault = router.vaults[index];
    if (!vault) {
      return;
    }
    try {
      emitLocalVaultPermissionPrompted(options.getMessagingRepository(), 'options');
      const previousFolderId = vault.localFolderId;
      const selection = await getService<PlatformServices>(
        TOKENS.platformServices
      ).fileSystemAccess.chooseDirectory({
        suggestedName: vault.name || vault.vault
      });
      emitLocalVaultPermissionResolved(options.getMessagingRepository(), 'completed');
      state.activeLocalFolderVaultIndex = null;
      vault.localFolderId = selection.id;
      vault.localFolderName = selection.name;
      if (vault.isDefault || vault.id === router.defaultVaultId || index === 0) {
        load.syncDefaultRestFromVault(vault);
      }
      draft.vaultRouter = router;
      options.scheduleDraftSave();
      options.render();
      if (previousFolderId !== selection.id) {
        void removeStoredLocalFolder(previousFolderId);
      }
    } catch (error) {
      emitLocalVaultPermissionResolved(
        options.getMessagingRepository(),
        classifyPermissionPromptErrorOutcome(error)
      );
      console.warn('[Options] Failed to choose local vault folder:', error);
      options.setConnectionNotice({
        title: '本地目录',
        body: '无法授权本地目录。Chromium 浏览器支持此功能，未授权时会继续使用 REST API。',
        variant: 'warning'
      });
      options.refreshAppData();
      options.render();
    }
  }

  function clearVaultLocalFolder(index: number): void {
    const draft = options.getDraft();
    const state = options.getState();
    const router = load.ensureVaultRouter();
    const vault = router.vaults[index];
    if (!vault) {
      return;
    }
    const previousFolderId = vault.localFolderId;
    state.activeLocalFolderVaultIndex = null;
    vault.localFolderId = undefined;
    vault.localFolderName = undefined;
    if (vault.isDefault || vault.id === router.defaultVaultId || index === 0) {
      load.syncDefaultRestFromVault(vault);
    }
    draft.vaultRouter = router;
    options.scheduleDraftSave();
    options.render();
    void removeStoredLocalFolder(previousFolderId);
  }

  async function activateVaultLocalFolder(index: number): Promise<void> {
    const state = options.getState();
    const router = load.ensureVaultRouter();
    const vault = router.vaults[index];
    if (!vault) {
      return;
    }
    if (!vault.localFolderId) {
      void chooseVaultLocalFolder(index);
      return;
    }

    state.activeLocalFolderVaultIndex = state.activeLocalFolderVaultIndex === index ? null : index;
    options.render();

    try {
      emitLocalVaultPermissionPrompted(options.getMessagingRepository(), 'options');
      const permission = await getService<PlatformServices>(
        TOKENS.platformServices
      ).fileSystemAccess.ensurePermission(vault.localFolderId);
      emitLocalVaultPermissionResolved(
        options.getMessagingRepository(),
        permission === 'granted' ? 'completed' : 'failed'
      );
      if (permission !== 'granted') {
        options.setConnectionNotice({
          title: '本地目录需要重新授权',
          body: `Chrome 已将“${vault.localFolderName ?? vault.name ?? vault.vault}”的本地目录权限恢复为待授权状态。请再次点击该目录并在浏览器权限提示中允许读写；未授权前发送会回退 REST API。`,
          variant: 'warning'
        });
        options.refreshAppData();
        options.render();
        return;
      }
      options.setConnectionNotice({
        title: '本地目录权限已确认',
        body: `“${vault.localFolderName ?? vault.name ?? vault.vault}”已可用于本地写入。`,
        variant: 'success'
      });
    } catch (error) {
      emitLocalVaultPermissionResolved(
        options.getMessagingRepository(),
        classifyPermissionPromptErrorOutcome(error)
      );
      console.warn('[Options] Failed to refresh local vault folder permission:', error);
      options.setConnectionNotice({
        title: '本地目录需要重新授权',
        body: 'Chrome 暂时无法恢复这个本地目录权限。请重新选择目录，或继续使用 REST API。',
        variant: 'warning'
      });
      options.refreshAppData();
      options.render();
      return;
    }

    options.refreshAppData();
    options.render();
  }

  return {
    activateVaultLocalFolder,
    chooseVaultLocalFolder,
    clearVaultLocalFolder
  };
}
