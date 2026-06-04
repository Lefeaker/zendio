import { beforeEach, describe, expect, it, vi } from 'vitest';

const refreshFromStorageMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const getUserConsentMock = vi.hoisted(() => vi.fn());
const getConfigMock = vi.hoisted(() => vi.fn());
const setUserConsentMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const updateConfigMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const updateErrorAnalyticsConfigMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@shared/errors/analytics/analyticsConfig', () => ({
  getAnalyticsConfigManager: () => ({
    refreshFromStorage: refreshFromStorageMock,
    getUserConsent: getUserConsentMock,
    getConfig: getConfigMock,
    setUserConsent: setUserConsentMock,
    updateConfig: updateConfigMock
  })
}));
vi.mock('@shared/errors/analytics', () => ({
  updateErrorAnalyticsConfig: updateErrorAnalyticsConfigMock
}));

import {
  applyAnalyticsTransferPayload,
  exportAnalyticsTransferPayload
} from '@options/services/analyticsTransfer';

describe('analyticsTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateErrorAnalyticsConfigMock.mockClear();
  });

  it('exports consent and debug mode when available', async () => {
    getUserConsentMock.mockResolvedValue({ analytics: true, errorReporting: false });
    getConfigMock.mockReturnValue({ debugMode: true });

    await expect(exportAnalyticsTransferPayload()).resolves.toEqual({
      consent: { analytics: true, errorReporting: false },
      debugMode: true
    });
    expect(refreshFromStorageMock).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when nothing transferable exists', async () => {
    getUserConsentMock.mockResolvedValue(undefined);
    getConfigMock.mockReturnValue({});

    await expect(exportAnalyticsTransferPayload()).resolves.toBeUndefined();
  });

  it('applies consent and debug mode updates selectively', async () => {
    await applyAnalyticsTransferPayload({
      consent: { analytics: false, errorReporting: true },
      debugMode: false
    });

    expect(refreshFromStorageMock).toHaveBeenCalledTimes(1);
    expect(setUserConsentMock).toHaveBeenCalledWith({ analytics: false, errorReporting: true });
    expect(updateConfigMock).toHaveBeenCalledWith({ debugMode: false });
    expect(updateErrorAnalyticsConfigMock).toHaveBeenCalledWith(true);
  });

  it('forces debug mode off when imported consent disables analytics and error reporting', async () => {
    getUserConsentMock.mockResolvedValue({ analytics: true, errorReporting: true });

    await applyAnalyticsTransferPayload({
      consent: { analytics: false, errorReporting: false },
      debugMode: true
    });

    expect(setUserConsentMock).toHaveBeenCalledWith({ analytics: false, errorReporting: false });
    expect(updateConfigMock).toHaveBeenCalledWith({ debugMode: false });
    expect(updateErrorAnalyticsConfigMock).toHaveBeenCalledWith(false);
  });

  it('returns early when payload is absent', async () => {
    await expect(applyAnalyticsTransferPayload(undefined)).resolves.toBeUndefined();
    expect(refreshFromStorageMock).not.toHaveBeenCalled();
  });
});
