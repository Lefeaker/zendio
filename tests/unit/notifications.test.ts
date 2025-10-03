import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const getMessagesMock = vi.fn();

vi.mock('../../src/i18n', () => ({
  getMessages: getMessagesMock
}));

describe('notifications service', () => {
  const messages = {
    clipSuccess: 'Clip Succeeded',
    clipFailed: 'Clip Failed',
    extractionFailed: 'Extraction Failed',
    scriptInjectionFailed: 'Script inject failed'
  };

  beforeEach(() => {
    vi.resetModules();
    getMessagesMock.mockReset();
    getMessagesMock.mockResolvedValue(messages);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends success notification with vault name', async () => {
    const { notifyClipSuccess, setNotificationAdapter } = await import('../../src/background/services/notifications');
    const createMock = vi.fn();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    setNotificationAdapter(createMock);
    await notifyClipSuccess('Articles/foo.md', 'MyVault');

    expect(createMock).toHaveBeenCalledWith('clip-success-1700000000000', {
      type: 'basic',
      iconUrl: 'assets/icons/icon128.png',
      title: 'Clip Succeeded (MyVault)',
      message: 'Articles/foo.md'
    });

    setNotificationAdapter(null);
    nowSpy.mockRestore();
  });

  it('sends injection failure notification with composed message', async () => {
    const { notifyInjectionFailure, setNotificationAdapter } = await import('../../src/background/services/notifications');
    const createMock = vi.fn();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    setNotificationAdapter(createMock);
    await notifyInjectionFailure('Extension disabled');

    expect(createMock).toHaveBeenCalledWith('injection-failure-1700000000000', {
      type: 'basic',
      iconUrl: 'assets/icons/icon128.png',
      title: 'Clip Failed',
      message: 'Script inject failed: Extension disabled'
    });

    setNotificationAdapter(null);
    nowSpy.mockRestore();
  });
});
