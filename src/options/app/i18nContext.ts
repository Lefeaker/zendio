import type { I18nBinder, I18nResource, Messages } from '../../i18n';
import { getMessages } from '../../i18n';

let currentBinder: I18nBinder | null = null;
let currentResource: I18nResource | null = null;

export function setOptionsI18nContext(
  binder: I18nBinder | null,
  resource: I18nResource | null
): void {
  currentBinder = binder;
  currentResource = resource;
}

export function getOptionsI18nBinder(): I18nBinder | null {
  return currentBinder;
}

export function getOptionsI18nResource(): I18nResource | null {
  return currentResource;
}

export async function getOptionsMessages(): Promise<Messages> {
  if (currentResource) {
    return currentResource.messages;
  }
  return getMessages();
}
