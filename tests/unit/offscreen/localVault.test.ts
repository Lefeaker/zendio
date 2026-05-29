import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOCAL_VAULT_WRITE_MESSAGE,
  type LocalVaultMessageSenderInfo
} from '../../../src/platform/chrome/localVaultOffscreenMessages';

type RuntimeMessageListener = (
  message: object,
  sender: LocalVaultMessageSenderInfo,
  sendResponse: (response?: object) => void
) => boolean;

const extensionId = 'extension-id';
let runtimeMessageListener: RuntimeMessageListener | undefined;

const writeLocalVaultFileMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));

vi.mock('../../../src/platform/chrome/localVaultCore', () => ({
  writeLocalVaultFile: writeLocalVaultFileMock
}));

function installChromeRuntime({
  id,
  getURL = (path = '') => `chrome-extension://${extensionId}/${path}`
}: {
  id?: string;
  getURL?: (path?: string) => string;
} = {}): void {
  runtimeMessageListener = undefined;
  const hasExplicitId = id !== undefined;
  const runtime = {
    getURL: vi.fn(getURL),
    onMessage: {
      addListener: vi.fn((listener: RuntimeMessageListener) => {
        runtimeMessageListener = listener;
      })
    }
  };
  if (hasExplicitId) {
    Object.assign(runtime, { id });
  }

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime
    }
  });
}

async function loadOffscreenListener(): Promise<RuntimeMessageListener> {
  await import('../../../src/offscreen/localVault');
  if (!runtimeMessageListener) {
    throw new Error('local vault offscreen listener was not registered');
  }
  return runtimeMessageListener;
}

function createWriteMessage(): object {
  return {
    type: LOCAL_VAULT_WRITE_MESSAGE,
    folderId: 'folder-1',
    filePath: 'Inbox/test.md',
    contentType: 'text/markdown; charset=utf-8',
    content: { kind: 'text', text: '# Test' }
  };
}

async function dispatchWrite(sender: LocalVaultMessageSenderInfo): Promise<{
  keepAlive: boolean;
  sendResponse: ReturnType<typeof vi.fn>;
}> {
  const listener = await loadOffscreenListener();
  const sendResponse = vi.fn();
  const keepAlive = listener(createWriteMessage(), sender, sendResponse);
  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalled();
  });
  return { keepAlive, sendResponse };
}

describe('local vault offscreen listener', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    writeLocalVaultFileMock.mockResolvedValue(undefined);
    installChromeRuntime({ id: extensionId });
  });

  it('returns false for invalid message shapes', async () => {
    const listener = await loadOffscreenListener();
    const sendResponse = vi.fn();

    expect(listener({ type: 'OTHER_MESSAGE' }, { id: extensionId }, sendResponse)).toBe(false);

    expect(sendResponse).not.toHaveBeenCalled();
    expect(writeLocalVaultFileMock).not.toHaveBeenCalled();
  });

  it('accepts same-extension sender and sends ok', async () => {
    const { keepAlive, sendResponse } = await dispatchWrite({
      id: extensionId,
      origin: `chrome-extension://${extensionId}`,
      url: `chrome-extension://${extensionId}/offscreen/local-vault.html`
    });

    expect(keepAlive).toBe(true);
    expect(writeLocalVaultFileMock).toHaveBeenCalledTimes(1);
    expect(writeLocalVaultFileMock).toHaveBeenCalledWith({
      folderId: 'folder-1',
      filePath: 'Inbox/test.md',
      content: '# Test'
    });
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });

  it('accepts same-extension service worker sender with matching id and no tab', async () => {
    const { keepAlive, sendResponse } = await dispatchWrite({ id: extensionId });

    expect(keepAlive).toBe(true);
    expect(writeLocalVaultFileMock).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });

  it('rejects sender with a different extension id', async () => {
    const { keepAlive, sendResponse } = await dispatchWrite({ id: 'other-extension' });

    expect(keepAlive).toBe(true);
    expect(writeLocalVaultFileMock).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      error: 'Untrusted local vault write sender.'
    });
  });

  it('rejects content-script sender with a tab even when id matches', async () => {
    const { keepAlive, sendResponse } = await dispatchWrite({
      id: extensionId,
      tab: { id: 1 }
    });

    expect(keepAlive).toBe(true);
    expect(writeLocalVaultFileMock).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      error: 'Untrusted local vault write sender.'
    });
  });

  it('rejects sender with external url or origin', async () => {
    const { keepAlive, sendResponse } = await dispatchWrite({
      id: extensionId,
      origin: 'https://example.com',
      url: 'https://example.com/page'
    });

    expect(keepAlive).toBe(true);
    expect(writeLocalVaultFileMock).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      error: 'Untrusted local vault write sender.'
    });
  });

  it('rejects valid write messages when runtime id and extension origin evidence are missing', async () => {
    installChromeRuntime({
      id: undefined,
      getURL: () => {
        throw new Error('runtime URL unavailable');
      }
    });

    const { keepAlive, sendResponse } = await dispatchWrite({ id: extensionId });

    expect(keepAlive).toBe(true);
    expect(writeLocalVaultFileMock).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      error: 'Untrusted local vault write sender.'
    });
  });

  it('preserves error response when writeLocalVaultFile throws', async () => {
    writeLocalVaultFileMock.mockRejectedValue(new Error('disk full'));

    const { keepAlive, sendResponse } = await dispatchWrite({ id: extensionId });

    expect(keepAlive).toBe(true);
    expect(writeLocalVaultFileMock).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'disk full' });
  });
});
