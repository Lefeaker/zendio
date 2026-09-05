import {
  applyStoredOptionsPatch,
  decodeStoredOptions,
  encodeStoredOptionsReplacement,
  type DecodedStoredOptions
} from '../../shared/config/storedOptionsCodec';
import { snapshotPlainStructuredData } from '../../shared/config/losslessObjectBoundary';
import type {
  PlainStructuredObject,
  PlainStructuredValue
} from '../../shared/config/losslessObjectBoundaryTypes';
import { composeDeviceLocalPrivacy } from '../../shared/config/deviceLocalPrivacy';
import {
  executeDeviceLocalVaultBindingMutation,
  optionsRawSignature,
  optionsValuesEqual,
  optionsVerificationMatches
} from '../../shared/config/deviceLocalVaultBindings';
import { optionsEnvelopeBytes } from '../../infrastructure/repositories/ChromeOptionsRepository';
import type {
  DeviceLocalPrivacyCommitter,
  DeviceLocalVaultBindingRepository,
  OptionsMutationVerification,
  OptionsRawStorageRepository
} from '../../infrastructure/repositories/ChromeOptionsRepository';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import type { DeviceLocalVaultCleanupJournal } from '../../shared/config/deviceLocalVaultCleanupJournal';
import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import {
  OptionsMutationError,
  type OptionsMutationCommand,
  type OptionsMutationSuccessResult,
  type OptionsPatch
} from '../../shared/types/optionsMutationMessages';
const DEFAULT_OPTIONS_QUOTA_BYTES_PER_ITEM = 8_192;
const DEFAULT_EXTERNAL_DRIFT_RETRIES = 2;
export interface OptionsMutationCoordinatorOptions {
  quotaBytesPerItem?: number;
  maxExternalDriftRetries?: number;
  createOperationId?: () => string;
  yieldAfterWrite?: () => Promise<void>;
  deviceLocalPrivacyCommitter?: DeviceLocalPrivacyCommitter;
  deviceLocalVaultCleanupJournal?: DeviceLocalVaultCleanupJournal;
}
export interface BackgroundOptionsReader {
  readDecoded(): Promise<DecodedStoredOptions>;
  onChange(callback: (options: CompleteOptions) => void): () => void;
}
const isObject = (value: PlainStructuredValue | undefined): value is PlainStructuredObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const clone = <T>(value: T): T =>
  value === undefined || value === null ? value : globalThis.structuredClone(value);
const createDefaultOperationId = (): string =>
  typeof globalThis.crypto?.randomUUID === 'function'
    ? `options-${globalThis.crypto.randomUUID()}`
    : `options-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
function platformQuotaBytesPerItem(): number | undefined {
  const candidate = globalThis.chrome?.storage?.sync?.QUOTA_BYTES_PER_ITEM;
  if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0)
    return candidate;
  return undefined;
}
function resolveQuotaBytesPerItem(configured?: number): number {
  const candidates = [DEFAULT_OPTIONS_QUOTA_BYTES_PER_ITEM, configured, platformQuotaBytesPerItem()]
    .filter((value): value is number => typeof value === 'number')
    .filter((value) => Number.isFinite(value) && value > 0);
  return Math.min(...candidates);
}
const readPath = (
  raw: PlainStructuredObject,
  path: readonly string[]
): PlainStructuredValue | undefined =>
  path.reduce<PlainStructuredValue | undefined>(
    (current, part) => (isObject(current) ? current[part] : undefined),
    raw
  );
function expectedPatchValues(
  raw: PlainStructuredObject,
  patches: readonly OptionsPatch[]
): Extract<OptionsMutationVerification, { kind: 'paths' }> {
  const paths = new Map<string, readonly string[]>();
  for (const patch of patches) paths.set(JSON.stringify(patch.path), patch.path);
  return {
    kind: 'paths',
    expected: [...paths.values()].map((path) => ({ path, value: readPath(raw, path) }))
  };
}
function migrationVerification(
  raw: PlainStructuredObject
): Extract<OptionsMutationVerification, { kind: 'paths' }> {
  const decoded = decodeStoredOptions(raw);
  const sections = new Set(decoded.migrations.map((migration) => migration.section));
  return {
    kind: 'paths',
    expected: [...sections].map((section) => ({
      path: [section],
      value: readPath(decoded.normalizedRaw, [section])
    }))
  };
}
function normalizeRaw(value: PlainStructuredValue | null): PlainStructuredObject {
  if (value === null) return {};
  const snapshot = snapshotPlainStructuredData(value);
  if (!snapshot.ok || !isObject(snapshot.value))
    throw new OptionsMutationError('OPTIONS_MUTATION_REJECTED');
  return snapshot.value;
}
const hasVaultBindings = (
  repository: OptionsRawStorageRepository
): repository is OptionsRawStorageRepository & DeviceLocalVaultBindingRepository =>
  'readVaultBindings' in repository &&
  typeof repository.readVaultBindings === 'function' &&
  'writeVaultBindings' in repository &&
  typeof repository.writeVaultBindings === 'function';
function resolveVaultContext(
  repository: OptionsRawStorageRepository,
  command: OptionsMutationCommand
): { repository: DeviceLocalVaultBindingRepository; source: 'rest' | 'vaultRouter' } | null {
  if (!hasVaultBindings(repository)) return null;
  const roots = command.kind === 'patch' ? command.patches.map(({ path }) => path[0]) : [];
  if (command.kind === 'patch' && !roots.some((root) => root === 'rest' || root === 'vaultRouter'))
    return null;
  const source =
    command.kind === 'replace' && !('vaultRouter' in command.replacement) ? 'rest' : 'vaultRouter';
  return { repository, source };
}
export class OptionsMutationCoordinator {
  private tail: Promise<void> = Promise.resolve();
  private initialization: Promise<void> | undefined;
  private readonly quotaBytesPerItem: number;
  private readonly maxExternalDriftRetries: number;
  private readonly createOperationId: () => string;
  private readonly yieldAfterWrite: () => Promise<void>;
  private readonly deviceLocalPrivacyCommitter: DeviceLocalPrivacyCommitter | undefined;
  constructor(
    private readonly repository: OptionsRawStorageRepository,
    private readonly options: OptionsMutationCoordinatorOptions = {}
  ) {
    this.quotaBytesPerItem = resolveQuotaBytesPerItem(options.quotaBytesPerItem);
    this.maxExternalDriftRetries =
      options.maxExternalDriftRetries ?? DEFAULT_EXTERNAL_DRIFT_RETRIES;
    this.createOperationId = options.createOperationId ?? createDefaultOperationId;
    this.yieldAfterWrite =
      options.yieldAfterWrite ??
      (() => new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0)));
    this.deviceLocalPrivacyCommitter = options.deviceLocalPrivacyCommitter;
  }
  execute(command: OptionsMutationCommand): Promise<OptionsMutationSuccessResult> {
    return this.initialize().then(() => this.enqueue(() => this.executeQueued(command)));
  }
  initialize(): Promise<void> {
    if (this.initialization) return this.initialization;
    const pending = this.enqueue(async () => {
      await this.deviceLocalPrivacyCommitter?.recover?.();
      await this.options.deviceLocalVaultCleanupJournal?.recover();
      await this.executeQueued({ kind: 'migrate' }, false);
    });
    return (this.initialization = pending.catch((error) => {
      this.initialization = undefined;
      throw error;
    }));
  }
  patch(patches: readonly OptionsPatch[]): Promise<OptionsMutationSuccessResult> {
    return this.execute({ kind: 'patch', patches });
  }
  replace(
    replacement: Extract<OptionsMutationCommand, { kind: 'replace' }>['replacement']
  ): Promise<OptionsMutationSuccessResult> {
    return this.execute({ kind: 'replace', replacement });
  }
  migrate(): Promise<OptionsMutationSuccessResult> {
    return this.execute({ kind: 'migrate' });
  }
  async readLegacyUsageStats(): Promise<PlainStructuredValue | undefined> {
    await this.initialize();
    return this.enqueue(async () => {
      const raw = await this.repository.readRaw();
      return isObject(raw) ? clone(raw.usageStats) : undefined;
    });
  }
  async deleteLegacyUsageStatsRoot(): Promise<OptionsMutationSuccessResult> {
    await this.initialize();
    return this.enqueue(() => this.deleteLegacyUsageStatsRootQueued());
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.tail.then(operation);
    this.tail = queued.then(
      () => undefined,
      () => undefined
    );
    return queued;
  }
  private async executeQueued(
    command: OptionsMutationCommand,
    recoverVault = true
  ): Promise<OptionsMutationSuccessResult> {
    if (recoverVault) await this.options.deviceLocalVaultCleanupJournal?.recover();
    const operationId = this.createOperationId();
    const vaultResult = this.deviceLocalPrivacyCommitter
      ? await executeDeviceLocalVaultBindingMutation(
          command,
          resolveVaultContext(this.repository, command),
          this.deviceLocalPrivacyCommitter,
          this.quotaBytesPerItem,
          operationId,
          this.options.deviceLocalVaultCleanupJournal,
          (raw, queued) => this.applyCommand(raw, queued)
        )
      : null;
    if (vaultResult) return vaultResult;
    if (this.deviceLocalPrivacyCommitter) {
      try {
        const result = await this.deviceLocalPrivacyCommitter.execute(
          command,
          (raw, queuedCommand) => this.applyCommand(raw, queuedCommand),
          this.quotaBytesPerItem
        );
        const runtime = decodeStoredOptions(result.raw).runtime;
        return {
          snapshot: result.privacy ? composeDeviceLocalPrivacy(runtime, result.privacy) : runtime,
          operationId,
          rawSignature: optionsRawSignature(result.raw),
          didWrite: result.didWrite
        };
      } catch (error) {
        if (error instanceof OptionsMutationError) throw error;
        throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
      }
    }
    return this.writeWithRetry(operationId, (raw) => this.applyCommand(raw, command));
  }
  private applyCommand(
    raw: PlainStructuredObject,
    command: OptionsMutationCommand
  ): { next: PlainStructuredObject; verification: OptionsMutationVerification } {
    if (command.kind === 'patch') {
      let next = raw;
      for (const patch of command.patches) {
        const result = applyStoredOptionsPatch(next, patch);
        if (!result.success) throw new OptionsMutationError('OPTIONS_MUTATION_REJECTED');
        next = result.value;
      }
      return { next, verification: expectedPatchValues(next, command.patches) };
    }
    if (command.kind === 'replace') {
      const encoded = encodeStoredOptionsReplacement(command.replacement);
      if (!encoded.success) throw new OptionsMutationError('OPTIONS_REPLACEMENT_REJECTED');
      const snapshot = snapshotPlainStructuredData(encoded.value);
      if (!snapshot.ok || !isObject(snapshot.value)) {
        throw new OptionsMutationError('OPTIONS_REPLACEMENT_REJECTED');
      }
      return {
        next: snapshot.value,
        verification: { kind: 'full', expected: snapshot.value }
      };
    }
    const decoded = decodeStoredOptions(raw);
    if (!decoded.automaticWritebackIsLossless || decoded.migrations.length === 0) {
      return { next: raw, verification: { kind: 'full', expected: raw } };
    }
    return {
      next: decoded.normalizedRaw,
      verification: migrationVerification(raw)
    };
  }
  private async deleteLegacyUsageStatsRootQueued(): Promise<OptionsMutationSuccessResult> {
    const operationId = this.createOperationId();
    return this.writeWithRetry(operationId, (raw) => {
      if (!Object.prototype.hasOwnProperty.call(raw, 'usageStats')) {
        return { next: raw, verification: { kind: 'full', expected: raw } };
      }
      const next = { ...raw };
      delete next.usageStats;
      return {
        next,
        verification: {
          kind: 'paths',
          expected: [{ path: ['usageStats'], value: undefined }]
        }
      };
    });
  }
  private async writeWithRetry(
    operationId: string,
    createMutation: (raw: PlainStructuredObject) => {
      next: PlainStructuredObject;
      verification: OptionsMutationVerification;
    }
  ): Promise<OptionsMutationSuccessResult> {
    for (let attempt = 0; attempt <= this.maxExternalDriftRetries; attempt += 1) {
      let raw: PlainStructuredObject;
      try {
        raw = normalizeRaw(await this.repository.readRaw());
      } catch (error) {
        if (error instanceof OptionsMutationError) throw error;
        throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
      }
      const { next, verification } = createMutation(raw);
      if (optionsValuesEqual(raw, next)) {
        return {
          snapshot: decodeStoredOptions(next).runtime,
          operationId,
          rawSignature: optionsRawSignature(next),
          didWrite: false
        };
      }
      if (optionsEnvelopeBytes(next) > this.quotaBytesPerItem) {
        throw new OptionsMutationError('OPTIONS_QUOTA_EXCEEDED');
      }
      try {
        await this.repository.writeRaw(next);
        await this.yieldAfterWrite();
        const readback = normalizeRaw(await this.repository.readRaw());
        if (optionsVerificationMatches(readback, verification)) {
          return {
            snapshot: decodeStoredOptions(readback).runtime,
            operationId,
            rawSignature: optionsRawSignature(readback),
            didWrite: true
          };
        }
      } catch (error) {
        if (error instanceof OptionsMutationError) throw error;
        throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
      }
    }
    throw new OptionsMutationError('EXTERNAL_SYNC_CONFLICT');
  }
}
export const createOptionsMutationCoordinator = (
  repository: OptionsRawStorageRepository,
  options?: OptionsMutationCoordinatorOptions
): OptionsMutationCoordinator => new OptionsMutationCoordinator(repository, options);
export function createBackgroundOptionsRepository(
  reader: BackgroundOptionsReader,
  coordinator: OptionsMutationCoordinator
): IOptionsRepository {
  return {
    async get(): Promise<CompleteOptions> {
      const decoded = await reader.readDecoded();
      if (decoded.automaticWritebackIsLossless && decoded.migrations.length > 0) {
        return clone((await coordinator.migrate()).snapshot);
      }
      return clone(decoded.runtime);
    },
    async patch(patches: OptionsPatch | readonly OptionsPatch[]): Promise<CompleteOptions> {
      const batch = Array.isArray(patches) ? patches : [patches];
      if (batch.length === 0) throw new OptionsMutationError('INVALID_OPTIONS_MUTATION');
      return clone((await coordinator.patch(batch)).snapshot);
    },
    async replace(options: StoredOptions | CompleteOptions): Promise<CompleteOptions> {
      const encoded = encodeStoredOptionsReplacement(options);
      if (!encoded.success) throw new OptionsMutationError('OPTIONS_REPLACEMENT_REJECTED');
      return clone((await coordinator.replace(encoded.value)).snapshot);
    },
    onChange: (callback: (options: CompleteOptions) => void) => reader.onChange(callback)
  };
}
