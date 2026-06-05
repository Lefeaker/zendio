import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsConfig } from '../../../src/shared/errors/analytics/analyticsConfig';

const refreshFromStorageMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const getConfigMock = vi.hoisted(() => vi.fn());
const sendAnalyticsTransportEventMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@shared/errors/analytics/analyticsConfig', () => ({
  getAnalyticsConfigManager: () => ({
    refreshFromStorage: refreshFromStorageMock,
    getConfig: getConfigMock
  })
}));

vi.mock('@shared/analytics', () => ({
  sendAnalyticsTransportEvent: sendAnalyticsTransportEventMock
}));

import { prepareAnalyticsDataClearedEvent } from '@options/app/productionStitchFinalAnalyticsEvent';

function createConfig(overrides: Partial<AnalyticsConfig> = {}): AnalyticsConfig {
  return {
    enabled: true,
    debugMode: false,
    measurementId: 'G-1234567890',
    transportMode: 'proxy',
    proxyEndpoint: 'https://analytics.example.test/ga4',
    clientId: 'client-1',
    sessionId: 'session-1',
    userConsent: {
      analytics: true,
      errorReporting: false,
      timestamp: 1,
      version: '1.0'
    },
    reportingInterval: 30000,
    maxErrorsPerSession: 50,
    batchSize: 10,
    ...overrides
  };
}

describe('prepareAnalyticsDataClearedEvent', () => {
  beforeEach(() => {
    refreshFromStorageMock.mockClear();
    getConfigMock.mockReset();
    sendAnalyticsTransportEventMock.mockClear();
  });

  it('sends the final data-cleared event with the captured consented config', async () => {
    const config = createConfig();
    getConfigMock.mockReturnValue(config);

    const sendFinalEvent = await prepareAnalyticsDataClearedEvent();
    await sendFinalEvent();

    expect(refreshFromStorageMock).toHaveBeenCalledTimes(1);
    expect(sendAnalyticsTransportEventMock).toHaveBeenCalledWith(
      'analytics_data_cleared',
      { outcome: 'completed' },
      expect.objectContaining({
        clientId: 'client-1',
        measurementId: 'G-1234567890',
        userConsent: expect.objectContaining({ analytics: true })
      })
    );
  });

  it('does not send without prior analytics consent', async () => {
    getConfigMock.mockReturnValue(
      createConfig({
        enabled: false,
        userConsent: {
          analytics: false,
          errorReporting: false,
          timestamp: 1,
          version: '1.0'
        }
      })
    );

    const sendFinalEvent = await prepareAnalyticsDataClearedEvent();
    await sendFinalEvent();

    expect(sendAnalyticsTransportEventMock).not.toHaveBeenCalled();
  });
});
