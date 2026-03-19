import { createDefaultPageI18nController, type PageI18nController, type I18nBinder, type I18nResource, getMessages, type Messages, configureI18nStorage } from '../../i18n';
import { getService } from '../../shared/di';
import { TOKENS } from '../../shared/di/tokens';
import type { PlatformServices } from '../../platform/types';

let controller: PageI18nController | null = null;

export async function ensureContentI18n(root: ParentNode = document): Promise<PageI18nController> {
  if (!controller) {
    const platform = getService<PlatformServices>(TOKENS.platformServices);
    configureI18nStorage(platform.storage.sync);
    const pageController = createDefaultPageI18nController();
    await pageController.load();
    controller = pageController;
  }

  controller.mount(root);
  return controller;
}

export function getContentI18nBinder(): I18nBinder | null {
  return controller ? controller.getBinder() : null;
}

export function getContentI18nResource(): I18nResource | null {
  return controller ? controller.getCurrentResource() : null;
}

export async function getContentMessages(): Promise<Messages> {
  const resource = getContentI18nResource();
  if (resource) {
    return resource.messages;
  }
  return getMessages();
}

export function disposeContentI18n(): void {
  controller?.dispose();
  controller = null;
}
