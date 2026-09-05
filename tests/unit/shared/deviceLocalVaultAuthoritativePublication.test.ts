import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readDeviceLocalVaultAuthoritativePublication,
  resolveDeviceLocalVaultAuthoritativePublication
} from '@shared/config/deviceLocalVaultAuthoritativePublication';
import {
  createPreparedDeviceLocalVaultRecoveryTransaction,
  type DeviceLocalVaultRecoveryTransactionV3
} from '@shared/config/deviceLocalVaultRecoveryTransaction';

const privacy0 = { analytics: false, errorReporting: false, debugMode: false } as const;
const privacy1 = { analytics: true, errorReporting: false, debugMode: false } as const;
const bindings0 = {
  version: 1 as const,
  bindings: { primary: { folderId: 'folder-old', folderName: 'Old Folder' } }
};
const bindings1 = {
  version: 1 as const,
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
  const forwardProof = [
    'forward-committed',
    'local-commit-inflight',
    'local-committed',
    'cleanup-complete'
  ].includes(phase)
    ? {
        portable: {
          ...prepared.portable,
          observedCommittedIdentity: prepared.portable.proposedIdentity
        },
        privacy: { ...prepared.privacy, observedForward: 'exact-target-readback' as const }
      }
    : {};
  const recovery = ['compensating', 'portable-privacy-restored'].includes(phase)
    ? {
        recovery: {
          outcomeCode: 'OPTIONS_STORAGE_FAILURE' as const,
          bindingWriteMayHaveOccurred: true,
          ...(phase === 'portable-privacy-restored'
            ? {
                portableRestoreEvidence: 'preimage' as const,
                privacyRestoreEvidence: 'restore-target' as const
              }
            : {})
        }
      }
    : {};
  return {
    ...prepared,
    ...forwardProof,
    ...recovery,
    phase,
    ...(phase === 'cleanup-complete' ? { remainingCleanupCandidates: [] } : {}),
    ...(phase === 'aborted' ? { abortReason: 'local-commit-failed' as const } : {})
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('device local vault authoritative publication', () => {
  it('projects the durable preimage for every valid nonterminal v3 phase', async () => {
    for (const phase of [
      'prepared',
      'forward-inflight',
      'forward-committed',
      'local-commit-inflight',
      'compensating',
      'portable-privacy-restored'
    ] as const) {
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
      .fn<() => Promise<unknown>>()
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
