import {
  decodeDeviceLocalVaultRecoveryTransaction,
  type DeviceLocalVaultBindingSnapshot,
  type DeviceLocalVaultRecoveryPhaseV3
} from './deviceLocalVaultRecoveryTransaction';
import type { PlainStructuredObject } from './losslessObjectBoundaryTypes';
import type { PrivacyPreferencesOptions } from '../types/options';

const PUBLICATION_CLOSED_PHASES: ReadonlySet<DeviceLocalVaultRecoveryPhaseV3> = new Set([
  'prepared',
  'forward-inflight',
  'forward-committed',
  'local-commit-inflight',
  'compensating',
  'portable-privacy-restored'
]);

export type DeviceLocalVaultAuthoritativePublication =
  | { readonly kind: 'physical' }
  | {
      readonly kind: 'preimage';
      readonly portableRaw: PlainStructuredObject;
      readonly privacy: PrivacyPreferencesOptions;
      readonly bindings: DeviceLocalVaultBindingSnapshot;
    };

export async function resolveDeviceLocalVaultAuthoritativePublication(
  rawJournal: unknown
): Promise<DeviceLocalVaultAuthoritativePublication> {
  const decoded = await decodeDeviceLocalVaultRecoveryTransaction(rawJournal);
  if (
    decoded.kind !== 'v3-transaction' ||
    !PUBLICATION_CLOSED_PHASES.has(decoded.transaction.phase)
  ) {
    return { kind: 'physical' };
  }
  return {
    kind: 'preimage',
    portableRaw: structuredClone(decoded.transaction.portable.preimage),
    privacy: structuredClone(decoded.transaction.privacy.restoreTarget),
    bindings: structuredClone(decoded.transaction.previousBindings)
  };
}

export async function readDeviceLocalVaultAuthoritativePublication<T>(input: {
  readonly readJournal: () => Promise<unknown>;
  readonly readPhysical: () => Promise<T>;
  readonly composePreimage: (
    publication: Extract<DeviceLocalVaultAuthoritativePublication, { kind: 'preimage' }>
  ) => Promise<T> | T;
}): Promise<T> {
  const first = await resolveDeviceLocalVaultAuthoritativePublication(await input.readJournal());
  if (first.kind === 'preimage') return input.composePreimage(first);
  const physical = await input.readPhysical();
  const second = await resolveDeviceLocalVaultAuthoritativePublication(await input.readJournal());
  return second.kind === 'preimage' ? input.composePreimage(second) : physical;
}
