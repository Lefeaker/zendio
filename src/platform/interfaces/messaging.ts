export interface MessageSenderInfo {
  id?: string;
  tabId?: number;
  frameId?: number;
  url?: string;
  origin?: string;
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
) => MessageListenerResult | Promise<MessageListenerResult>;

export interface MessageSendOptions {
  frameId?: number;
  tabId?: number;
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
