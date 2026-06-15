import type { Messages } from './messages';
import { formatMessage } from './messageFormatter';
import type { UserVisibleMessageDescriptor } from '../shared/i18n/userVisibleMessageDescriptor';

function resolveDescriptorFallback(
  descriptor: UserVisibleMessageDescriptor | undefined,
  fallback?: string
): string {
  return descriptor?.fallback ?? fallback ?? '';
}

export function formatUserVisibleMessage(
  descriptor: UserVisibleMessageDescriptor | undefined,
  messages: Messages,
  fallback?: string
): string {
  if (!descriptor) {
    return fallback ?? '';
  }

  const template = messages[descriptor.key as keyof Messages];
  if (typeof template !== 'string' || template.length === 0) {
    return resolveDescriptorFallback(descriptor, fallback);
  }

  return formatMessage(template, descriptor.values ?? {});
}
