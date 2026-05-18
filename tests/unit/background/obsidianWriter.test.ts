import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServiceMock = vi.hoisted(() => vi.fn());
const handleErrorMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));

vi.mock('@shared/di', () => ({
  getService: getServiceMock
}));
vi.mock('@shared/errors', () => ({
  ErrorSeverity: {
    ERROR: 'error'
  },
  handleError: handleErrorMock
}));

describe('obsidianWriter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('writes markdown through the injected rest client with mapped connection fields', async () => {
    const writeFileMock = vi.fn(() => Promise.resolve(undefined));
    getServiceMock.mockReturnValue({ restClient: { writeFile: writeFileMock } });

    const { writeMarkdownToVault } = await import(
      '../../../src/background/services/obsidianWriter'
    );
    await writeMarkdownToVault(
      {
        baseUrl: 'https://vault.example',
        httpsUrl: 'https://vault.example',
        httpUrl: 'http://vault.example',
        vault: 'Main',
        apiKey: 'secret'
      },
      'Articles/test.md',
      '# Hello'
    );

    expect(writeFileMock).toHaveBeenCalledWith(
      {
        baseUrl: 'https://vault.example',
        httpsUrl: 'https://vault.example',
        httpUrl: 'http://vault.example',
        vault: 'Main',
        apiKey: 'secret'
      },
      'Articles/test.md',
      '# Hello',
      { contentType: 'text/markdown; charset=utf-8' }
    );
  });

  it('propagates rest client write failures', async () => {
    const error = new Error('network failed');
    const writeFileMock = vi.fn(() => Promise.reject(error));
    getServiceMock.mockReturnValue({ restClient: { writeFile: writeFileMock } });

    const { writeMarkdownToVault } = await import(
      '../../../src/background/services/obsidianWriter'
    );

    await expect(
      writeMarkdownToVault(
        {
          baseUrl: 'https://vault.example',
          vault: 'Main',
          apiKey: 'secret'
        } as never,
        'Articles/test.md',
        '# Hello'
      )
    ).rejects.toThrow('network failed');

    expect(handleErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'rest',
        message: 'Failed to write file to vault: Articles/test.md',
        context: expect.objectContaining({
          endpoint: 'https://vault.example',
          vault: 'Main',
          method: 'PUT',
          filePath: 'Articles/test.md'
        }) as unknown,
        cause: error
      }),
      { suppressNotifications: true }
    );
  });

  it('passes through fallback connection fields when optional urls are absent', async () => {
    const writeFileMock = vi.fn(() => Promise.resolve(undefined));
    getServiceMock.mockReturnValue({ restClient: { writeFile: writeFileMock } });

    const { writeMarkdownToVault } = await import(
      '../../../src/background/services/obsidianWriter'
    );
    await writeMarkdownToVault(
      {
        baseUrl: 'http://fallback.example',
        vault: 'Inbox',
        apiKey: 'secret'
      } as never,
      'Inbox/test.md',
      'content'
    );

    expect(writeFileMock).toHaveBeenCalledWith(
      {
        baseUrl: 'http://fallback.example',
        vault: 'Inbox',
        apiKey: 'secret'
      },
      'Inbox/test.md',
      'content',
      { contentType: 'text/markdown; charset=utf-8' }
    );
  });

  it('creates a local write session and writes every file to the same local folder', async () => {
    const writeFileMock = vi.fn(() => Promise.resolve(undefined));
    const queryPermissionMock = vi.fn(() => Promise.resolve('granted'));
    const ensurePermissionMock = vi.fn(() => Promise.resolve('granted'));
    const writeLocalFileMock = vi.fn(() => Promise.resolve(undefined));
    getServiceMock.mockReturnValue({
      restClient: { writeFile: writeFileMock },
      fileSystemAccess: {
        queryPermission: queryPermissionMock,
        ensurePermission: ensurePermissionMock,
        writeFile: writeLocalFileMock
      }
    });

    const { createVaultWriteSession } = await import(
      '../../../src/background/services/obsidianWriter'
    );
    const session = await createVaultWriteSession({
      baseUrl: 'https://vault.example',
      vault: 'Main',
      apiKey: 'secret',
      localFolderId: 'folder-main',
      localFolderName: 'Main'
    } as never);

    await session.writeAttachment(
      'Articles/assets/test/image.png',
      'data:image/png;base64,aaa',
      'image/png'
    );
    await session.writeMarkdown('Articles/test.md', '# Hello');

    expect(session.target).toEqual({
      storageTarget: 'local-folder',
      localFolderName: 'Main'
    });
    expect(queryPermissionMock).toHaveBeenCalledTimes(1);
    expect(queryPermissionMock).toHaveBeenCalledWith('folder-main');
    expect(ensurePermissionMock).not.toHaveBeenCalled();
    expect(writeLocalFileMock).toHaveBeenNthCalledWith(1, {
      folderId: 'folder-main',
      filePath: 'Articles/assets/test/image.png',
      content: expect.any(Blob) as unknown,
      contentType: 'image/png'
    });
    expect(writeLocalFileMock).toHaveBeenNthCalledWith(2, {
      folderId: 'folder-main',
      filePath: 'Articles/test.md',
      content: '# Hello',
      contentType: 'text/markdown; charset=utf-8'
    });
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('falls back to REST for the whole session when local preflight is denied', async () => {
    const writeFileMock = vi.fn(() => Promise.resolve(undefined));
    const queryPermissionMock = vi.fn(() => Promise.resolve('denied'));
    const ensurePermissionMock = vi.fn(() => Promise.resolve('denied'));
    const writeLocalFileMock = vi.fn(() => Promise.resolve(undefined));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getServiceMock.mockReturnValue({
      restClient: { writeFile: writeFileMock },
      fileSystemAccess: {
        queryPermission: queryPermissionMock,
        ensurePermission: ensurePermissionMock,
        writeFile: writeLocalFileMock
      }
    });

    const { createVaultWriteSession } = await import(
      '../../../src/background/services/obsidianWriter'
    );
    const session = await createVaultWriteSession({
      baseUrl: 'https://vault.example',
      vault: 'Main',
      apiKey: 'secret',
      localFolderId: 'folder-main',
      localFolderName: 'Main'
    } as never);

    await session.writeAttachment(
      'Articles/assets/test/image.png',
      'data:image/png;base64,aaa',
      'image/png'
    );
    await session.writeMarkdown('Articles/test.md', '# Hello');

    expect(session.target).toEqual({
      storageTarget: 'rest-api',
      localFolderName: 'Main',
      fallbackReason: 'permission-denied'
    });
    expect(writeLocalFileMock).not.toHaveBeenCalled();
    expect(ensurePermissionMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[obsidianWriter] Local vault unavailable before writing; using REST:',
      'denied'
    );
    expect(writeFileMock).toHaveBeenNthCalledWith(
      1,
      {
        baseUrl: 'https://vault.example',
        vault: 'Main',
        apiKey: 'secret'
      },
      'Articles/assets/test/image.png',
      expect.any(Blob),
      { contentType: 'image/png' }
    );
    expect(writeFileMock).toHaveBeenNthCalledWith(
      2,
      {
        baseUrl: 'https://vault.example',
        vault: 'Main',
        apiKey: 'secret'
      },
      'Articles/test.md',
      '# Hello',
      { contentType: 'text/markdown; charset=utf-8' }
    );
  });

  it('fails the session without REST fallback when local writing fails after preflight succeeds', async () => {
    const writeFileMock = vi.fn(() => Promise.resolve(undefined));
    const queryPermissionMock = vi.fn(() => Promise.resolve('granted'));
    const ensurePermissionMock = vi.fn(() => Promise.resolve('granted'));
    const writeLocalFileMock = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('disk full'));
    getServiceMock.mockReturnValue({
      restClient: { writeFile: writeFileMock },
      fileSystemAccess: {
        queryPermission: queryPermissionMock,
        ensurePermission: ensurePermissionMock,
        writeFile: writeLocalFileMock
      }
    });

    const { createVaultWriteSession } = await import(
      '../../../src/background/services/obsidianWriter'
    );
    const session = await createVaultWriteSession({
      baseUrl: 'https://vault.example',
      vault: 'Main',
      apiKey: 'secret',
      localFolderId: 'folder-main',
      localFolderName: 'Main'
    } as never);

    await session.writeAttachment(
      'Articles/assets/test/image.png',
      'data:image/png;base64,aaa',
      'image/png'
    );
    await expect(session.writeMarkdown('Articles/test.md', '# Hello')).rejects.toMatchObject({
      code: 'LOCAL_VAULT_WRITE_FAILED',
      userMessage: expect.stringContaining('本地目录写入失败') as unknown
    });
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('uses current-page reauthorization when local permission is prompt before writing', async () => {
    const writeFileMock = vi.fn(() => Promise.resolve(undefined));
    const queryPermissionMock = vi
      .fn()
      .mockResolvedValueOnce('prompt')
      .mockResolvedValueOnce('granted');
    const requestPermissionMock = vi.fn(async () => ({
      action: 'granted' as const,
      permissionState: 'granted' as const
    }));
    const writeLocalFileMock = vi.fn(() => Promise.resolve(undefined));
    getServiceMock.mockReturnValue({
      restClient: { writeFile: writeFileMock },
      fileSystemAccess: {
        queryPermission: queryPermissionMock,
        ensurePermission: vi.fn(() => Promise.resolve('granted')),
        writeFile: writeLocalFileMock
      }
    });

    const { createVaultWriteSession } = await import(
      '../../../src/background/services/obsidianWriter'
    );
    const session = await createVaultWriteSession(
      {
        baseUrl: 'https://vault.example',
        vault: 'Main',
        apiKey: 'secret',
        localFolderId: 'folder-main',
        localFolderName: 'Main'
      } as never,
      { requestLocalVaultPermission: requestPermissionMock }
    );

    await session.writeMarkdown('Articles/test.md', '# Hello');

    expect(requestPermissionMock).toHaveBeenCalledWith({
      folderId: 'folder-main',
      folderName: 'Main',
      vaultName: 'Main'
    });
    expect(session.target).toEqual({
      storageTarget: 'local-folder',
      localFolderName: 'Main'
    });
    expect(writeLocalFileMock).toHaveBeenCalledWith({
      folderId: 'folder-main',
      filePath: 'Articles/test.md',
      content: '# Hello',
      contentType: 'text/markdown; charset=utf-8'
    });
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('reports local reauthorization when permission is prompt and REST fallback fails', async () => {
    const restError = new Error('rest offline');
    const writeFileMock = vi.fn(() => Promise.reject(restError));
    const queryPermissionMock = vi.fn(() => Promise.resolve('prompt'));
    const ensurePermissionMock = vi.fn(() => Promise.resolve('prompt'));
    getServiceMock.mockReturnValue({
      restClient: { writeFile: writeFileMock },
      fileSystemAccess: {
        queryPermission: queryPermissionMock,
        ensurePermission: ensurePermissionMock,
        writeFile: vi.fn()
      }
    });

    const { createVaultWriteSession } = await import(
      '../../../src/background/services/obsidianWriter'
    );
    const session = await createVaultWriteSession({
      baseUrl: 'https://vault.example',
      vault: 'Main',
      apiKey: 'secret',
      localFolderId: 'folder-main',
      localFolderName: 'Main'
    } as never);

    expect(session.target).toEqual({
      storageTarget: 'rest-api',
      localFolderName: 'Main',
      fallbackReason: 'write-preflight-failed'
    });
    await expect(session.writeMarkdown('Articles/test.md', '# Hello')).rejects.toMatchObject({
      code: 'LOCAL_VAULT_REAUTH_REQUIRED',
      userMessage: expect.stringContaining('本地目录需要重新授权') as unknown
    });
    expect(writeFileMock).toHaveBeenCalled();
  });
});
