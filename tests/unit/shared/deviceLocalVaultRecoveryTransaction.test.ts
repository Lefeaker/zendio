import { describe, expect, it } from 'vitest';
import {
  createPreparedDeviceLocalVaultRecoveryTransaction,
  decodeDeviceLocalVaultRecoveryTransaction,
  portableOptionsIdentity
} from '@shared/config/deviceLocalVaultRecoveryTransaction';
import type { DeviceLocalVaultBindingSnapshot } from '@shared/config/deviceLocalVaultRecoveryTransaction';

const bindings = (folderId?: string): DeviceLocalVaultBindingSnapshot => ({
  version: 1 as const,
  bindings: folderId
    ? { primary: { folderId, folderName: folderId === 'folder-old' ? 'Old' : 'New' } }
    : {}
});

describe('device-local vault recovery transaction', () => {
  it('uses canonical SHA-256 identities for complete portable raw options', async () => {
    const left = await portableOptionsIdentity({
      opaque: { z: 1, a: ['kept', true] },
      interfaceTheme: 'dark'
    });
    const right = await portableOptionsIdentity({
      interfaceTheme: 'dark',
      opaque: { a: ['kept', true], z: 1 }
    });

    expect(left).toBe(right);
    expect(left).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('builds a bounded prepared record with immutable cleanup candidates', async () => {
    const transaction = await createPreparedDeviceLocalVaultRecoveryTransaction({
      transactionId: 'operation-1',
      previousBindings: bindings('folder-old'),
      proposedBindings: bindings('folder-new'),
      portablePreimage: { vaultRouter: { defaultVaultId: 'primary' } },
      portableProposal: { vaultRouter: { defaultVaultId: 'primary', vaults: [] } },
      writeRequired: true,
      privacyTarget: { analytics: false, errorReporting: false, debugMode: false },
      privacyWriteRequired: true
    });

    expect(transaction).toMatchObject({
      version: 3,
      transactionId: 'operation-1',
      phase: 'prepared',
      cleanupCandidates: ['folder-old'],
      remainingCleanupCandidates: ['folder-old'],
      portable: {
        identityAlgorithm: 'sha256-canonical-plain-json-v1',
        writeRequired: true
      },
      privacy: {
        restoreRequired: true,
        target: { analytics: false, errorReporting: false, debugMode: false }
      }
    });
    expect(transaction.portable.preimage).toEqual({
      vaultRouter: { defaultVaultId: 'primary' }
    });
    expect(await decodeDeviceLocalVaultRecoveryTransaction(transaction)).toEqual({
      kind: 'v3-transaction',
      transaction
    });
  });

  it.each([
    { version: 1, folderIds: ['folder-old'] },
    { version: 2, transactionId: 'operation-1', phase: 'prepared' },
    { version: 99, folderIds: ['folder-old'] }
  ])('quarantines legacy or invalid records without authorizing cleanup: %#', async (value) => {
    expect((await decodeDeviceLocalVaultRecoveryTransaction(value)).kind).not.toBe(
      'v3-transaction'
    );
  });

  it('decodes accepted v2 forward-recovery records without inventing compensation intent', async () => {
    const preimageIdentity = await portableOptionsIdentity({ value: 'before' });
    const proposedIdentity = await portableOptionsIdentity({ value: 'after' });
    const transaction = {
      version: 2,
      transactionId: 'legacy-v2',
      phase: 'prepared',
      previousBindings: bindings('folder-old'),
      proposedBindings: bindings(),
      cleanupCandidates: ['folder-old'],
      remainingCleanupCandidates: ['folder-old'],
      portable: {
        identityAlgorithm: 'sha256-canonical-plain-json-v1',
        preimageIdentity,
        proposedIdentity,
        writeRequired: true
      }
    };

    expect(await decodeDeviceLocalVaultRecoveryTransaction(transaction)).toEqual({
      kind: 'legacy-v2-transaction',
      transaction
    });
  });

  it('rejects bounded-shape and phase invariant violations', async () => {
    const valid = await createPreparedDeviceLocalVaultRecoveryTransaction({
      transactionId: 'operation-1',
      previousBindings: bindings('folder-old'),
      proposedBindings: bindings(),
      portablePreimage: { value: 'before' },
      portableProposal: { value: 'after' },
      writeRequired: true,
      privacyTarget: { analytics: false, errorReporting: false, debugMode: false },
      privacyWriteRequired: true
    });
    const invalid = [
      { ...valid, transactionId: 'x'.repeat(129) },
      { ...valid, cleanupCandidates: ['folder-not-in-preimage'] },
      { ...valid, portable: { ...valid.portable, writeRequired: false } },
      { ...valid, portable: { ...valid.portable, preimage: { value: 'tampered' } } },
      { ...valid, privacy: { ...valid.privacy, target: { analytics: false } } },
      { ...valid, failureCode: 'OPTIONS_STORAGE_FAILURE' },
      { ...valid, abortReason: 'external-sync-conflict' },
      {
        ...valid,
        previousBindings: {
          version: 1,
          bindings: { primary: { folderId: 'x'.repeat(257), folderName: 'Too long' } }
        }
      }
    ];

    for (const candidate of invalid) {
      expect((await decodeDeviceLocalVaultRecoveryTransaction(candidate)).kind).toBe('invalid');
    }
  });
});
