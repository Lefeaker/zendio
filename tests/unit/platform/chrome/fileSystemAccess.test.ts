import { beforeEach, describe, expect, it, vi } from 'vitest';

const chooseLocalVaultDirectoryMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ id: 'folder-1', name: 'Vault' }))
);
const deleteDirectoryHandleMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const ensureLocalVaultOffscreenDocumentMock = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
const getShowDirectoryPickerMock = vi.hoisted(() => vi.fn(() => vi.fn()));
const isLocalVaultStorageAvailableMock = vi.hoisted(() => vi.fn(() => true));
const ensureLocalVaultPermissionMock = vi.hoisted(() => vi.fn(() => Promise.resolve('granted')));
const queryLocalVaultPermissionMock = vi.hoisted(() => vi.fn(() => Promise.resolve('granted')));
const writeLocalVaultFileMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const writeLocalVaultFileInOffscreenMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve(undefined))
);

vi.mock('../../../../src/platform/chrome/localVaultCore', () => ({
  chooseLocalVaultDirectory: chooseLocalVaultDirectoryMock,
  deleteDirectoryHandle: deleteDirectoryHandleMock,
  getShowDirectoryPicker: getShowDirectoryPickerMock,
  ensureLocalVaultPermission: ensureLocalVaultPermissionMock,
  isLocalVaultStorageAvailable: isLocalVaultStorageAvailableMock,
  queryLocalVaultPermission: queryLocalVaultPermissionMock,
  writeLocalVaultFile: writeLocalVaultFileMock
}));

vi.mock('../../../../src/platform/chrome/localVaultOffscreenClient', () => ({
  ensureLocalVaultOffscreenDocument: ensureLocalVaultOffscreenDocumentMock,
  writeLocalVaultFileInOffscreen: writeLocalVaultFileInOffscreenMock
}));

describe('chromeFileSystemAccessService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    chooseLocalVaultDirectoryMock.mockResolvedValue({ id: 'folder-1', name: 'Vault' });
    ensureLocalVaultOffscreenDocumentMock.mockResolvedValue(true);
    getShowDirectoryPickerMock.mockReturnValue(vi.fn());
    ensureLocalVaultPermissionMock.mockResolvedValue('granted');
    isLocalVaultStorageAvailableMock.mockReturnValue(true);
    queryLocalVaultPermissionMock.mockResolvedValue('granted');
    writeLocalVaultFileMock.mockResolvedValue(undefined);
    writeLocalVaultFileInOffscreenMock.mockResolvedValue(undefined);
  });

  it('starts the offscreen writer after choosing a local vault directory', async () => {
    const { chromeFileSystemAccessService } = await import(
      '../../../../src/platform/chrome/fileSystemAccess'
    );

    await expect(
      chromeFileSystemAccessService.chooseDirectory({ suggestedName: 'Vault' })
    ).resolves.toEqual({ id: 'folder-1', name: 'Vault' });

    expect(chooseLocalVaultDirectoryMock).toHaveBeenCalledWith({ suggestedName: 'Vault' });
    await vi.waitFor(() => {
      expect(ensureLocalVaultOffscreenDocumentMock).toHaveBeenCalled();
    });
  });

  it('uses the offscreen writer when direct local vault writing fails', async () => {
    const directError = new Error('permission lost in service worker');
    writeLocalVaultFileMock.mockRejectedValue(directError);
    const { chromeFileSystemAccessService } = await import(
      '../../../../src/platform/chrome/fileSystemAccess'
    );
    const request = {
      folderId: 'folder-1',
      filePath: 'Inbox/test.md',
      content: '# note',
      contentType: 'text/markdown; charset=utf-8'
    };

    await expect(chromeFileSystemAccessService.writeFile(request)).resolves.toBeUndefined();

    expect(writeLocalVaultFileMock).toHaveBeenCalledWith(request);
    expect(writeLocalVaultFileInOffscreenMock).toHaveBeenCalledWith(request);
  });

  it('preflights local vault permission without writing a test file', async () => {
    const { chromeFileSystemAccessService } = await import(
      '../../../../src/platform/chrome/fileSystemAccess'
    );

    await expect(chromeFileSystemAccessService.ensurePermission('folder-1')).resolves.toBe(
      'granted'
    );

    expect(ensureLocalVaultPermissionMock).toHaveBeenCalledWith('folder-1');
    expect(writeLocalVaultFileMock).not.toHaveBeenCalled();
    expect(writeLocalVaultFileInOffscreenMock).not.toHaveBeenCalled();
  });
});
