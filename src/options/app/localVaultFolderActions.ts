import { formatMessage, type Messages } from '@i18n';
import type { PreviewContent } from '@options/stitch/types';
import type { PlatformServices } from '@platform/types';
import type { VaultConfig } from '@shared/types/vault';

type ConnectionNotice = NonNullable<PreviewContent['storage']['connectionNotice']>;
type FileSystemAccessService = PlatformServices['fileSystemAccess'];

export interface ChooseLocalFolderResult {
  ok: boolean;
  previousFolderId?: string;
  notice?: ConnectionNotice;
}

export interface ClearLocalFolderResult {
  previousFolderId?: string;
}

export type ActivateLocalFolderResult =
  | { action: 'choose' }
  | { action: 'toggle'; notice: ConnectionNotice }
  | { action: 'notice'; notice: ConnectionNotice };

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

export async function removeStoredLocalFolder(
  fileSystemAccess: FileSystemAccessService,
  folderId: string | undefined
): Promise<void> {
  if (!folderId) {
    return;
  }
  try {
    await fileSystemAccess.removeDirectory(folderId);
  } catch (error) {
    console.warn('[Options] Failed to remove stored local vault folder handle:', error);
  }
}

export async function chooseVaultLocalFolder(
  fileSystemAccess: FileSystemAccessService,
  vault: VaultConfig,
  messages: Messages | null = null
): Promise<ChooseLocalFolderResult> {
  try {
    const previousFolderId = vault.localFolderId;
    const selection = await fileSystemAccess.chooseDirectory({
      suggestedName: vault.name || vault.vault
    });
    vault.localFolderId = selection.id;
    vault.localFolderName = selection.name;
    return {
      ok: true,
      ...(previousFolderId !== undefined ? { previousFolderId } : {})
    };
  } catch (error) {
    console.warn('[Options] Failed to choose local vault folder:', error);
    return {
      ok: false,
      notice: {
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
      }
    };
  }
}

export function clearVaultLocalFolder(vault: VaultConfig): ClearLocalFolderResult {
  const previousFolderId = vault.localFolderId;
  vault.localFolderId = undefined;
  vault.localFolderName = undefined;
  return {
    ...(previousFolderId !== undefined ? { previousFolderId } : {})
  };
}

export async function activateVaultLocalFolder(
  fileSystemAccess: FileSystemAccessService,
  vault: VaultConfig,
  messages: Messages | null = null
): Promise<ActivateLocalFolderResult> {
  if (!vault.localFolderId) {
    return { action: 'choose' };
  }

  try {
    const permission = await fileSystemAccess.ensurePermission(vault.localFolderId);
    if (permission !== 'granted') {
      return {
        action: 'notice',
        notice: {
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
        }
      };
    }
    return {
      action: 'toggle',
      notice: {
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
      }
    };
  } catch (error) {
    console.warn('[Options] Failed to refresh local vault folder permission:', error);
    return {
      action: 'notice',
      notice: {
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
      }
    };
  }
}
