import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationOptions } from '../../../../src/platform/interfaces/notifications';

const chromeApi = vi.hoisted(() => ({ notifications: { create: vi.fn(), clear: vi.fn() } }));
const lastErrorMock = vi.hoisted(() => vi.fn<[], chrome.runtime.LastError | null>(() => null));
const handleMock = vi.hoisted(() => vi.fn());
const runtimeErrorMock = vi.hoisted(() => vi.fn((message: string) => new Error(message)));

vi.mock('../../../../src/platform/chrome/utils', () => ({
  ensureChrome: (): typeof chromeApi => chromeApi,
  getChromeLastError: (): chrome.runtime.LastError | null => lastErrorMock(),
  normalizePromise: <T>(executor: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void) => new Promise<T>(executor)
}));
vi.mock('../../../../src/shared/errors', () => ({ chromeApiErrors: { runtimeError: runtimeErrorMock }, errorHandler: { handle: handleMock } }));

describe('chromeNotificationsService', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    chromeApi.notifications.create.mockImplementation((_id: string, _options: NotificationOptions, cb: (notificationId: string) => void) => cb('notif-1'));
    chromeApi.notifications.clear.mockImplementation((_id: string, cb: (wasCleared: boolean) => void) => cb(true));
  });

  it('creates and clears notifications', async () => {
    const { chromeNotificationsService } = await import('../../../../src/platform/chrome/notifications');
    await expect(chromeNotificationsService.create('n1', { type: 'basic', iconUrl: 'icon.png', title: 'Title', message: 'Msg' })).resolves.toBe('notif-1');
    await expect(chromeNotificationsService.clear('n1')).resolves.toBeUndefined();
  });
});
