import { configurePlatformServices } from '../platform';
import { chromeFileSystemAccessService } from '../platform/chrome/fileSystemAccess';
import type {
  FileSystemDirectoryHandleLike,
  FileSystemFileHandleLike,
  FileSystemPermissionState,
  FileSystemWritableFileStreamLike,
  StoredDirectoryHandle
} from '../platform/chrome/localVaultCore';
import { createVaultWriteSession } from '../background/services/obsidianWriter';
import type { RestConnection, RestClient } from '../shared/interfaces/restClient';

interface HarnessState {
  root: FakeDirectoryHandle;
  selection?: { id: string; name: string };
  restCalls: Array<{ filePath: string; contentType?: string }>;
}

interface ResetOptions {
  queryPermission?: FileSystemPermissionState;
  requestPermission?: FileSystemPermissionState;
  failWrites?: boolean;
}

interface HarnessSnapshot {
  selection?: { id: string; name: string };
  files: Record<string, string>;
  restCalls: Array<{ filePath: string; contentType?: string }>;
}

class FakeWritableFileStream implements FileSystemWritableFileStreamLike {
  constructor(
    private readonly file: FakeFileHandle,
    private readonly root: FakeDirectoryHandle
  ) {}

  async write(data: string | Blob | ArrayBuffer | Uint8Array): Promise<void> {
    if (this.root.failWrites) {
      throw new Error('fake local write failed');
    }
    this.file.content = await stringifyContent(data);
  }

  async close(): Promise<void> {}
}

class FakeFileHandle implements FileSystemFileHandleLike {
  content = '';

  constructor(
    readonly name: string,
    private readonly root: FakeDirectoryHandle
  ) {}

  createWritable(): Promise<FileSystemWritableFileStreamLike> {
    return Promise.resolve(new FakeWritableFileStream(this, this.root));
  }
}

class FakeDirectoryHandle implements FileSystemDirectoryHandleLike {
  readonly directories = new Map<string, FakeDirectoryHandle>();
  readonly files = new Map<string, FakeFileHandle>();
  failWrites = false;

  constructor(
    readonly name: string,
    private permission: FileSystemPermissionState,
    private requestResult: FileSystemPermissionState,
    private readonly root: FakeDirectoryHandle | null = null
  ) {}

  queryPermission(): Promise<FileSystemPermissionState> {
    return Promise.resolve(this.permission);
  }

  requestPermission(): Promise<FileSystemPermissionState> {
    this.permission = this.requestResult;
    return Promise.resolve(this.requestResult);
  }

  setPermission(permission: FileSystemPermissionState, requestResult = permission): void {
    this.permission = permission;
    this.requestResult = requestResult;
  }

  getDirectoryHandle(
    name: string,
    options: { create?: boolean } = {}
  ): Promise<FileSystemDirectoryHandleLike> {
    const existing = this.directories.get(name);
    if (existing) {
      return Promise.resolve(existing);
    }
    if (!options.create) {
      return Promise.reject(new Error(`Directory not found: ${name}`));
    }
    const directory = new FakeDirectoryHandle(
      name,
      this.permission,
      this.requestResult,
      this.root ?? this
    );
    this.directories.set(name, directory);
    return Promise.resolve(directory);
  }

  getFileHandle(
    name: string,
    options: { create?: boolean } = {}
  ): Promise<FileSystemFileHandleLike> {
    const existing = this.files.get(name);
    if (existing) {
      return Promise.resolve(existing);
    }
    if (!options.create) {
      return Promise.reject(new Error(`File not found: ${name}`));
    }
    const file = new FakeFileHandle(name, this.root ?? this);
    this.files.set(name, file);
    return Promise.resolve(file);
  }
}

class FakeObjectStore {
  constructor(private readonly records: Map<string, StoredDirectoryHandle>) {}

  put(value: StoredDirectoryHandle): IDBRequest<undefined> {
    this.records.set(value.id, value);
    return createRequest(undefined);
  }

  get(id: string): IDBRequest<StoredDirectoryHandle | undefined> {
    return createRequest(this.records.get(id));
  }

  delete(id: string): IDBRequest<undefined> {
    this.records.delete(id);
    return createRequest(undefined);
  }
}

class FakeDatabase {
  readonly records = new Map<string, StoredDirectoryHandle>();
  readonly objectStoreNames = {
    contains: () => this.hasStore
  };

  private hasStore = false;

  createObjectStore(): FakeObjectStore {
    this.hasStore = true;
    return new FakeObjectStore(this.records);
  }

  transaction(): IDBTransaction {
    return {
      objectStore: () => new FakeObjectStore(this.records)
    } as unknown as IDBTransaction;
  }

  close(): void {}
}

let fakeDb: FakeDatabase | null = null;
let state: HarnessState;

function createRequest<T>(result: T): IDBRequest<T> {
  const request = {
    result,
    error: null,
    onsuccess: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null
  };
  queueMicrotask(() => request.onsuccess?.(new Event('success')));
  return request as IDBRequest<T>;
}

function installFakeIndexedDb(): void {
  const fakeIndexedDb = {
    open: () => {
      const request = {
        result: undefined as unknown as FakeDatabase,
        error: null,
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        onupgradeneeded: null as ((event: Event) => void) | null
      };
      queueMicrotask(() => {
        if (!fakeDb) {
          fakeDb = new FakeDatabase();
          request.result = fakeDb;
          request.onupgradeneeded?.(new Event('upgradeneeded'));
        } else {
          request.result = fakeDb;
        }
        request.onsuccess?.(new Event('success'));
      });
      return request;
    }
  };
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: fakeIndexedDb
  });
}

function installDirectoryPicker(root: FakeDirectoryHandle): void {
  Object.defineProperty(globalThis, 'showDirectoryPicker', {
    configurable: true,
    value: () => Promise.resolve(root)
  });
}

async function stringifyContent(data: string | Blob | ArrayBuffer | Uint8Array): Promise<string> {
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof Blob) {
    return data.text();
  }
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return Array.from(bytes)
    .map((byte) => String.fromCharCode(byte))
    .join('');
}

function collectFiles(directory: FakeDirectoryHandle, prefix = ''): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [name, file] of directory.files) {
    files[`${prefix}${name}`] = file.content;
  }
  for (const [name, child] of directory.directories) {
    Object.assign(files, collectFiles(child, `${prefix}${name}/`));
  }
  return files;
}

function snapshot(): HarnessSnapshot {
  return {
    ...(state.selection ? { selection: state.selection } : {}),
    files: collectFiles(state.root),
    restCalls: [...state.restCalls]
  };
}

const restClient: RestClient = {
  writeFile(
    _connection: RestConnection,
    filePath: string,
    _content: BodyInit,
    options?: { contentType?: string }
  ): Promise<void> {
    state.restCalls.push({ filePath, contentType: options?.contentType });
    return Promise.resolve();
  }
};

function reset(options: ResetOptions = {}): Promise<HarnessSnapshot> {
  fakeDb = null;
  const root = new FakeDirectoryHandle(
    'HarnessVault',
    options.queryPermission ?? 'prompt',
    options.requestPermission ?? 'granted'
  );
  root.failWrites = options.failWrites ?? false;
  state = { root, restCalls: [] };
  installFakeIndexedDb();
  installDirectoryPicker(root);
  configurePlatformServices({
    fileSystemAccess: chromeFileSystemAccessService,
    restClient
  });
  return Promise.resolve(snapshot());
}

async function chooseDirectory(): Promise<HarnessSnapshot> {
  state.selection = await chromeFileSystemAccessService.chooseDirectory({
    suggestedName: 'HarnessVault'
  });
  return snapshot();
}

function createRestConfig() {
  if (!state.selection) {
    throw new Error('Choose a local directory before creating a write session.');
  }
  return {
    baseUrl: 'https://rest.example',
    vault: 'RemoteVault',
    apiKey: 'secret',
    localFolderId: state.selection.id,
    localFolderName: state.selection.name
  };
}

async function writeMarkdown(filePath: string, markdown = '# note'): Promise<unknown> {
  const session = await createVaultWriteSession(createRestConfig());
  await session.writeMarkdown(filePath, markdown);
  return {
    target: session.target,
    ...snapshot()
  };
}

async function writeWithDeniedPermission(): Promise<unknown> {
  state.root.setPermission('denied', 'denied');
  const session = await createVaultWriteSession(createRestConfig());
  await session.writeMarkdown('Articles/fallback.md', '# fallback');
  return {
    target: session.target,
    ...snapshot()
  };
}

async function writeAfterInlineReauthorization(): Promise<unknown> {
  const restConfig = createRestConfig();
  state.root.setPermission('prompt', 'granted');
  let reauthRequests = 0;
  const session = await createVaultWriteSession(restConfig, {
    requestLocalVaultPermission: async (request) => {
      reauthRequests += 1;
      const permissionState = await chromeFileSystemAccessService.ensurePermission(
        request.folderId
      );
      return permissionState === 'granted'
        ? { action: 'granted', permissionState }
        : { action: 'use-rest', permissionState };
    }
  });
  await session.writeMarkdown('Articles/reauthorized.md', '# reauthorized');
  return {
    target: session.target,
    reauthRequests,
    ...snapshot()
  };
}

async function writeAfterInlineRestSuppression(): Promise<unknown> {
  state.root.setPermission('prompt', 'granted');
  let reauthRequests = 0;
  const session = await createVaultWriteSession(createRestConfig(), {
    requestLocalVaultPermission: () => {
      reauthRequests += 1;
      return Promise.resolve({ action: 'use-rest', permissionState: 'denied', persistRest: true });
    }
  });
  await session.writeMarkdown('Articles/rest-suppressed.md', '# rest');
  return {
    target: session.target,
    reauthRequests,
    ...snapshot()
  };
}

async function writeWithLocalFailure(): Promise<unknown> {
  state.root.failWrites = true;
  const session = await createVaultWriteSession(createRestConfig());
  try {
    await session.writeMarkdown('Articles/fail.md', '# fail');
    return {
      ok: true,
      target: session.target,
      ...snapshot()
    };
  } catch (error) {
    return {
      ok: false,
      target: session.target,
      error: error instanceof Error ? error.message : String(error),
      code: typeof error === 'object' && error ? (error as { code?: string }).code : undefined,
      ...snapshot()
    };
  }
}

async function writeTraversalPath(): Promise<unknown> {
  const session = await createVaultWriteSession(createRestConfig());
  try {
    await session.writeMarkdown('../bad.md', '# bad');
    return { ok: true, target: session.target, ...snapshot() };
  } catch (error) {
    return {
      ok: false,
      target: session.target,
      error: error instanceof Error ? error.message : String(error),
      code: typeof error === 'object' && error ? (error as { code?: string }).code : undefined,
      ...snapshot()
    };
  }
}

await reset();

Object.assign(globalThis, {
  localVaultHarness: {
    reset,
    chooseDirectory,
    writeMarkdown,
    writeWithDeniedPermission,
    writeAfterInlineReauthorization,
    writeAfterInlineRestSuppression,
    writeWithLocalFailure,
    writeTraversalPath,
    snapshot
  }
});

document.getElementById('status')?.replaceChildren('Harness ready');
