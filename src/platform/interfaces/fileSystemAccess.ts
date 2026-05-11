export type LocalVaultPermissionState = 'granted' | 'prompt' | 'denied' | 'missing' | 'unsupported';

export interface LocalVaultDirectorySelection {
  id: string;
  name: string;
}

export interface ChooseLocalVaultDirectoryOptions {
  suggestedName?: string | undefined;
}

export interface WriteLocalVaultFileOptions {
  folderId: string;
  filePath: string;
  content: string | Blob | ArrayBuffer | Uint8Array;
  contentType: string;
}

export interface FileSystemAccessService {
  isSupported(): boolean;
  chooseDirectory(
    options?: ChooseLocalVaultDirectoryOptions
  ): Promise<LocalVaultDirectorySelection>;
  ensurePermission(folderId: string): Promise<LocalVaultPermissionState>;
  queryPermission(folderId: string): Promise<LocalVaultPermissionState>;
  writeFile(options: WriteLocalVaultFileOptions): Promise<void>;
  removeDirectory(folderId: string): Promise<void>;
}
