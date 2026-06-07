import { formatMessage, getMessagesForLanguage, type Messages } from '@i18n';
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
    fallback: string,
    values: Record<string, string | number | boolean> = {}
  ): string {
    const value = messages?.[key];
    const template = typeof value === 'string' && value.length > 0 ? value : fallback;
    return Object.keys(values).length > 0 ? formatMessage(template, values) : template;
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
        title: getMessage(
          messages,
          'schemaStorageLocalFolderAuthorizeWarningTitle',
          'Local Folder'
        ),
        body: getMessage(
          messages,
          'schemaStorageLocalFolderAuthorizeWarningBody',
          'Could not authorize a local folder. Chromium supports this feature. Until permission is granted, Zendio continues to use the REST API.'
        ),
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
          title: getMessage(
            messages,
            'schemaStorageLocalFolderReauthorizeTitle',
            'Local Folder needs permission again'
          ),
          body: getMessage(
            messages,
            'schemaStorageLocalFolderReauthorizeBody',
            'Chrome reset the local-folder permission for "{vaultName}". Click the folder again and allow read/write access in the browser prompt. Until then, sending falls back to the REST API.',
            { vaultName: vault.localFolderName ?? vault.name ?? vault.vault }
          ),
          variant: 'warning'
        });
        options.refreshAppData();
        options.render();
        return;
      }
      options.setConnectionNotice({
        title: getMessage(
          messages,
          'schemaStorageLocalFolderPermissionConfirmedTitle',
          'Local Folder permission confirmed'
        ),
        body: getMessage(
          messages,
          'schemaStorageLocalFolderPermissionConfirmedBody',
          '"{vaultName}" is ready for local writes.',
          { vaultName: vault.localFolderName ?? vault.name ?? vault.vault }
        ),
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
        title: getMessage(
          messages,
          'schemaStorageLocalFolderReauthorizeTitle',
          'Local Folder needs permission again'
        ),
        body: getMessage(
          messages,
          'schemaStorageLocalFolderReauthorizeFallbackBody',
          'Chrome could not restore this local-folder permission right now. Re-select the folder or continue with the REST API.'
        ),
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
