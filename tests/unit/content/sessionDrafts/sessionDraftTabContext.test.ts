import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('sessionDraftTabContext', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns the current owner context through the configured runtime messenger', async () => {
    const { configureSessionDraftRuntimeMessenger, getCurrentSessionDraftOwnerContext } =
      await import('../../../../src/content/sessionDrafts/sessionDraftTabContext');

    configureSessionDraftRuntimeMessenger(
      vi.fn().mockResolvedValue({
        success: true,
        tabId: 7,
        windowId: 3,
        frameId: 0
      })
    );

    await expect(getCurrentSessionDraftOwnerContext()).resolves.toEqual({
      tabId: 7,
      windowId: 3,
      frameId: 0
    });
  });

  it('returns null or false when runtime messaging fails or is missing', async () => {
    const {
      configureSessionDraftRuntimeMessenger,
      getCurrentSessionDraftOwnerContext,
      isSessionDraftOwnerContextActive
    } = await import('../../../../src/content/sessionDrafts/sessionDraftTabContext');

    configureSessionDraftRuntimeMessenger(vi.fn().mockRejectedValue(new Error('boom')));

    await expect(getCurrentSessionDraftOwnerContext()).resolves.toBeNull();
    await expect(isSessionDraftOwnerContextActive({ tabId: 2 })).resolves.toBe(false);

    configureSessionDraftRuntimeMessenger(null);

    expect(getCurrentSessionDraftOwnerContext()).toBeNull();
    await expect(isSessionDraftOwnerContextActive({ tabId: 2 })).resolves.toBe(false);
  });

  it('rejects malformed runtime responses for owner context lookups', async () => {
    const {
      configureSessionDraftRuntimeMessenger,
      getCurrentSessionDraftOwnerContext,
      isSessionDraftOwnerContextActive
    } = await import('../../../../src/content/sessionDrafts/sessionDraftTabContext');

    configureSessionDraftRuntimeMessenger(vi.fn().mockResolvedValue({ success: true }));
    await expect(getCurrentSessionDraftOwnerContext()).resolves.toBeNull();

    configureSessionDraftRuntimeMessenger(
      vi.fn().mockResolvedValue({ success: true, active: 'yes' })
    );
    await expect(isSessionDraftOwnerContextActive({ tabId: 5 })).resolves.toBe(false);
  });

  it('returns active=true only for valid configured responses', async () => {
    const { configureSessionDraftRuntimeMessenger, isSessionDraftOwnerContextActive } =
      await import('../../../../src/content/sessionDrafts/sessionDraftTabContext');

    configureSessionDraftRuntimeMessenger(
      vi.fn().mockResolvedValue({
        success: true,
        active: true
      })
    );

    await expect(isSessionDraftOwnerContextActive({ tabId: 9, frameId: 0 })).resolves.toBe(true);
  });
});
