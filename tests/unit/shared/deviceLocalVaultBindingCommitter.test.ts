import { describe, expect, it, vi } from 'vitest';
import { DeviceLocalVaultBindingCommitter } from '@shared/config/deviceLocalVaultBindingCommitter';
import {
  createPreparedDeviceLocalVaultRecoveryTransaction,
  type DeviceLocalVaultBindingSnapshot
} from '@shared/config/deviceLocalVaultRecoveryTransaction';

const bindings = (folderId: string): DeviceLocalVaultBindingSnapshot => ({
  version: 1,
  bindings: { primary: { folderId, folderName: folderId } }
});
const previous = bindings('folder-old');
const proposed = bindings('folder-new');

async function transaction() {
  const prepared = await createPreparedDeviceLocalVaultRecoveryTransaction({
    transactionId: 'binding-stage-1',
    previousBindings: previous,
    proposedBindings: proposed,
    portablePreimage: { revision: 0 },
    portableProposal: { revision: 1 },
    writeRequired: true,
    privacyRestoreTarget: { analytics: false, errorReporting: false, debugMode: false },
    privacyForwardTarget: { analytics: true, errorReporting: false, debugMode: false },
    privacyWriteRequired: true
  });
  return { ...prepared, phase: 'forward-inflight' as const };
}

describe('DeviceLocalVaultBindingCommitter', () => {
  it('stages and verifies B1 without persisting a journal phase', async () => {
    let current = previous;
    const recoveryStorage = {
      readBindings: vi.fn(() => Promise.resolve(structuredClone(current))),
      writeBindings: vi.fn((snapshot: DeviceLocalVaultBindingSnapshot) => {
        current = structuredClone(snapshot);
        return Promise.resolve();
      }),
      replace: vi.fn(() => Promise.resolve())
    };

    await expect(
      new DeviceLocalVaultBindingCommitter(recoveryStorage).execute(await transaction(), true)
    ).resolves.toEqual({ kind: 'staged' });

    expect(current).toEqual(proposed);
    expect(recoveryStorage.writeBindings).toHaveBeenCalledOnce();
    expect(recoveryStorage.replace).not.toHaveBeenCalled();
  });

  it.each([
    { current: proposed, expected: 'staged' },
    { current: previous, expected: 'previous' },
    { current: bindings('folder-third'), expected: 'third' }
  ] as const)('classifies an ambiguous write readback as $expected', async (input) => {
    const current = input.current;
    const recoveryStorage = {
      readBindings: vi.fn(() => Promise.resolve(structuredClone(current))),
      writeBindings: vi.fn(() => Promise.reject(new Error('ambiguous write'))),
      replace: vi.fn(() => Promise.resolve())
    };

    await expect(
      new DeviceLocalVaultBindingCommitter(recoveryStorage).execute(await transaction(), true)
    ).resolves.toEqual({ kind: input.expected });
  });
});
