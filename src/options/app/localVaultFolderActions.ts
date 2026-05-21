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
  vault: VaultConfig
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
        title: '本地目录',
        body: '无法授权本地目录。Chromium 浏览器支持此功能，未授权时会继续使用 REST API。',
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
  vault: VaultConfig
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
          title: '本地目录需要重新授权',
          body: `Chrome 已将“${vault.localFolderName ?? vault.name ?? vault.vault}”的本地目录权限恢复为待授权状态。请再次点击该目录并在浏览器权限提示中允许读写；未授权前发送会回退 REST API。`,
          variant: 'warning'
        }
      };
    }
    return {
      action: 'toggle',
      notice: {
        title: '本地目录权限已确认',
        body: `“${vault.localFolderName ?? vault.name ?? vault.vault}”已可用于本地写入。`,
        variant: 'success'
      }
    };
  } catch (error) {
    console.warn('[Options] Failed to refresh local vault folder permission:', error);
    return {
      action: 'notice',
      notice: {
        title: '本地目录需要重新授权',
        body: 'Chrome 暂时无法恢复这个本地目录权限。请重新选择目录，或继续使用 REST API。',
        variant: 'warning'
      }
    };
  }
}
