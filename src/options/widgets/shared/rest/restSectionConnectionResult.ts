import { DaisyCard } from '@ui/primitives/card';
import { UiAlert as DaisyAlert } from '@ui/primitives/alert';
import type { RestSectionMessagesLike } from './restSectionLayoutTypes';
import type { ConnectionResultType } from '@options/services/connectionTestRunner';

export function buildRestConnectionResult(
  createElement: typeof document.createElement,
  messages: RestSectionMessagesLike | null,
  connectionResultHost: HTMLDivElement
): HTMLElement {
  const cardHost = createElement('div');
  cardHost.className = 'mt-2';
  const card = new DaisyCard(cardHost);
  card.render({
    title: messages?.testConnectionButton ?? '连接测试结果',
    body: connectionResultHost
  });
  return cardHost;
}

export function renderRestConnectionTestResult(args: {
  connectionResultHost: HTMLDivElement | null;
  type: ConnectionResultType;
  text: string;
}): void {
  const { connectionResultHost, type, text } = args;
  if (!connectionResultHost) {
    return;
  }
  connectionResultHost.hidden = false;
  connectionResultHost.replaceChildren();
  const [message, ...rest] = text.split('\n');
  const description = rest.join('\n').trim() || undefined;
  const alert = new DaisyAlert(connectionResultHost);
  alert.render({
    type: type === 'success' ? 'success' : type === 'error' ? 'error' : 'info',
    message: message || text,
    ...(description !== undefined && { description }),
    dismissible: type !== 'info'
  });
}

export function resetRestConnectionTestResult(connectionResultHost: HTMLDivElement | null): void {
  if (!connectionResultHost) {
    return;
  }
  connectionResultHost.hidden = true;
  connectionResultHost.replaceChildren();
}
