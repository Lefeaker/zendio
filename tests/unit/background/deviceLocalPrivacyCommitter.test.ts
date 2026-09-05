import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorageService } from '@platform/preview/memoryStorage';
import { createDeviceLocalPrivacyCommitter } from '../../../src/background/services/deviceLocalPrivacyCommitter';
import {
  DEVICE_LOCAL_PRIVACY_CONFIG_KEY,
  DEVICE_LOCAL_PRIVACY_CONSENT_KEY,
  DEVICE_LOCAL_PRIVACY_TRANSACTION_KEY,
  createDeviceLocalPrivacyTransaction,
  DeviceLocalPrivacyStore,
  resolveDeviceLocalPrivacy
} from '@shared/config/deviceLocalPrivacy';
import { portableOptionsIdentity } from '@shared/config/deviceLocalVaultRecoveryTransaction';
import type {
  PlainStructuredObject,
  PlainStructuredValue
} from '@shared/config/losslessObjectBoundaryTypes';

const privacy0 = { analytics: false, errorReporting: false, debugMode: false } as const;
const privacy1 = { analytics: true, errorReporting: false, debugMode: false } as const;

async function seedPrivacy(
  storage: Awaited<ReturnType<typeof harness>>['storage'],
  privacy = privacy1
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

async function harness(raw: PlainStructuredObject) {
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

async function request() {
  const portablePreimage = { nested: { a: 1, b: 2 }, revision: 0 };
  const portableProposal = { revision: 1 };
  return {
    portablePreimage,
    preimageIdentity: await portableOptionsIdentity(portablePreimage),
    proposedIdentity: await portableOptionsIdentity(portableProposal),
    privacyTarget: privacy0,
    privacyRestoreRequired: true
  } as const;
}

describe('createDeviceLocalPrivacyCommitter compensation', () => {
  it('restores P0 then privacy0 in one attempt when the proposal is current', async () => {
    const state = await harness({ revision: 1 });

    await expect(state.committer.compensate?.(await request())).resolves.toMatchObject({
      portableState: 'proposal'
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

    await expect(state.committer.compensate?.(await request())).resolves.toMatchObject({
      portableState: 'preimage'
    });
    expect(state.writeRaw).not.toHaveBeenCalled();
  });

  it('preserves a third portable value while restoring device-local privacy', async () => {
    const state = await harness({ external: true });

    await expect(state.committer.compensate?.(await request())).resolves.toMatchObject({
      portableState: 'third'
    });
    expect(state.current()).toEqual({ external: true });
    expect(state.writeRaw).not.toHaveBeenCalled();
  });

  it.each(['prepared', 'commit-ready'] as const)(
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
      await state.committer.compensate?.(await request());

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

    await expect(state.committer.compensate?.(await request())).rejects.toMatchObject({
      code: 'OPTIONS_STORAGE_FAILURE'
    });
    expect(state.current()).toEqual({ nested: { a: 1, b: 2 }, revision: 0 });
    expect(state.writeRaw).toHaveBeenCalledOnce();

    await state.committer.recover?.();
    await state.committer.compensate?.(await request());
    const restored = await new DeviceLocalPrivacyStore(state.storage.local).read(state.current());
    expect(restored.preferences).toEqual(privacy0);
    expect(state.writeRaw).toHaveBeenCalledOnce();
  });
});
