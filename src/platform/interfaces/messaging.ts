export interface MessageSenderInfo {
  id?: string;
  tabId?: number;
  windowId?: number;
  frameId?: number;
  documentId?: string;
  url?: string;
  origin?: string;
}

export const MESSAGE_LISTENER_INVOCATION_ERROR_CODE = 'MESSAGE_LISTENER_FAILED' as const;
export const MESSAGE_LISTENER_INVOCATION_ERROR_MESSAGE =
  'Message listener invocation failed' as const;

export class MessageListenerInvocationError extends Error {
  readonly code = MESSAGE_LISTENER_INVOCATION_ERROR_CODE;

  constructor() {
    super(MESSAGE_LISTENER_INVOCATION_ERROR_MESSAGE);
    this.name = 'MessageListenerInvocationError';
  }
}

export type MessagePayload =
  | null
  | boolean
  | number
  | string
  | MessagePayload[]
  | { [key: string]: MessagePayload };

export type MessageListenerResult = void | MessagePayload;
export type MessageListener = (
  message: unknown,
  sender: MessageSenderInfo
) => MessageListenerResult | PromiseLike<MessageListenerResult>;

export interface MessageSendOptions {
  frameId?: number;
}

export interface MessagingService {
  send<TResult = unknown>(message: unknown): Promise<TResult>;
  sendToTab<TResult = unknown>(
    tabId: number,
    message: unknown,
    options?: MessageSendOptions
  ): Promise<TResult>;
  addListener(listener: MessageListener): () => void;
}
