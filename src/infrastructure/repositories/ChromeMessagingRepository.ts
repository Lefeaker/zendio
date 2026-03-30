import type { MessagingService, MessageListenerResult } from '../../platform/interfaces/messaging';
import { MessagingError } from '../../shared/errors/repositoryErrors';
import type {
  IMessagingRepository,
  Message,
  MessageHandler,
  MessageSender
} from '../../shared/repositories';

const DEFAULT_TIMEOUT = 30_000;

export class ChromeMessagingRepository implements IMessagingRepository {
  constructor(private readonly messaging: MessagingService) {}

  async send<T>(message: Message, timeout = DEFAULT_TIMEOUT): Promise<T> {
    const timeoutControl = this.createTimeoutController(timeout, message.type);

    try {
      const response = await Promise.race([
        this.messaging.send<T>(message),
        timeoutControl.promise
      ]);
      timeoutControl.cancel();
      return response;
    } catch (error) {
      timeoutControl.cancel();

      if (error instanceof MessagingError) {
        throw error;
      }

      throw new MessagingError('Failed to send message to background', {
        cause: error,
        context: { messageType: message.type, timeout }
      });
    }
  }

  onMessage(handler: MessageHandler): () => void {
    return this.messaging.addListener((incoming, sender) => {
      const result = handler(incoming as Message, sender as MessageSender);
      return result as MessageListenerResult | Promise<MessageListenerResult>;
    });
  }

  private createTimeoutController(timeout: number, messageType: Message['type']) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const promise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new MessagingError('Message timeout after waiting for response', {
            context: { timeout, messageType }
          })
        );
      }, timeout);
    });

    return {
      promise,
      cancel: () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      }
    };
  }
}
