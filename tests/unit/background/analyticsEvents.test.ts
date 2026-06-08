import { beforeEach, describe, expect, it, vi } from 'vitest';

const trackTelemetryEventMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));

vi.mock('../../../src/background/services/telemetryService', () => ({
  trackTelemetryEvent: trackTelemetryEventMock
}));

describe('analyticsEvents', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('delegates usage events to the shared telemetry service', async () => {
    const { trackUsageEvent } = await import('../../../src/background/services/analyticsEvents');

    await trackUsageEvent('support_like_clicked', { variant: 'first' });

    expect(trackTelemetryEventMock).toHaveBeenCalledWith('support_like_clicked', {
      variant: 'first'
    });
  });

  it('preserves compatibility for no-param usage events', async () => {
    const { trackUsageEvent } = await import('../../../src/background/services/analyticsEvents');

    await trackUsageEvent('support_dislike_clicked');

    expect(trackTelemetryEventMock).toHaveBeenCalledWith('support_dislike_clicked', undefined);
  });
});
