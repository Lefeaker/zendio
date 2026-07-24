import type {
  LocalVaultDirectorySelection,
  LocalVaultPermissionState
} from '../interfaces/fileSystemAccess';
import { normalizeVaultRelativePath } from '../../shared/paths/vaultRelativePath';
import { normalizeLocalFolderWritePath } from '../../shared/paths/vaultWritePath';
import { isObjectRecord } from '../../shared/guards/object';
import {
  openIndexedDb,
  requestToPromise,
  runIndexedDbTransaction
} from '../../shared/storage/indexedDbLifecycle';
import {
  assertIndexedDbNameList,
  assertIndexedDbObjectStore,
  ensureIndexedDbObjectStore,
  type IndexedDbObjectStoreSchema,
  type IndexedDbObjectStore,
  type IndexedDbRequest,
  type OpenIndexedDbOptions
} from '../../shared/storage/indexedDbTypes';

export type PermissionMode = { mode: 'readwrite' };
export type FileSystemPermissionState = 'granted' | 'prompt' | 'denied';
export interface FileSystemWritableFileStreamLike {
  write(data: string | Blob | ArrayBuffer | Uint8Array): Promise<void>;
  close(): Promise<void>;
}
export interface FileSystemFileHandleLike {
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
}
export interface FileSystemDirectoryHandleLike {
  name: string;
  queryPermission?(descriptor?: PermissionMode): Promise<FileSystemPermissionState>;
  requestPermission?(descriptor?: PermissionMode): Promise<FileSystemPermissionState>;
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<FileSystemDirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandleLike>;
}
export interface StoredDirectoryHandle {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandleLike;
}
export type ShowDirectoryPicker = (options?: {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?: string;
}) => Promise<FileSystemDirectoryHandleLike>;
export interface LocalVaultWritePathPolicy {
  selectedVaultName?: string;
}

const DB_NAME = 'ai2ob-local-vault-folders';
const STORE_NAME = 'folders';
const LOCAL_VAULT_STORE_SCHEMA: IndexedDbObjectStoreSchema = {
  name: STORE_NAME,
  keyPath: 'id',
  autoIncrement: false
};
export const LOCAL_VAULT_PERMISSION: PermissionMode = { mode: 'readwrite' };

export function getShowDirectoryPicker(): ShowDirectoryPicker | undefined {
  const candidate = (globalThis as unknown as { showDirectoryPicker?: ShowDirectoryPicker })
    .showDirectoryPicker;
  return typeof candidate === 'function' ? candidate : undefined;
}

export function isLocalVaultStorageAvailable(): boolean {
  return typeof globalThis.indexedDB !== 'undefined';
}
export function createFolderId(): string {
  const cryptoLike = globalThis.crypto;
  if (cryptoLike && typeof cryptoLike.randomUUID === 'function') {
    return cryptoLike.randomUUID();
  }
  return `local-vault-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const LOCAL_VAULT_DATABASE_OPTIONS: OpenIndexedDbOptions = {
  name: DB_NAME,
  version: 1,
  migrations: [
    {
      fromVersion: 0,
      toVersion: 1,
      migrate: ({ database, transaction }) => {
        const store = ensureIndexedDbObjectStore(database, transaction, LOCAL_VAULT_STORE_SCHEMA);
        assertIndexedDbNameList(store.indexNames, [], 'Local Vault index');
      }
    }
  ],
  validate: (database) => {
    assertIndexedDbNameList(database.objectStoreNames, [STORE_NAME], 'Local Vault object store');
    return runIndexedDbTransaction(database, STORE_NAME, 'readonly', (transaction) => {
      const store = assertIndexedDbObjectStore(transaction, LOCAL_VAULT_STORE_SCHEMA);
      assertIndexedDbNameList(store.indexNames, [], 'Local Vault index');
    });
  }
};

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IndexedDbObjectStore) => IndexedDbRequest<T>
): Promise<T> {
  const db = await openIndexedDb(LOCAL_VAULT_DATABASE_OPTIONS);
  try {
    return await runIndexedDbTransaction(db, STORE_NAME, mode, (transaction) =>
      requestToPromise(
        operation(transaction.objectStore(STORE_NAME)),
        'Local vault folder database request failed.'
      )
    );
  } finally {
    db.close();
  }
}

export async function putDirectoryHandle(entry: StoredDirectoryHandle): Promise<void> {
  await withStore('readwrite', (store) => store.put(entry));
}
export async function getDirectoryHandle(folderId: string): Promise<StoredDirectoryHandle | null> {
  const entry = await withStore('readonly', (store) => store.get(folderId));
  return isStoredDirectoryHandle(entry) ? entry : null;
}
export async function deleteDirectoryHandle(folderId: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(folderId));
}

function isStoredDirectoryHandle(value: object | undefined): value is StoredDirectoryHandle {
  return (
    isObjectRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isObjectRecord(value.handle)
  );
}

export async function ensureReadWritePermission(
  handle: FileSystemDirectoryHandleLike
): Promise<LocalVaultPermissionState> {
  const queried = await handle.queryPermission?.(LOCAL_VAULT_PERMISSION);
  if (queried === 'granted') return queried;
  const requested = await handle.requestPermission?.(LOCAL_VAULT_PERMISSION);
  if (requested === 'granted') return requested;
  return requested ?? queried ?? 'denied';
}

function normalizeRelativePath(filePath: string, policy: LocalVaultWritePathPolicy = {}): string[] {
  if (policy.selectedVaultName?.trim()) {
    return normalizeLocalFolderWritePath(filePath, policy).path.split('/');
  }
  return normalizeVaultRelativePath(filePath).split('/');
}

export async function chooseLocalVaultDirectory(options: {
  suggestedName?: string | undefined;
}): Promise<LocalVaultDirectorySelection> {
  const picker = getShowDirectoryPicker();
  if (!picker || !isLocalVaultStorageAvailable()) {
    throw new Error('File System Access API is not available in this browser.');
  }
  const handle = await picker({
    id: 'ai2ob-vault',
    mode: 'readwrite',
    ...(options.suggestedName ? { startIn: 'documents' } : {})
  });
  const permission = await ensureReadWritePermission(handle);
  if (permission !== 'granted') {
    throw new Error('Local vault folder permission was not granted.');
  }
  const entry: StoredDirectoryHandle = {
    id: createFolderId(),
    name: handle.name || options.suggestedName || 'Local Vault',
    handle
  };
  await putDirectoryHandle(entry);
  return { id: entry.id, name: entry.name };
}

export async function queryLocalVaultPermission(
  folderId: string
): Promise<LocalVaultPermissionState> {
  if (!isLocalVaultStorageAvailable()) {
    return 'unsupported';
  }
  const entry = await getDirectoryHandle(folderId);
  if (!entry) {
    return 'missing';
  }
  return entry.handle.queryPermission?.(LOCAL_VAULT_PERMISSION) ?? 'denied';
}
export async function ensureLocalVaultPermission(
  folderId: string
): Promise<LocalVaultPermissionState> {
  if (!isLocalVaultStorageAvailable()) {
    return 'unsupported';
  }
  const entry = await getDirectoryHandle(folderId);
  if (!entry) {
    return 'missing';
  }
  return ensureReadWritePermission(entry.handle);
}

export async function writeIntoDirectory(
  root: FileSystemDirectoryHandleLike,
  filePath: string,
  content: string | Blob | ArrayBuffer | Uint8Array,
  policy: LocalVaultWritePathPolicy = {}
): Promise<void> {
  const parts = normalizeRelativePath(filePath, policy);
  const fileName = parts.pop();
  if (!fileName) {
    throw new Error('Local vault file path is missing a file name.');
  }
  let directory = root;
  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part, { create: true });
  }
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
}

export async function writeLocalVaultFile(options: {
  folderId: string;
  filePath: string;
  content: string | Blob | ArrayBuffer | Uint8Array;
}): Promise<void> {
  if (!isLocalVaultStorageAvailable()) {
    throw new Error('File System Access storage is not available.');
  }
  const entry = await getDirectoryHandle(options.folderId);
  if (!entry) {
    throw new Error('Local vault folder is no longer available.');
  }
  const permission = await ensureReadWritePermission(entry.handle);
  if (permission !== 'granted') {
    throw new Error('Local vault folder permission was not granted.');
  }
  await writeIntoDirectory(entry.handle, options.filePath, options.content);
}
