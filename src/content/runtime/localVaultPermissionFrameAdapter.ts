import { chromeFileSystemAccessService } from '../../platform/chrome/fileSystemAccess';
import type { FileSystemAccessService } from '../../platform/interfaces/fileSystemAccess';

export type LocalVaultPermissionService = Pick<FileSystemAccessService, 'ensurePermission'>;

export function resolveLocalVaultPermissionService(): LocalVaultPermissionService {
  return chromeFileSystemAccessService;
}
