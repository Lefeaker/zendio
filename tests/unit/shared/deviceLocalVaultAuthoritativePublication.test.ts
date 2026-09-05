import type { PrivacyPreferencesOptions } from '@shared/types/options';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readDeviceLocalVaultAuthoritativePublication,
  resolveDeviceLocalVaultAuthoritativePublication
} from '@shared/config/deviceLocalVaultAuthoritativePublication';
import {
  createPreparedDeviceLocalVaultRecoveryTransaction,
  type DeviceLocalVaultBindingSnapshot,
  type DeviceLocalVaultRecoveryTransactionV3
} from '@shared/config/deviceLocalVaultRecoveryTransaction';

const privacy0: PrivacyPreferencesOptions = {
  analytics: false,
  errorReporting: false,
  debugMode: false
};
const privacy1: PrivacyPreferencesOptions = {
  analytics: true,
  errorReporting: false,
  debugMode: false
};
const bindings0: DeviceLocalVaultBindingSnapshot = {
  version: 1,
  bindings: { primary: { folderId: 'folder-old', folderName: 'Old Folder' } }
};
const bindings1: DeviceLocalVaultBindingSnapshot = {
  version: 1,
  bindings: { primary: { folderId: 'folder-new', folderName: 'New Folder' } }
};

async function transaction(
  phase: DeviceLocalVaultRecoveryTransactionV3['phase'] = 'forward-inflight'
): Promise<DeviceLocalVaultRecoveryTransactionV3> {
  const prepared = await createPreparedDeviceLocalVaultRecoveryTransaction({
    transactionId: 'publication-1',
    previousBindings: bindings0,
    proposedBindings: bindings1,
    portablePreimage: { revision: 0 },
    portableProposal: { revision: 1 },
    writeRequired: true,
    privacyRestoreTarget: privacy0,
    privacyForwardTarget: privacy1,
    privacyWriteRequired: true
  });
  let portable: DeviceLocalVaultRecoveryTransactionV3['portable'] = prepared.portable;
  let privacy: DeviceLocalVaultRecoveryTransactionV3['privacy'] = prepared.privacy;
  let recovery: DeviceLocalVaultRecoveryTransactionV3['recovery'];
  if (
    ['forward-committed', 'local-commit-inflight', 'local-committed', 'cleanup-complete'].includes(
      phase
    )
  ) {
    portable = {
      ...prepared.portable,
      observedCommittedIdentity: prepared.portable.proposedIdentity
    };
    privacy = { ...prepared.privacy, observedForward: 'exact-target-readback' };
  }
  if (phase === 'compensating' || phase === 'portable-privacy-restored') {
    recovery =
      phase === 'portable-privacy-restored'
        ? {
            outcomeCode: 'OPTIONS_STORAGE_FAILURE',
            bindingWriteMayHaveOccurred: true,
            portableRestoreEvidence: 'preimage',
            privacyRestoreEvidence: 'restore-target'
          }
        : { outcomeCode: 'OPTIONS_STORAGE_FAILURE', bindingWriteMayHaveOccurred: true };
  }
  return {
    ...prepared,
    portable,
    privacy,
    phase,
    ...(recovery ? { recovery } : {}),
    ...(phase === 'cleanup-complete' ? { remainingCleanupCandidates: [] } : {}),
    ...(phase === 'aborted' ? { abortReason: 'local-commit-failed' } : {})
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('device local vault authoritative publication', () => {
  it('projects the durable preimage for every valid nonterminal v3 phase', async () => {
    const phases: readonly DeviceLocalVaultRecoveryTransactionV3['phase'][] = [
      'prepared',
      'forward-inflight',
      'forward-committed',
      'local-commit-inflight',
      'compensating',
      'portable-privacy-restored'
    ];
    for (const phase of phases) {
      await expect(
        resolveDeviceLocalVaultAuthoritativePublication(await transaction(phase))
      ).resolves.toMatchObject({
        kind: 'preimage',
        portableRaw: { revision: 0 },
        privacy: privacy0,
        bindings: bindings0
      });
    }
  });

  it('does not activate the barrier for terminal, malformed, v1, or v2 records', async () => {
    for (const candidate of [
      await transaction('local-committed'),
      await transaction('cleanup-complete'),
      await transaction('aborted'),
      { version: 1, folderIds: ['folder-old'] },
      { version: 2, phase: 'prepared' },
      { version: 3, phase: 'forward-inflight' }
    ]) {
      await expect(resolveDeviceLocalVaultAuthoritativePublication(candidate)).resolves.toEqual({
        kind: 'physical'
      });
    }
  });

  it('returns a closed first sample without reading physical state', async () => {
    const readPhysical = vi.fn(() => Promise.resolve('partial'));
    const composePreimage = vi.fn(() => 'preimage');

    await expect(
      readDeviceLocalVaultAuthoritativePublication({
        readJournal: () => transaction('forward-inflight'),
        readPhysical,
        composePreimage
      })
    ).resolves.toBe('preimage');

    expect(readPhysical).not.toHaveBeenCalled();
    expect(composePreimage).toHaveBeenCalledOnce();
  });

  it('discards a partial physical snapshot when the second sample closes', async () => {
    const prepared = await transaction('prepared');
    const readJournal = vi
      .fn<() => Promise<DeviceLocalVaultRecoveryTransactionV3 | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(prepared);

    await expect(
      readDeviceLocalVaultAuthoritativePublication({
        readJournal,
        readPhysical: () => Promise.resolve('partial'),
        composePreimage: () => 'preimage'
      })
    ).resolves.toBe('preimage');

    expect(readJournal).toHaveBeenCalledTimes(2);
  });

  it('fails closed when journal access or validation is unavailable', async () => {
    await expect(
      readDeviceLocalVaultAuthoritativePublication({
        readJournal: () => Promise.reject(new Error('crypto unavailable')),
        readPhysical: () => Promise.resolve('partial'),
        composePreimage: () => 'preimage'
      })
    ).rejects.toThrow('crypto unavailable');

    const candidate = await transaction('forward-inflight');
    vi.stubGlobal('crypto', undefined);
    await expect(
      readDeviceLocalVaultAuthoritativePublication({
        readJournal: () => Promise.resolve(candidate),
        readPhysical: () => Promise.resolve('partial'),
        composePreimage: () => 'preimage'
      })
    ).rejects.toThrow('PORTABLE_IDENTITY_UNAVAILABLE');
  });
});
