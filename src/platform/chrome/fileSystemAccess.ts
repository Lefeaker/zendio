import type {
  ChooseLocalVaultDirectoryOptions,
  FileSystemAccessService,
  LocalVaultDirectorySelection,
  LocalVaultPermissionState,
  WriteLocalVaultFileOptions
} from '../interfaces/fileSystemAccess';
import {
  chooseLocalVaultDirectory,
  deleteDirectoryHandle,
  ensureLocalVaultPermission,
  getShowDirectoryPicker,
  isLocalVaultStorageAvailable,
  queryLocalVaultPermission,
  writeLocalVaultFile
} from './localVaultCore';
import {
  ensureLocalVaultOffscreenDocument,
  writeLocalVaultFileInOffscreen
} from './localVaultOffscreenClient';

export const chromeFileSystemAccessService: FileSystemAccessService = {
  isSupported(): boolean {
    return isLocalVaultStorageAvailable() && getShowDirectoryPicker() !== undefined;
  },

  async chooseDirectory(
    options: ChooseLocalVaultDirectoryOptions = {}
  ): Promise<LocalVaultDirectorySelection> {
    const selection = await chooseLocalVaultDirectory(options);
    void ensureLocalVaultOffscreenDocument().catch((error) => {
      console.warn('[fileSystemAccess] Failed to start local vault offscreen writer:', error);
    });
    return selection;
  },

  async queryPermission(folderId: string): Promise<LocalVaultPermissionState> {
    return queryLocalVaultPermission(folderId);
  },

  async ensurePermission(folderId: string): Promise<LocalVaultPermissionState> {
    return ensureLocalVaultPermission(folderId);
  },

  async writeFile(options: WriteLocalVaultFileOptions): Promise<void> {
    try {
      await writeLocalVaultFile(options);
    } catch (directError) {
      try {
        await writeLocalVaultFileInOffscreen(options);
      } catch (offscreenError) {
        throw new Error(
          `Local vault write failed. Direct writer: ${formatError(directError)}; offscreen writer: ${formatError(offscreenError)}`
        );
      }
    }
  },

  async removeDirectory(folderId: string): Promise<void> {
    if (!isLocalVaultStorageAvailable()) {
      return;
    }
    await deleteDirectoryHandle(folderId);
  }
};

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
