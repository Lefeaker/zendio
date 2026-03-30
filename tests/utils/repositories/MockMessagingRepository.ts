import type { IMessagingRepository, Message, MessageHandler, MessageSender } from '@shared/repositories';

interface LoggedMessage {
  message: Message;
  timestamp: number;
}

export class MockMessagingRepository implements IMessagingRepository {
  private handlers = new Set<MessageHandler>();
  private sentMessages: LoggedMessage[] = [];
  private mockResponses = new Map<string, unknown>();

  send<T>(message: Message): Promise<T> {
    this.sentMessages.push({ message, timestamp: Date.now() });
    if (this.mockResponses.has(message.type)) {
      return Promise.resolve(this.mockResponses.get(message.type) as T);
    }
    return Promise.resolve({ ok: true } as T);
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * ===== 测试辅助方法 =====
   */
  getSentMessages(): LoggedMessage[] {
    return [...this.sentMessages];
  }

  setMockResponse(messageType: Message['type'], response: unknown): void {
    this.mockResponses.set(messageType, response);
  }

  reset(): void {
    this.sentMessages = [];
    this.mockResponses.clear();
    this.handlers.clear();
  }

  simulateIncomingMessage(message: Message, sender: MessageSender = {}): void {
    this.handlers.forEach(handler => {
      try {
        void handler(message, sender);
      } catch (error) {
        console.error('[MockMessagingRepository] handler error', error);
      }
    });
  }
}
