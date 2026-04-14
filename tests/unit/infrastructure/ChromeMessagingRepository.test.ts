import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeMessagingRepository } from '../../../src/infrastructure/repositories/ChromeMessagingRepository';
import { MessagingError } from '@shared/errors';
import type { Message, MessageSender } from '@shared/repositories';
import type { MessagingService, MessageListener } from '../../../src/platform/interfaces/messaging';

type PlatformListener = (message: Message, sender: MessageSender) => Promise<unknown> | void;
const createMockFn = <T extends (...args: any[]) => any>() => vi.fn<Parameters<T>, ReturnType<T>>();

const removeListener = vi.fn();
type MessagingServiceMock = MessagingService & {
  send: ReturnType<typeof createMockFn<MessagingService['send']>>;
  sendToTab: ReturnType<typeof createMockFn<MessagingService['sendToTab']>>;
  addListener: ReturnType<typeof createMockFn<MessagingService['addListener']>>;
};

const mockMessaging: MessagingServiceMock = {
  send: createMockFn<MessagingService['send']>() as MessagingServiceMock['send'],
  sendToTab: createMockFn<MessagingService['sendToTab']>() as MessagingServiceMock['sendToTab'],
  addListener: createMockFn<MessagingService['addListener']>() as MessagingServiceMock['addListener']
};

let registeredListener: PlatformListener | null = null;

describe('ChromeMessagingRepository', () => {
  let repo: ChromeMessagingRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredListener = null;
    mockMessaging.addListener.mockImplementation((listener: MessageListener) => {
      registeredListener = listener as PlatformListener;
      return removeListener;
    });
    repo = new ChromeMessagingRepository(mockMessaging);
  });

  describe('send()', () => {
    it('should forward message to platform messaging service and resolve response', async () => {
      const message: Message = { type: 'track', event: 'options_opened' };
      const payload = { ok: true };
      mockMessaging.send.mockResolvedValue(payload);

      const response = await repo.send<typeof payload>(message);

      expect(mockMessaging.send).toHaveBeenCalledWith(message);
      expect(response).toEqual(payload);
    });

    it('should rethrow MessagingError emitted by platform service', async () => {
      const message: Message = { type: 'track', event: 'options_closed' };
      const platformError = new MessagingError('platform failure');
      mockMessaging.send.mockRejectedValue(platformError);

      await expect(repo.send(message)).rejects.toBe(platformError);
    });

    it('should wrap unknown errors as MessagingError', async () => {
      const message: Message = { type: 'clip', data: { markdown: '# test clip', title: 'mock' } };
      mockMessaging.send.mockRejectedValue(new Error('disconnected'));

      const attempt = repo.send(message);

      await expect(attempt).rejects.toBeInstanceOf(MessagingError);
      await expect(attempt).rejects.toThrow('Failed to send message to background');
    });

    it('should timeout when response exceeds limit', async () => {
      vi.useFakeTimers();
      try {
        const message: Message = { type: 'track', event: 'slow_response' };
        mockMessaging.send.mockReturnValue(new Promise(() => {}));

        const attempt = repo.send(message, 50);
        const assertion = expect(attempt).rejects.toThrow('Message timeout after waiting for response');

        await vi.advanceTimersByTimeAsync(50);
        await assertion;
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('onMessage()', () => {
    it('should register listener through platform messaging service', () => {
      const handler = vi.fn();

      repo.onMessage(handler);

      expect(mockMessaging.addListener).toHaveBeenCalledTimes(1);
      expect(typeof registeredListener).toBe('function');
    });

    it('should invoke handler when platform listener receives message', async () => {
      const handler = vi.fn().mockResolvedValue('ok');
      repo.onMessage(handler);
      const incoming: Message = { type: 'track', event: 'button_click' };
      const sender: MessageSender = { id: 'sender', tabId: 42 };

      const listener = registeredListener;
      expect(listener).toBeTruthy();
      if (!listener) {
        throw new Error('Listener not registered');
      }

      const result = await listener(incoming, sender);

      expect(handler).toHaveBeenCalledWith(incoming, sender);
      expect(result).toBe('ok');
    });

    it('should return unsubscribe function from platform service', () => {
      const handler = vi.fn();

      const unsubscribe = repo.onMessage(handler);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
      expect(removeListener).toHaveBeenCalledTimes(1);
    });
  });
});
