import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorageService } from '@platform/preview/memoryStorage';
import { createDeviceLocalPrivacyCommitter } from '../../../src/background/services/deviceLocalPrivacyCommitter';
import {
  DEVICE_LOCAL_PRIVACY_CONFIG_KEY,
  DEVICE_LOCAL_PRIVACY_CONSENT_KEY,
  DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY,
  createDeviceLocalPrivacyTransaction,
  DeviceLocalPrivacyStore,
  type DeviceLocalPrivacyTransactionSnapshot,
  resolveDeviceLocalPrivacy
} from '@shared/config/deviceLocalPrivacy';
import { createPreparedDeviceLocalVaultRecoveryTransaction } from '@shared/config/deviceLocalVaultRecoveryTransaction';
import type {
  PlainStructuredObject,
  PlainStructuredValue
} from '@shared/config/losslessObjectBoundaryTypes';
import type { PrivacyPreferencesOptions } from '@shared/types/options';

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

async function seedPrivacy(
  storage: Awaited<ReturnType<typeof harness>>['storage'],
  privacy: PrivacyPreferencesOptions = privacy1
) {
  await storage.local.setMany({
    [DEVICE_LOCAL_PRIVACY_CONSENT_KEY]: {
      analytics: privacy.analytics,
      errorReporting: privacy.errorReporting,
      timestamp: 1,
      version: '1.0'
    },
    [DEVICE_LOCAL_PRIVACY_CONFIG_KEY]: { debugMode: privacy.debugMode }
  });
}

function createHarness(raw: PlainStructuredObject) {
  const storage = createMemoryStorageService();
  let current = structuredClone(raw);
  const writeRaw = vi.fn((next: PlainStructuredObject) => {
    current = structuredClone(next);
    return Promise.resolve();
  });
  const committer = createDeviceLocalPrivacyCommitter(storage, {
    readRaw: () => Promise.resolve(structuredClone(current)),
    writeRaw
  });
  return { storage, committer, writeRaw, current: () => current };
}

function harness(raw: PlainStructuredObject) {
  return new Promise<ReturnType<typeof createHarness>>((resolve) => {
    resolve(createHarness(raw));
  });
}

async function transaction() {
  const portablePreimage = { nested: { a: 1, b: 2 }, revision: 0 };
  const portableProposal = { revision: 1 };
  return createPreparedDeviceLocalVaultRecoveryTransaction({
    transactionId: 'operation-1',
    previousBindings: { version: 1, bindings: {} },
    proposedBindings: { version: 1, bindings: {} },
    portablePreimage,
    portableProposal,
    writeRequired: true,
    privacyRestoreTarget: privacy0,
    privacyForwardTarget: privacy1,
    privacyWriteRequired: true
  });
}

const interruptedPhases: readonly DeviceLocalPrivacyTransactionSnapshot['phase'][] = [
  'prepared',
  'commit-ready'
];

describe('createDeviceLocalPrivacyCommitter compensation', () => {
  it('observes prepared as R and commit-ready current values as F', async () => {
    const state = await harness({ revision: 1 });
    await seedPrivacy(state.storage, privacy1);
    const previousConsent = {
      analytics: false,
      errorReporting: false,
      timestamp: 0,
      version: '1.0'
    };
    const previousConfig = { debugMode: false };
    const recoveryTransaction = await transaction();
    await state.storage.local.set(
      DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY,
      createDeviceLocalPrivacyTransaction(previousConsent, previousConfig, 'prepared')
    );

    await expect(state.committer.observe?.(recoveryTransaction, 'forward')).resolves.toMatchObject({
      portableState: 'proposal',
      privacyState: 'restore',
      privacy: privacy0
    });

    await state.storage.local.set(
      DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY,
      createDeviceLocalPrivacyTransaction(previousConsent, previousConfig, 'commit-ready')
    );
    await expect(state.committer.observe?.(recoveryTransaction, 'forward')).resolves.toMatchObject({
      portableState: 'proposal',
      privacyState: 'forward',
      privacy: privacy1
    });
  });

  it('keeps forward success when only the committed marker cleanup fails', async () => {
    const state = await harness({ revision: 0 });
    await seedPrivacy(state.storage, privacy0);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const originalRemove = state.storage.local.remove.bind(state.storage.local);
    state.storage.local.remove = vi.fn((key) =>
      key === DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY
        ? Promise.reject(new Error('marker cleanup unavailable'))
        : originalRemove(key)
    );

    const result = await state.committer.execute(
      {
        kind: 'patch',
        patches: [{ path: ['privacyPreferences', 'analytics'], value: true }]
      },
      (raw) => ({
        next: { ...raw, privacyPreferences: privacy1 },
        verification: { kind: 'paths', expected: [] }
      }),
      8_192
    );

    expect(result.privacy).toEqual(privacy1);
    expect(warning).toHaveBeenCalledOnce();
    const observed = await state.committer.observe?.(await transaction(), 'forward');
    expect(observed?.privacyState).toBe('forward');
  });

  it('restores P0 then privacy0 in one attempt when the proposal is current', async () => {
    const state = await harness({ revision: 1 });

    await expect(state.committer.compensate?.(await transaction())).resolves.toMatchObject({
      portableState: 'preimage',
      privacyState: 'restore'
    });

    expect(state.current()).toEqual({ nested: { a: 1, b: 2 }, revision: 0 });
    expect(state.writeRaw).toHaveBeenCalledOnce();
    const local = resolveDeviceLocalPrivacy(
      await state.storage.local.get(DEVICE_LOCAL_PRIVACY_CONSENT_KEY),
      await state.storage.local.get(DEVICE_LOCAL_PRIVACY_CONFIG_KEY),
      state.current()
    );
    expect(local.preferences).toEqual(privacy0);
  });

  it('accepts reordered P0 without a portable write', async () => {
    const state = await harness({ revision: 0, nested: { b: 2, a: 1 } });

    await expect(state.committer.compensate?.(await transaction())).resolves.toMatchObject({
      portableState: 'preimage'
    });
    expect(state.writeRaw).not.toHaveBeenCalled();
  });

  it('preserves a third portable value while restoring device-local privacy', async () => {
    const state = await harness({ external: true });

    await expect(state.committer.compensate?.(await transaction())).resolves.toMatchObject({
      portableState: 'third'
    });
    expect(state.current()).toEqual({ external: true });
    expect(state.writeRaw).not.toHaveBeenCalled();
  });

  it.each(interruptedPhases)(
    'converges after startup clears an interrupted privacy %s primitive',
    async (phase) => {
      const state = await harness({ revision: 0, nested: { a: 1, b: 2 } });
      await seedPrivacy(state.storage);
      const consent = await state.storage.local.get<PlainStructuredValue>(
        DEVICE_LOCAL_PRIVACY_CONSENT_KEY
      );
      const config = await state.storage.local.get<PlainStructuredValue>(
        DEVICE_LOCAL_PRIVACY_CONFIG_KEY
      );
      await state.storage.local.set(
        DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY,
        createDeviceLocalPrivacyTransaction(consent, config, phase)
      );

      await state.committer.recover?.();
      await state.committer.compensate?.(await transaction());

      const restored = await new DeviceLocalPrivacyStore(state.storage.local).read(state.current());
      expect(restored.preferences).toEqual(privacy0);
      await expect(
        state.storage.local.get(DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY)
      ).resolves.toBeUndefined();
    }
  );

  it('replays once after portable restoration succeeds but privacy target commit fails', async () => {
    const state = await harness({ revision: 1 });
    await seedPrivacy(state.storage);
    const originalSetMany = state.storage.local.setMany.bind(state.storage.local);
    let failed = false;
    state.storage.local.setMany = vi.fn(async (values) => {
      if (!failed) {
        failed = true;
        throw new Error('privacy write unavailable');
      }
      await originalSetMany(values);
    });

    await expect(state.committer.compensate?.(await transaction())).rejects.toMatchObject({
      code: 'OPTIONS_STORAGE_FAILURE'
    });
    expect(state.current()).toEqual({ nested: { a: 1, b: 2 }, revision: 0 });
    expect(state.writeRaw).toHaveBeenCalledOnce();

    await state.committer.recover?.();
    await state.committer.compensate?.(await transaction());
    const restored = await new DeviceLocalPrivacyStore(state.storage.local).read(state.current());
    expect(restored.preferences).toEqual(privacy0);
    expect(state.writeRaw).toHaveBeenCalledOnce();
  });
});
