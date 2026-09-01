import type { FileSystemAccessService } from '../../platform/interfaces/fileSystemAccess';
import type { StorageAreaService } from '../../platform/interfaces/storage';
import type {
  DeviceLocalVaultBindingRepository,
  OptionsRawStorageRepository
} from '../../infrastructure/repositories/ChromeOptionsRepository';
import type { OptionsMutationCommand } from '../types/optionsMutationMessages';
import type { DeviceLocalVaultBindingSnapshot } from './deviceLocalVaultBindings';

export const DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY = 'deviceLocalVaultCleanupJournal';

export interface DeviceLocalVaultCleanupJournalSnapshot {
  readonly version: 1;
  readonly folderIds: readonly string[];
}

export interface DeviceLocalVaultCleanupPreparation {
  readonly previous: DeviceLocalVaultCleanupJournalSnapshot;
  readonly prepared: DeviceLocalVaultCleanupJournalSnapshot;
}

export interface DeviceLocalVaultBindingStage {
  readonly changed: boolean;
  rollback(): Promise<void>;
}

type RemoveDirectory = Pick<FileSystemAccessService, 'removeDirectory'>['removeDirectory'];
type BindingRepository = OptionsRawStorageRepository & DeviceLocalVaultBindingRepository;

const EMPTY_JOURNAL: DeviceLocalVaultCleanupJournalSnapshot = { version: 1, folderIds: [] };

function normalizeFolderIds(values: readonly unknown[]): string[] {
  return [
    ...new Set(
      values.flatMap((value) => (typeof value === 'string' && value.trim() ? [value.trim()] : []))
    )
  ];
}

export function normalizeDeviceLocalVaultCleanupJournal(
  value: unknown
): DeviceLocalVaultCleanupJournalSnapshot {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('version' in value) ||
    value.version !== 1 ||
    !('folderIds' in value) ||
    !Array.isArray(value.folderIds)
  ) {
    return EMPTY_JOURNAL;
  }
  return { version: 1, folderIds: normalizeFolderIds(value.folderIds) };
}

function referencedFolderIds(snapshot: DeviceLocalVaultBindingSnapshot): Set<string> {
  return new Set(Object.values(snapshot.bindings).map(({ folderId }) => folderId));
}

function sameJournal(
  left: DeviceLocalVaultCleanupJournalSnapshot,
  right: DeviceLocalVaultCleanupJournalSnapshot
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function supportsVaultBindings(
  repository: OptionsRawStorageRepository
): repository is BindingRepository {
  const candidate = repository as Partial<DeviceLocalVaultBindingRepository>;
  return (
    typeof candidate.readVaultBindings === 'function' &&
    typeof candidate.writeVaultBindings === 'function'
  );
}

export function resolveDeviceLocalVaultMutationContext(
  command: OptionsMutationCommand,
  repository: OptionsRawStorageRepository
): { readonly repository: BindingRepository; readonly source: 'rest' | 'vaultRouter' } | null {
  if (
    !supportsVaultBindings(repository) ||
    (command.kind === 'patch' &&
      !command.patches.some(({ path }) => path[0] === 'rest' || path[0] === 'vaultRouter'))
  ) {
    return null;
  }
  const source =
    command.kind === 'patch'
      ? command.patches.some(({ path }) => path[0] === 'vaultRouter')
        ? 'vaultRouter'
        : 'rest'
      : command.kind === 'replace' &&
          !Object.prototype.hasOwnProperty.call(command.replacement, 'vaultRouter')
        ? 'rest'
        : 'vaultRouter';
  return { repository, source };
}

export class DeviceLocalVaultCleanupJournal {
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: StorageAreaService,
    private readonly readBindings: () => Promise<DeviceLocalVaultBindingSnapshot>,
    private readonly removeDirectory: RemoveDirectory
  ) {}

  prepare(
    previousBindings: DeviceLocalVaultBindingSnapshot,
    nextBindings: DeviceLocalVaultBindingSnapshot
  ): Promise<DeviceLocalVaultCleanupPreparation> {
    return this.enqueue(async () => {
      const previous = await this.readDirect();
      const previousReferences = referencedFolderIds(previousBindings);
      const nextReferences = referencedFolderIds(nextBindings);
      const unreferenced = [...previousReferences].filter(
        (folderId) => !nextReferences.has(folderId)
      );
      const prepared = normalizeDeviceLocalVaultCleanupJournal({
        version: 1,
        folderIds: [...previous.folderIds, ...unreferenced].filter(
          (folderId) => !nextReferences.has(folderId)
        )
      });
      if (!sameJournal(previous, prepared)) await this.replaceDirect(prepared);
      return { previous, prepared };
    });
  }

  rollback(preparation: DeviceLocalVaultCleanupPreparation): Promise<void> {
    return this.enqueue(async () => {
      const current = await this.readDirect();
      if (sameJournal(current, preparation.previous)) return;
      await this.replaceDirect(preparation.previous);
    });
  }

  retryPending(): Promise<void> {
    return this.enqueue(async () => {
      let pending = await this.readDirect();
      for (const folderId of pending.folderIds) {
        const currentBindings = await this.readBindings();
        const referenced = referencedFolderIds(currentBindings).has(folderId);
        if (!referenced) {
          try {
            await this.removeDirectory(folderId);
          } catch (error) {
            console.warn('[background] Local vault handle cleanup deferred:', {
              folderId,
              error
            });
            continue;
          }
        }
        const latest = await this.readDirect();
        pending = {
          version: 1,
          folderIds: latest.folderIds.filter((candidate) => candidate !== folderId)
        };
        await this.replaceDirect(pending);
      }
    });
  }

  schedulePending(): void {
    void this.retryPending().catch((error) => {
      console.warn('[background] Local vault cleanup retry deferred:', error);
    });
  }

  private readDirect(): Promise<DeviceLocalVaultCleanupJournalSnapshot> {
    return this.storage
      .get(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY)
      .then(normalizeDeviceLocalVaultCleanupJournal);
  }

  private async replaceDirect(snapshot: DeviceLocalVaultCleanupJournalSnapshot): Promise<void> {
    const normalized = normalizeDeviceLocalVaultCleanupJournal(snapshot);
    if (normalized.folderIds.length === 0) {
      await this.storage.remove(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY);
      return;
    }
    await this.storage.set(DEVICE_LOCAL_VAULT_CLEANUP_JOURNAL_KEY, normalized);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.tail.then(operation, operation);
    this.tail = queued.then(
      () => undefined,
      () => undefined
    );
    return queued;
  }
}

export async function stageDeviceLocalVaultBindingChange(
  cleanupJournal: DeviceLocalVaultCleanupJournal | undefined,
  previous: DeviceLocalVaultBindingSnapshot,
  next: DeviceLocalVaultBindingSnapshot,
  writeBindings: (snapshot: DeviceLocalVaultBindingSnapshot) => Promise<void>
): Promise<DeviceLocalVaultBindingStage> {
  const changed = JSON.stringify(previous) !== JSON.stringify(next);
  if (!changed) return { changed, rollback: () => Promise.resolve() };
  const preparation = cleanupJournal ? await cleanupJournal.prepare(previous, next) : undefined;
  try {
    await writeBindings(next);
  } catch (error) {
    if (preparation) await cleanupJournal?.rollback(preparation);
    throw error;
  }
  return {
    changed,
    rollback: async () => {
      await writeBindings(previous);
      if (preparation) await cleanupJournal?.rollback(preparation);
    }
  };
}
