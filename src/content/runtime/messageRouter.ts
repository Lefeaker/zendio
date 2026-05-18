import type { MessagingService } from '../../platform/interfaces/messaging';
import type { ContentMessageRouter } from './contentMessageRouter';

export interface RegisterMessageRouterOptions {
  messaging: Pick<MessagingService, 'addListener'>;
  router: Pick<ContentMessageRouter, 'handleMessage'>;
}

export interface MessageRouterRegistration {
  dispose(): void;
}

let registered = false;

export function registerMessageRouter(
  options: RegisterMessageRouterOptions
): MessageRouterRegistration {
  const { messaging, router } = options;
  if (registered) {
    return { dispose: () => undefined };
  }
  registered = true;
  const detach = messaging.addListener(router.handleMessage);
  return {
    dispose: () => {
      if (!registered) return;
      detach?.();
      registered = false;
    }
  };
}
