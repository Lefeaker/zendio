import {
  applyStoredOptionsPatch,
  decodeStoredOptions,
  encodeStoredOptionsReplacement,
  type DecodedStoredOptions
} from '../../shared/config/storedOptionsCodec';
import {
  plainStructuredDataEqual,
  snapshotPlainStructuredData
} from '../../shared/config/losslessObjectBoundary';
import type {
  PlainStructuredObject,
  PlainStructuredValue
} from '../../shared/config/losslessObjectBoundaryTypes';
import {
  composeDeviceLocalPrivacy,
  containsDeviceLocalPrivacy,
  omitDeviceLocalPrivacy
} from '../../shared/config/deviceLocalPrivacy';
import type {
  DeviceLocalPrivacyRepository,
  OptionsRawStorageRepository
} from '../../infrastructure/repositories/ChromeOptionsRepository';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
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
  deviceLocalPrivacy?: DeviceLocalPrivacyRepository;
}

export interface BackgroundOptionsReader {
  get(): Promise<CompleteOptions>;
  readDecoded(): Promise<DecodedStoredOptions>;
  onChange(callback: (options: CompleteOptions) => void): () => void;
}

type Verification =
  | { readonly kind: 'full'; readonly expected: PlainStructuredObject }
  | {
      readonly kind: 'paths';
      readonly expected: ReadonlyArray<{
        readonly path: readonly string[];
        readonly value: PlainStructuredValue | undefined;
      }>;
    };

function isObject(value: PlainStructuredValue | null): value is PlainStructuredObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return globalThis.structuredClone(value);
}

function createDefaultOperationId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `options-${globalThis.crypto.randomUUID()}`;
  }
  return `options-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function platformQuotaBytesPerItem(): number | undefined {
  if (typeof chrome === 'undefined') return undefined;
  const candidate = chrome.storage?.sync?.QUOTA_BYTES_PER_ITEM;
  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0
    ? candidate
    : undefined;
}

function resolveQuotaBytesPerItem(configured?: number): number {
  const candidates = [DEFAULT_OPTIONS_QUOTA_BYTES_PER_ITEM, configured, platformQuotaBytesPerItem()]
    .filter((value): value is number => typeof value === 'number')
    .filter((value) => Number.isFinite(value) && value > 0);
  return Math.min(...candidates);
}

function envelopeBytes(raw: PlainStructuredObject): number {
  return new TextEncoder().encode(JSON.stringify({ options: raw })).byteLength;
}

function rawSignature(raw: PlainStructuredObject): string {
  const bytes = new TextEncoder().encode(JSON.stringify(raw));
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}:${bytes.byteLength}`;
}

function readPath(
  raw: PlainStructuredObject,
  path: readonly string[]
): PlainStructuredValue | undefined {
  let current: PlainStructuredValue | undefined = raw;
  for (const part of path) {
    const candidate: PlainStructuredValue | null = current ?? null;
    if (!isObject(candidate) || !Object.prototype.hasOwnProperty.call(candidate, part)) {
      return undefined;
    }
    current = candidate[part];
  }
  return current;
}

type ComparableValue = Parameters<typeof plainStructuredDataEqual>[0];

function valuesEqual(left: ComparableValue, right: ComparableValue): boolean {
  if (left === undefined || right === undefined) return left === right;
  const comparison = plainStructuredDataEqual(left, right);
  return comparison.ok && comparison.equal;
}

function verificationMatches(raw: PlainStructuredObject, verification: Verification): boolean {
  if (verification.kind === 'full') return valuesEqual(raw, verification.expected);
  return verification.expected.every(({ path, value }) => valuesEqual(readPath(raw, path), value));
}

function expectedPatchValues(
  raw: PlainStructuredObject,
  patches: readonly OptionsPatch[]
): Extract<Verification, { kind: 'paths' }> {
  const paths = new Map<string, readonly string[]>();
  for (const patch of patches) paths.set(JSON.stringify(patch.path), patch.path);
  return {
    kind: 'paths',
    expected: [...paths.values()].map((path) => ({ path, value: readPath(raw, path) }))
  };
}

function migrationVerification(
  raw: PlainStructuredObject
): Extract<Verification, { kind: 'paths' }> {
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
  if (!snapshot.ok || !isObject(snapshot.value)) {
    throw new OptionsMutationError('OPTIONS_MUTATION_REJECTED');
  }
  return snapshot.value;
}

export class OptionsMutationCoordinator {
  private tail: Promise<void> = Promise.resolve();
  private readonly quotaBytesPerItem: number;
  private readonly maxExternalDriftRetries: number;
  private readonly createOperationId: () => string;
  private readonly yieldAfterWrite: () => Promise<void>;
  private readonly deviceLocalPrivacy?: DeviceLocalPrivacyRepository;

  constructor(
    private readonly repository: OptionsRawStorageRepository,
    options: OptionsMutationCoordinatorOptions = {}
  ) {
    this.quotaBytesPerItem = resolveQuotaBytesPerItem(options.quotaBytesPerItem);
    this.maxExternalDriftRetries =
      options.maxExternalDriftRetries ?? DEFAULT_EXTERNAL_DRIFT_RETRIES;
    this.createOperationId = options.createOperationId ?? createDefaultOperationId;
    this.yieldAfterWrite =
      options.yieldAfterWrite ??
      (() => new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0)));
    this.deviceLocalPrivacy = options.deviceLocalPrivacy;
  }

  execute(command: OptionsMutationCommand): Promise<OptionsMutationSuccessResult> {
    return this.enqueue(() => this.executeQueued(command));
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

  readLegacyUsageStats(): Promise<PlainStructuredValue | undefined> {
    return this.enqueue(async () => {
      const raw = await this.repository.readRaw();
      return isObject(raw) ? clone(raw.usageStats) : undefined;
    });
  }

  deleteLegacyUsageStatsRoot(): Promise<OptionsMutationSuccessResult> {
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
    command: OptionsMutationCommand
  ): Promise<OptionsMutationSuccessResult> {
    const operationId = this.createOperationId();
    try {
      await this.deviceLocalPrivacy?.recoverPrivacyCommit();
    } catch {
      throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
    }
    return this.writeWithRetry(operationId, async (raw) => {
      const privacy = await this.deviceLocalPrivacy?.ensurePrivacyBaseline(raw);
      const composed = privacy
        ? { ...raw, privacyPreferences: clone(privacy) }
        : raw;
      const mutation = this.applyCommand(composed, command);
      const mutatesPrivacy = this.commandMutatesPrivacy(command);
      const nextPrivacy = privacy
        ? mutatesPrivacy
          ? decodeStoredOptions(mutation.next).runtime.privacyPreferences
          : privacy
        : undefined;
      const next = privacy ? omitDeviceLocalPrivacy(mutation.next) : mutation.next;
      return {
        next,
        verification: privacy
          ? this.createPortableVerification(raw, next, command)
          : mutation.verification,
        privacy: nextPrivacy,
        writePrivacy:
          nextPrivacy !== undefined &&
          (containsDeviceLocalPrivacy(raw) || mutatesPrivacy)
      };
    });
  }

  private commandMutatesPrivacy(command: OptionsMutationCommand): boolean {
    if (command.kind === 'patch') {
      return command.patches.some((patch) => patch.path[0] === 'privacyPreferences');
    }
    if (command.kind === 'replace') {
      return Object.prototype.hasOwnProperty.call(command.replacement, 'privacyPreferences');
    }
    return false;
  }

  private createPortableVerification(
    raw: PlainStructuredObject,
    next: PlainStructuredObject,
    command: OptionsMutationCommand
  ): Verification {
    if (command.kind === 'replace') return { kind: 'full', expected: next };
    if (command.kind === 'migrate') {
      const verification = migrationVerification(raw);
      return verification.kind === 'paths'
        ? {
            kind: 'paths',
            expected: [
              ...verification.expected.filter(({ path }) => path[0] !== 'privacyPreferences'),
              { path: ['privacyPreferences'], value: undefined }
            ]
          }
        : verification;
    }
    const portablePatches = command.patches.filter(
      (patch) => patch.path[0] !== 'privacyPreferences'
    );
    const verification = expectedPatchValues(next, portablePatches);
    return {
      kind: 'paths',
      expected: [
        ...verification.expected,
        { path: ['privacyPreferences'], value: undefined }
      ]
    };
  }

  private applyCommand(
    raw: PlainStructuredObject,
    command: OptionsMutationCommand
  ): { next: PlainStructuredObject; verification: Verification } {
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
    return this.writeWithRetry(operationId, async (raw) => {
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
    createMutation: (raw: PlainStructuredObject) => Promise<{
      next: PlainStructuredObject;
      verification: Verification;
      privacy?: CompleteOptions['privacyPreferences'];
      writePrivacy?: boolean;
    }>
  ): Promise<OptionsMutationSuccessResult> {
    for (let attempt = 0; attempt <= this.maxExternalDriftRetries; attempt += 1) {
      let raw: PlainStructuredObject;
      try {
        raw = normalizeRaw(await this.repository.readRaw());
      } catch (error) {
        if (error instanceof OptionsMutationError) throw error;
        throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
      }
      const { next, verification, privacy, writePrivacy } = await createMutation(raw);
      const portableWriteRequired = !valuesEqual(raw, next);
      if (portableWriteRequired && envelopeBytes(next) > this.quotaBytesPerItem) {
        throw new OptionsMutationError('OPTIONS_QUOTA_EXCEEDED');
      }
      const privacyCommitRequired = writePrivacy && privacy && this.deviceLocalPrivacy;
      if (privacyCommitRequired) {
        try {
          await this.deviceLocalPrivacy.beginPrivacyCommit(privacy);
        } catch {
          await this.rollbackPrivacyAfterFailure();
          throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
        }
      }
      if (!portableWriteRequired) {
        if (privacyCommitRequired) await this.commitPrivacyOrRollback(privacy);
        const runtime = decodeStoredOptions(next).runtime;
        return {
          snapshot: privacy ? composeDeviceLocalPrivacy(runtime, privacy) : runtime,
          operationId,
          rawSignature: rawSignature(next),
          didWrite: writePrivacy === true
        };
      }
      try {
        await this.repository.writeRaw(next);
        await this.yieldAfterWrite();
        const readback = normalizeRaw(await this.repository.readRaw());
        if (verificationMatches(readback, verification)) {
          if (privacyCommitRequired) await this.commitPrivacyOrRollback(privacy, raw);
          const runtime = decodeStoredOptions(readback).runtime;
          return {
            snapshot: privacy ? composeDeviceLocalPrivacy(runtime, privacy) : runtime,
            operationId,
            rawSignature: rawSignature(readback),
            didWrite: true
          };
        }
      } catch (error) {
        if (privacyCommitRequired) await this.rollbackPrivacyAfterFailure();
        if (error instanceof OptionsMutationError) throw error;
        throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
      }
      if (privacyCommitRequired) await this.rollbackPrivacyAfterFailure();
    }
    throw new OptionsMutationError('EXTERNAL_SYNC_CONFLICT');
  }

  private async commitPrivacyOrRollback(
    privacy: CompleteOptions['privacyPreferences'],
    previousRaw?: PlainStructuredObject
  ): Promise<void> {
    try {
      await this.deviceLocalPrivacy?.commitPrivacy(privacy);
    } catch {
      if (previousRaw && containsDeviceLocalPrivacy(previousRaw)) {
        await this.restorePrivacyMirror(previousRaw.privacyPreferences);
      }
      await this.rollbackPrivacyAfterFailure();
      throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
    }
  }

  private async restorePrivacyMirror(previousPrivacy: PlainStructuredValue): Promise<void> {
    for (let attempt = 0; attempt <= this.maxExternalDriftRetries; attempt += 1) {
      try {
        const current = normalizeRaw(await this.repository.readRaw());
        await this.repository.writeRaw({
          ...current,
          privacyPreferences: clone(previousPrivacy)
        });
        await this.yieldAfterWrite();
        const readback = normalizeRaw(await this.repository.readRaw());
        if (valuesEqual(readback.privacyPreferences, previousPrivacy)) return;
      } catch {
        // Retry the bounded compensation against the newest observed raw snapshot.
      }
    }
    throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
  }

  private async rollbackPrivacyAfterFailure(): Promise<void> {
    try {
      await this.deviceLocalPrivacy?.rollbackPrivacyCommit();
    } catch {
      throw new OptionsMutationError('OPTIONS_STORAGE_FAILURE');
    }
  }
}

export function createOptionsMutationCoordinator(
  repository: OptionsRawStorageRepository,
  options?: OptionsMutationCoordinatorOptions
): OptionsMutationCoordinator {
  return new OptionsMutationCoordinator(repository, options);
}

/**
 * Background callers share the coordinator directly. They never message the
 * service worker back into itself and never gain access to raw storage writes.
 */
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
    onChange(callback: (options: CompleteOptions) => void): () => void {
      return reader.onChange(callback);
    }
  };
}
