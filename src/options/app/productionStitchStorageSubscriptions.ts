import { getMessagesForLanguage, type Messages } from '@i18n';
import { resolveSchemaMessage } from '@options/stitch/schema/i18n';
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
  async function resolveCurrentMessages(): Promise<Messages | null> {
    try {
      return await getMessagesForLanguage(options.getState().previewLanguage);
    } catch {
      return null;
    }
  }

  function getMessage(
    messages: Messages | null,
    key: keyof Messages,
    values: Record<string, string | number | boolean> = {}
  ): string {
    return resolveSchemaMessage(messages, key, values);
  }

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
      const messages = await resolveCurrentMessages();
      emitLocalVaultPermissionResolved(
        options.getMessagingRepository(),
        classifyPermissionPromptErrorOutcome(error)
      );
      console.warn('[Options] Failed to choose local vault folder:', error);
      options.setConnectionNotice({
        title: getMessage(messages, 'schemaStorageLocalFolderAuthorizeWarningTitle'),
        body: getMessage(messages, 'schemaStorageLocalFolderAuthorizeWarningBody'),
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
      const messages = await resolveCurrentMessages();
      emitLocalVaultPermissionResolved(
        options.getMessagingRepository(),
        permission === 'granted' ? 'completed' : 'failed'
      );
      if (permission !== 'granted') {
        options.setConnectionNotice({
          title: getMessage(messages, 'schemaStorageLocalFolderReauthorizeTitle'),
          body: getMessage(messages, 'schemaStorageLocalFolderReauthorizeBody', {
            vaultName: vault.localFolderName ?? vault.name ?? vault.vault
          }),
          variant: 'warning'
        });
        options.refreshAppData();
        options.render();
        return;
      }
      options.setConnectionNotice({
        title: getMessage(messages, 'schemaStorageLocalFolderPermissionConfirmedTitle'),
        body: getMessage(messages, 'schemaStorageLocalFolderPermissionConfirmedBody', {
          vaultName: vault.localFolderName ?? vault.name ?? vault.vault
        }),
        variant: 'success'
      });
    } catch (error) {
      const messages = await resolveCurrentMessages();
      emitLocalVaultPermissionResolved(
        options.getMessagingRepository(),
        classifyPermissionPromptErrorOutcome(error)
      );
      console.warn('[Options] Failed to refresh local vault folder permission:', error);
      options.setConnectionNotice({
        title: getMessage(messages, 'schemaStorageLocalFolderReauthorizeTitle'),
        body: getMessage(messages, 'schemaStorageLocalFolderReauthorizeFallbackBody'),
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
