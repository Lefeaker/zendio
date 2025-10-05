import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const sendMessageMock = vi.fn();

describe('options connectionTester service', () => {
  beforeEach(() => {
    vi.resetModules();
    sendMessageMock.mockReset();

    globalThis.chrome = {
      runtime: {
        sendMessage: sendMessageMock as unknown as typeof chrome.runtime.sendMessage
      }
    } as unknown as typeof chrome;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis as Record<string, unknown>, 'chrome');
  });

  it('requests connection test once and validates the response shape', async () => {
    const response = { success: true, message: 'ok', status: 200, response: 'pong' };
    sendMessageMock.mockResolvedValue(response);

    const module = await import('../../src/options/services/connectionTester');
    const result = await module.requestConnectionTest();

    expect(sendMessageMock).toHaveBeenCalledWith({ type: 'TEST_CONNECTION' });
    expect(result).toEqual(response);
    expect(module.isConnectionTestRunning()).toBe(false);
  });

  it('prevents concurrent connection tests', async () => {
    let resolver: ((value: unknown) => void) | null = null;
    const pending = new Promise((resolve) => {
      resolver = resolve;
    });
    sendMessageMock.mockReturnValue(pending);

    const module = await import('../../src/options/services/connectionTester');

    const first = module.requestConnectionTest();
    await expect(module.requestConnectionTest()).rejects.toThrow('Connection test is already running');

    resolver?.({ success: true, message: 'done' });
    await expect(first).resolves.toEqual({ success: true, message: 'done' });
    expect(module.isConnectionTestRunning()).toBe(false);
  });

  it('throws when background response is malformed', async () => {
    sendMessageMock.mockResolvedValue({ success: true });

    const module = await import('../../src/options/services/connectionTester');

    await expect(module.requestConnectionTest()).rejects.toThrow('连接测试返回数据缺失必要字段');
  });
});
