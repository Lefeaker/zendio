import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServiceMock = vi.hoisted(() => vi.fn());
const handleErrorMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));

vi.mock('@shared/di', () => ({
  getService: getServiceMock
}));
vi.mock('@shared/errors', () => ({
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
        }),
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
});
