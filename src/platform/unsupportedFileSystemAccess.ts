import type {
  ChooseLocalVaultDirectoryOptions,
  FileSystemAccessService,
  LocalVaultDirectorySelection,
  LocalVaultPermissionState,
  WriteLocalVaultFileOptions
} from './interfaces/fileSystemAccess';

function unavailable(): Error {
  return new Error('File System Access API is only supported in Chromium extension pages.');
}

export const unsupportedFileSystemAccessService: FileSystemAccessService = {
  isSupported(): boolean {
    return false;
  },
  chooseDirectory(
    _options?: ChooseLocalVaultDirectoryOptions
  ): Promise<LocalVaultDirectorySelection> {
    return Promise.reject(unavailable());
  },
  queryPermission(_folderId: string): Promise<LocalVaultPermissionState> {
    return Promise.resolve('unsupported');
  },
  ensurePermission(_folderId: string): Promise<LocalVaultPermissionState> {
    return Promise.resolve('unsupported');
  },
  writeFile(_options: WriteLocalVaultFileOptions): Promise<void> {
    return Promise.reject(unavailable());
  },
  removeDirectory(_folderId: string): Promise<void> {
    return Promise.resolve();
  }
};
