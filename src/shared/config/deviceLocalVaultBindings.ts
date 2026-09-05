import { plainStructuredDataEqual } from './losslessObjectBoundary';
import type { PlainStructuredObject, PlainStructuredValue } from './losslessObjectBoundaryTypes';
import { decodeStoredOptions } from './storedOptionsCodec';
import { composeDeviceLocalPrivacy } from './deviceLocalPrivacy';
import type { DeviceLocalVaultCleanupJournal } from './deviceLocalVaultCleanupJournal';
import {
  asOptionsMutationError,
  deviceLocalVaultRecoveryCode,
  type DeviceLocalPrivacyCommitter,
  type DeviceLocalVaultBindingRepository,
  type DeviceLocalVaultBindingSnapshot,
  type OptionsMutationVerification
} from './deviceLocalVaultRecoveryTransaction';
import {
  OptionsMutationError,
  type OptionsMutationCommand,
  type OptionsMutationSuccessResult
} from '../types/optionsMutationMessages';
import type { CompleteOptions, StoredOptions } from '../types/options';
export const DEVICE_LOCAL_VAULT_BINDINGS_KEY = 'deviceLocalVaultBindings';
type VaultBinding = { readonly folderId: string; readonly folderName: string };
type VaultBindingBoundary = PlainStructuredValue | object | undefined;
export type { DeviceLocalVaultBindingSnapshot } from './deviceLocalVaultRecoveryTransaction';
const record = (value: VaultBindingBoundary): value is PlainStructuredObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export function optionsRawSignature(raw: PlainStructuredObject): string {
  const bytes = new TextEncoder().encode(JSON.stringify(raw));
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul((hash ^ byte) >>> 0, 0x01000193) >>> 0;
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}:${bytes.byteLength}`;
}
export function optionsValuesEqual(
  left: PlainStructuredValue | undefined,
  right: PlainStructuredValue | undefined
): boolean {
  if (left === undefined || right === undefined) return left === right;
  const result = plainStructuredDataEqual(left, right);
  return result.ok && result.equal;
}
const readPath = (raw: PlainStructuredObject, path: readonly string[]) =>
  path.reduce<PlainStructuredValue | undefined>(
    (current, part) => (record(current) ? current[part] : undefined),
    raw
  );
export const optionsVerificationMatches = (
  raw: PlainStructuredObject,
  verification: OptionsMutationVerification
): boolean =>
  verification.kind === 'full'
    ? optionsValuesEqual(raw, verification.expected)
    : verification.expected.every(({ path, value }) =>
        optionsValuesEqual(readPath(raw, path), value)
      );
const normalizeBinding = (value: VaultBindingBoundary): VaultBinding | null => {
  if (!record(value)) return null;
  const folderId = typeof value.folderId === 'string' ? value.folderId.trim() : '';
  const folderName = typeof value.folderName === 'string' ? value.folderName.trim() : '';
  return folderId && folderName ? { folderId, folderName } : null;
};
const folderBinding = (value: VaultBindingBoundary) =>
  record(value)
    ? normalizeBinding({ folderId: value.localFolderId, folderName: value.localFolderName })
    : null;
const applyBinding = <T extends object>(value: T, binding?: VaultBinding): T => {
  const target = value as T &
    Partial<Record<'localFolderId' | 'localFolderName', string | undefined>>;
  delete target.localFolderId;
  delete target.localFolderName;
  if (binding)
    Object.assign(target, { localFolderId: binding.folderId, localFolderName: binding.folderName });
  return value;
};
export function normalizeDeviceLocalVaultBindingSnapshot(
  value: VaultBindingBoundary
): DeviceLocalVaultBindingSnapshot {
  const bindings: Record<string, VaultBinding> = {};
  if (record(value) && value.version === 1 && record(value.bindings)) {
    for (const [id, candidate] of Object.entries(value.bindings)) {
      const binding = normalizeBinding(candidate);
      if (id.trim() && binding) bindings[id.trim()] = binding;
    }
  }
  return { version: 1, bindings };
}
const defaultVaultId = (options: CompleteOptions) => {
  const router = options.vaultRouter;
  if (!router) return 'default';
  return (
    router.vaults.find(({ id }) => id === router.defaultVaultId)?.id ??
    router.vaults.find(({ isDefault }) => isDefault)?.id ??
    router.vaults[0]?.id ??
    'default'
  );
};
export function reconcileDeviceLocalVaultBindings(
  options: CompleteOptions,
  snapshot: DeviceLocalVaultBindingSnapshot
): DeviceLocalVaultBindingSnapshot {
  const ids = new Set(options.vaultRouter?.vaults.map(({ id }) => id) ?? ['default']);
  return {
    version: 1,
    bindings: Object.fromEntries(Object.entries(snapshot.bindings).filter(([id]) => ids.has(id)))
  };
}
export function captureDeviceLocalVaultBindings(
  options: CompleteOptions,
  source: 'rest' | 'vaultRouter'
): DeviceLocalVaultBindingSnapshot {
  const bindings: Record<string, VaultBinding> = {};
  for (const vault of options.vaultRouter?.vaults ?? []) {
    const binding = folderBinding(vault);
    if (vault.id.trim() && binding) bindings[vault.id.trim()] = binding;
  }
  const rest = folderBinding(options.rest);
  if (rest && source === 'rest') bindings[defaultVaultId(options)] = rest;
  return reconcileDeviceLocalVaultBindings(options, { version: 1, bindings });
}
export function composeDeviceLocalVaultBindings(
  options: CompleteOptions,
  snapshot: DeviceLocalVaultBindingSnapshot
): CompleteOptions {
  const next = structuredClone(options);
  if (next.vaultRouter) {
    next.vaultRouter.vaults = next.vaultRouter.vaults.map((vault) =>
      applyBinding({ ...vault }, snapshot.bindings[vault.id])
    );
  }
  applyBinding(next.rest, snapshot.bindings[defaultVaultId(next)]);
  return next;
}
export function scrubDeviceLocalVaultBindings(value: StoredOptions): StoredOptions;
export function scrubDeviceLocalVaultBindings(value: PlainStructuredObject): PlainStructuredObject;
export function scrubDeviceLocalVaultBindings(value: StoredOptions | PlainStructuredObject) {
  const next = { ...value } as PlainStructuredObject;
  if (record(next.rest)) {
    next.rest = applyBinding({ ...next.rest });
  }
  if (record(next.vaultRouter) && Array.isArray(next.vaultRouter.vaults)) {
    next.vaultRouter = {
      ...next.vaultRouter,
      vaults: next.vaultRouter.vaults.map((candidate) => {
        if (!record(candidate)) return candidate;
        return applyBinding({ ...candidate });
      })
    };
  }
  return next;
}
const composeRaw = (raw: PlainStructuredObject, snapshot: DeviceLocalVaultBindingSnapshot) => {
  const next = scrubDeviceLocalVaultBindings(structuredClone(raw));
  const binding = snapshot.bindings[defaultVaultId(decodeStoredOptions(raw).runtime)];
  if (record(next.rest)) applyBinding(next.rest, binding);
  if (record(next.vaultRouter) && Array.isArray(next.vaultRouter.vaults)) {
    next.vaultRouter.vaults = next.vaultRouter.vaults.map((candidate) => {
      if (!record(candidate) || typeof candidate.id !== 'string') return candidate;
      return applyBinding(candidate, snapshot.bindings[candidate.id]);
    });
  }
  return next;
};
export async function executeDeviceLocalVaultBindingMutation(
  command: OptionsMutationCommand,
  context: {
    readonly repository: DeviceLocalVaultBindingRepository;
    readonly source: 'rest' | 'vaultRouter';
  } | null,
  committer: DeviceLocalPrivacyCommitter,
  quotaBytesPerItem: number,
  operationId: string,
  cleanupJournal: DeviceLocalVaultCleanupJournal | undefined,
  applyCommand: (
    raw: PlainStructuredObject,
    command: OptionsMutationCommand
  ) => { next: PlainStructuredObject; verification: OptionsMutationVerification }
): Promise<OptionsMutationSuccessResult | null> {
  if (!context) return null;
  const { repository: vaultRepository, source } = context;
  const previous = await vaultRepository
    .readVaultBindings()
    .catch(() => Promise.reject(new OptionsMutationError('OPTIONS_STORAGE_FAILURE')));
  let next = previous;
  let bindingsChanged = false;
  const apply = (raw: PlainStructuredObject, queued: OptionsMutationCommand) => {
    const mutation = applyCommand(composeRaw(raw, previous), queued);
    next = captureDeviceLocalVaultBindings(decodeStoredOptions(mutation.next).runtime, source);
    const equality = plainStructuredDataEqual(previous, next);
    bindingsChanged = !equality.ok || !equality.equal;
    const portable = scrubDeviceLocalVaultBindings(mutation.next);
    const verification: OptionsMutationVerification =
      mutation.verification.kind === 'full'
        ? { kind: 'full', expected: portable }
        : {
            kind: 'paths',
            expected: mutation.verification.expected.map(({ path }) => ({
              path,
              value: readPath(portable, path)
            }))
          };
    return { next: portable, verification };
  };
  let result: Awaited<ReturnType<DeviceLocalPrivacyCommitter['execute']>>;
  let recoveredCommit = false,
    prepared = false;
  try {
    result = await committer.execute(command, apply, quotaBytesPerItem, {
      beforePortableDecision: async (attempt) => {
        if (!cleanupJournal || !bindingsChanged) return;
        await cleanupJournal.prepare({
          ...attempt,
          transactionId: operationId,
          previousBindings: previous,
          proposedBindings: next
        });
        prepared = true;
      },
      beforeForwardMutation: async () => {
        if (!cleanupJournal || !prepared) return false;
        await cleanupJournal.beginForward();
        return true;
      }
    });
  } catch (error) {
    try {
      const code = deviceLocalVaultRecoveryCode(error);
      const recovery = await cleanupJournal?.recover(false, code, true);
      if (recovery) {
        result = recovery;
        recoveredCommit = true;
      } else throw asOptionsMutationError(error);
    } catch (recoveryError) {
      throw asOptionsMutationError(recoveryError);
    }
  }
  try {
    if (!recoveredCommit && bindingsChanged)
      await (cleanupJournal?.recover(false, 'OPTIONS_STORAGE_FAILURE', true) ??
        vaultRepository.writeVaultBindings(next));
  } catch (error) {
    throw asOptionsMutationError(error);
  }
  let snapshot = decodeStoredOptions(result.raw).runtime;
  if (result.privacy) snapshot = composeDeviceLocalPrivacy(snapshot, result.privacy);
  return {
    snapshot: composeDeviceLocalVaultBindings(snapshot, next),
    operationId,
    rawSignature: optionsRawSignature(result.raw),
    didWrite: result.didWrite || bindingsChanged
  };
}
