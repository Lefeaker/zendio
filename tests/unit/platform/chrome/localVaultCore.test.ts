import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteDirectoryHandle,
  getDirectoryHandle,
  putDirectoryHandle,
  writeIntoDirectory,
  type FileSystemDirectoryHandleLike,
  type FileSystemFileHandleLike,
  type FileSystemWritableFileStreamLike
} from '../../../../src/platform/chrome/localVaultCore';
import {
  installLocalVaultIndexedDbHarness,
  type LocalVaultIndexedDbHarnessController
} from '../../../../src/dev/localVaultIndexedDbHarness';

function createWritable(): {
  handle: FileSystemWritableFileStreamLike;
  write: ReturnType<typeof vi.fn<FileSystemWritableFileStreamLike['write']>>;
  close: ReturnType<typeof vi.fn<FileSystemWritableFileStreamLike['close']>>;
} {
  const write = vi.fn<FileSystemWritableFileStreamLike['write']>(() => Promise.resolve());
  const close = vi.fn<FileSystemWritableFileStreamLike['close']>(() => Promise.resolve());
  return {
    handle: { write, close },
    write,
    close
  };
}

function createFileHandle(writable = createWritable().handle): FileSystemFileHandleLike {
  return {
    createWritable: vi.fn(() => Promise.resolve(writable))
  };
}

function createDirectoryHandle(name: string): {
  handle: FileSystemDirectoryHandleLike;
  getDirectoryHandle: ReturnType<typeof vi.fn<FileSystemDirectoryHandleLike['getDirectoryHandle']>>;
  getFileHandle: ReturnType<typeof vi.fn<FileSystemDirectoryHandleLike['getFileHandle']>>;
} {
  const getDirectoryHandle = vi.fn<FileSystemDirectoryHandleLike['getDirectoryHandle']>(() =>
    Promise.resolve(createDirectoryHandle('child').handle)
  );
  const getFileHandle = vi.fn<FileSystemDirectoryHandleLike['getFileHandle']>(() =>
    Promise.resolve(createFileHandle())
  );
  return {
    handle: { name, getDirectoryHandle, getFileHandle },
    getDirectoryHandle,
    getFileHandle
  };
}

async function waitForHarnessEvent(
  controller: LocalVaultIndexedDbHarnessController,
  event: string
): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (controller.snapshot().eventLog.includes(event)) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Local Vault harness event did not occur: ${event}`);
}

describe('localVaultCore writeIntoDirectory', () => {
  it.each(['../escape.md', 'folder/../escape.md'])(
    'rejects unsafe traversal path %j before touching directory handles',
    async (filePath) => {
      const root = createDirectoryHandle('Vault');

      await expect(writeIntoDirectory(root.handle, filePath, 'content')).rejects.toThrow(
        'Vault-relative path must not contain traversal segments.'
      );

      expect(root.getDirectoryHandle).not.toHaveBeenCalled();
      expect(root.getFileHandle).not.toHaveBeenCalled();
    }
  );

  it('strips one matching vault prefix when the selected root policy is provided', async () => {
    const writable = createWritable();
    const fileHandle = createFileHandle(writable.handle);
    const rootGetDirectoryHandle = vi.fn<FileSystemDirectoryHandleLike['getDirectoryHandle']>(() =>
      Promise.reject(new Error('unexpected nested directory'))
    );
    const rootGetFileHandle = vi.fn<FileSystemDirectoryHandleLike['getFileHandle']>(() =>
      Promise.resolve(fileHandle)
    );
    const root: FileSystemDirectoryHandleLike = {
      name: 'Vault',
      getDirectoryHandle: rootGetDirectoryHandle,
      getFileHandle: rootGetFileHandle
    };

    await writeIntoDirectory(root, 'Vault/safe.md', 'content', { selectedVaultName: 'Vault' });

    expect(rootGetDirectoryHandle).not.toHaveBeenCalled();
    expect(rootGetFileHandle).toHaveBeenCalledWith('safe.md', { create: true });
    expect(writable.write).toHaveBeenCalledWith('content');
  });

  it('keeps a vault-name-like first segment without a selected root policy', async () => {
    const writable = createWritable();
    const fileHandle = createFileHandle(writable.handle);
    const vaultGetDirectoryHandle = vi.fn<FileSystemDirectoryHandleLike['getDirectoryHandle']>(() =>
      Promise.reject(new Error('unexpected nested directory'))
    );
    const vaultGetFileHandle = vi.fn<FileSystemDirectoryHandleLike['getFileHandle']>(() =>
      Promise.resolve(fileHandle)
    );
    const vaultDirectory: FileSystemDirectoryHandleLike = {
      name: 'Vault',
      getDirectoryHandle: vaultGetDirectoryHandle,
      getFileHandle: vaultGetFileHandle
    };
    const rootGetDirectoryHandle = vi.fn<FileSystemDirectoryHandleLike['getDirectoryHandle']>(() =>
      Promise.resolve(vaultDirectory)
    );
    const rootGetFileHandle = vi.fn<FileSystemDirectoryHandleLike['getFileHandle']>(() =>
      Promise.reject(new Error('unexpected root file write'))
    );
    const root: FileSystemDirectoryHandleLike = {
      name: 'Root',
      getDirectoryHandle: rootGetDirectoryHandle,
      getFileHandle: rootGetFileHandle
    };

    await writeIntoDirectory(root, 'Vault/safe.md', 'content');

    expect(rootGetDirectoryHandle).toHaveBeenCalledWith('Vault', { create: true });
    expect(vaultGetFileHandle).toHaveBeenCalledWith('safe.md', { create: true });
    expect(writable.write).toHaveBeenCalledWith('content');
  });

  it('preserves nonmatching selected root prefixes', async () => {
    const writable = createWritable();
    const fileHandle = createFileHandle(writable.handle);
    const rootGetDirectoryHandle = vi.fn<FileSystemDirectoryHandleLike['getDirectoryHandle']>(() =>
      Promise.resolve({
        name: 'vault',
        getDirectoryHandle: vi.fn(() => Promise.reject(new Error('unexpected nested directory'))),
        getFileHandle: vi.fn(() => Promise.resolve(fileHandle))
      })
    );
    const rootGetFileHandle = vi.fn<FileSystemDirectoryHandleLike['getFileHandle']>(() =>
      Promise.reject(new Error('unexpected root file write'))
    );
    const root: FileSystemDirectoryHandleLike = {
      name: 'Vault',
      getDirectoryHandle: rootGetDirectoryHandle,
      getFileHandle: rootGetFileHandle
    };

    await writeIntoDirectory(root, 'vault/safe.md', 'content', { selectedVaultName: 'Vault' });

    expect(rootGetDirectoryHandle).toHaveBeenCalledWith('vault', { create: true });
    expect(writable.write).toHaveBeenCalledWith('content');
  });
});

describe('localVaultCore IndexedDB lifecycle', () => {
  let controller: LocalVaultIndexedDbHarnessController | null = null;

  afterEach(() => {
    const current = controller;
    controller = null;
    if (!current) return;
    try {
      expect(current.snapshot().openConnectionCount).toBe(0);
    } finally {
      current.dispose();
    }
  });

  it('preserves the exact v1 schema and resolves writes only after commit', async () => {
    controller = installLocalVaultIndexedDbHarness();
    const handle = createDirectoryHandle('Vault').handle;

    await putDirectoryHandle({ id: 'folder-a', name: 'Vault', handle });

    expect(controller.snapshot()).toMatchObject({
      databaseName: 'ai2ob-local-vault-folders',
      version: 1,
      storeName: 'folders',
      keyPath: 'id',
      records: [{ id: 'folder-a', name: 'Vault', handleName: 'Vault' }],
      openConnectionCount: 0
    });
    expect(controller.snapshot().eventLog).toEqual([
      'install',
      'open:request:ai2ob-local-vault-folders@1',
      'upgrade:start:0->1',
      'store:create:folders:keyPath=id:autoIncrement=false',
      'upgrade:complete',
      'open:success',
      'tx:start:readonly:folders',
      'tx:complete',
      'tx:start:readwrite:folders',
      'request:success:put:folder-a',
      'tx:commit',
      'tx:complete',
      'connection:close'
    ]);
  });

  it('rejects a provisional write when the owning transaction aborts', async () => {
    controller = installLocalVaultIndexedDbHarness();
    controller.setNextTransactionOutcome('abort');
    const handle = createDirectoryHandle('Vault').handle;
    const settled = vi.fn();
    const write = putDirectoryHandle({ id: 'folder-abort', name: 'Vault', handle });
    void write.then(settled, settled);

    await expect(write).rejects.toMatchObject({ code: 'TRANSACTION_ABORTED' });

    expect(settled).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().records).toEqual([]);
    expect(controller.snapshot().eventLog).toContain('request:success:put:folder-abort');
    expect(controller.snapshot().eventLog).toContain('tx:abort');
    expect(controller.snapshot().eventLog).not.toContain('tx:commit');
  });

  it('preserves a committed row when delete errors and settles once', async () => {
    controller = installLocalVaultIndexedDbHarness();
    const handle = createDirectoryHandle('Vault').handle;
    await putDirectoryHandle({ id: 'folder-keep', name: 'Vault', handle });
    const eventOffset = controller.snapshot().eventLog.length;
    controller.setNextTransactionOutcome('error');
    const settled = vi.fn();
    const deletion = deleteDirectoryHandle('folder-keep');
    void deletion.then(settled, settled);

    await expect(deletion).rejects.toMatchObject({ code: 'TRANSACTION_FAILED' });
    expect(settled).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().records).toHaveLength(1);
    expect(controller.snapshot().eventLog.slice(eventOffset)).toEqual([
      'open:request:ai2ob-local-vault-folders@1',
      'open:success',
      'tx:start:readonly:folders',
      'tx:complete',
      'tx:start:readwrite:folders',
      'request:success:delete:folder-keep',
      'tx:error',
      'tx:abort',
      'connection:close'
    ]);
    await expect(getDirectoryHandle('folder-keep')).resolves.toMatchObject({ id: 'folder-keep' });
  });

  it('waits for readonly completion and closes on versionchange during an active operation', async () => {
    controller = installLocalVaultIndexedDbHarness();
    const handle = createDirectoryHandle('Vault').handle;
    await putDirectoryHandle({ id: 'folder-read', name: 'Vault', handle });
    const eventOffset = controller.snapshot().eventLog.length;
    const read = getDirectoryHandle('folder-read');
    let settled = false;
    void read.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    await waitForHarnessEvent(controller, 'request:success:get:folder-read');
    await Promise.resolve();
    expect(settled).toBe(false);
    const beforeChange = controller.snapshot();
    expect(beforeChange.openConnectionCount).toBe(1);

    controller.dispatchVersionChange();
    await expect(read).resolves.toMatchObject({ id: 'folder-read' });
    expect(settled).toBe(true);
    expect(controller.snapshot().eventLog.slice(eventOffset)).toEqual([
      'open:request:ai2ob-local-vault-folders@1',
      'open:success',
      'tx:start:readonly:folders',
      'tx:complete',
      'tx:start:readonly:folders',
      'request:success:get:folder-read',
      'versionchange',
      'connection:close',
      'tx:complete'
    ]);
  });

  it('installs a fresh empty database after disposing the previous controller', async () => {
    const first = installLocalVaultIndexedDbHarness();
    const handle = createDirectoryHandle('Vault').handle;
    await putDirectoryHandle({ id: 'folder-old', name: 'Vault', handle });
    expect(first.snapshot().records).toHaveLength(1);

    controller = installLocalVaultIndexedDbHarness();
    expect(first.snapshot().openConnectionCount).toBe(0);
    expect(controller.snapshot()).toMatchObject({ version: 0, storeName: null, records: [] });
  });

  it('restores the exact prior indexedDB descriptor on disposal', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    const sentinel = { open: vi.fn() };
    const prior = { configurable: true, enumerable: true, writable: false, value: sentinel };
    Object.defineProperty(globalThis, 'indexedDB', prior);
    try {
      controller = installLocalVaultIndexedDbHarness();
      controller.dispose();
      controller = null;
      expect(Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')).toEqual(prior);
    } finally {
      if (original) Object.defineProperty(globalThis, 'indexedDB', original);
      else Reflect.deleteProperty(globalThis, 'indexedDB');
    }
  });

  it('disposes a previous installation and restores descriptors without clobbering replacements', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    const first = installLocalVaultIndexedDbHarness();
    controller = installLocalVaultIndexedDbHarness();
    expect(first.snapshot().openConnectionCount).toBe(0);

    const replacement = { open: vi.fn() };
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: replacement });
    const current = controller;
    current.dispose();
    current.dispose();
    controller = null;
    expect(globalThis.indexedDB).toBe(replacement);

    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'indexedDB', originalDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'indexedDB');
    }
  });
});
