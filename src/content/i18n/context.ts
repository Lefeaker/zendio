import {
  createDefaultPageI18nController,
  type PageI18nController,
  type I18nBinder,
  type I18nResource,
  formatMessage,
  getMessages,
  type Messages,
  configureI18nStorage
} from '@i18n';
import { getService } from '../../shared/di';
import { TOKENS } from '../../shared/di/tokens';
import type { PlatformServices } from '../../platform/types';
import { loadSchemaMessagesAsset } from '@i18n/runtime/assets';

type ContentI18nValues = Record<string, string | number | boolean>;

export type ContentI18nTranslator = (
  key: keyof Messages,
  fallback: string,
  values?: ContentI18nValues
) => string;

let controller: PageI18nController | null = null;
let translatorMessages: { language: I18nResource['language']; messages: Messages } | null = null;
let lifecycleVersion = 0;

function isActiveController(
  activeController: PageI18nController,
  resource: I18nResource,
  version: number
): boolean {
  return (
    lifecycleVersion === version &&
    controller === activeController &&
    activeController.getCurrentResource() === resource
  );
}

async function refreshTranslatorMessages(
  activeController: PageI18nController,
  resource: I18nResource,
  version: number
): Promise<void> {
  if (translatorMessages?.language === resource.language) {
    return;
  }

  let schemaMessages: Awaited<ReturnType<typeof loadSchemaMessagesAsset>>;
  try {
    schemaMessages = await loadSchemaMessagesAsset(
      resource.language as Parameters<typeof loadSchemaMessagesAsset>[0]
    );
  } catch {
    return;
  }

  if (!isActiveController(activeController, resource, version)) {
    return;
  }
  translatorMessages = {
    language: resource.language,
    messages: { ...resource.messages, ...schemaMessages }
  };
}

export async function ensureContentI18n(root: ParentNode = document): Promise<PageI18nController> {
  if (!controller) {
    const version = lifecycleVersion;
    const platform = getService<PlatformServices>(TOKENS.platformServices);
    configureI18nStorage(platform.storage.sync);
    const pageController = createDefaultPageI18nController();
    await pageController.load();
    if (lifecycleVersion !== version) {
      pageController.dispose();
      return pageController;
    }
    controller = pageController;
  }

  const activeController = controller;
  const version = lifecycleVersion;
  const resource = activeController.getCurrentResource();
  if (resource) {
    await refreshTranslatorMessages(activeController, resource, version);
  }
  if (lifecycleVersion === version && controller === activeController) {
    activeController.mount(root);
  }
  return activeController;
}

export function getContentI18nBinder(): I18nBinder | null {
  return controller ? controller.getBinder() : null;
}

export function getContentI18nResource(): I18nResource | null {
  return controller ? controller.getCurrentResource() : null;
}

export function createContentI18nTranslator(
  resource: I18nResource | null
): ContentI18nTranslator | undefined {
  if (!resource) {
    return undefined;
  }
  return (key, fallback, values = {}) => {
    const message =
      translatorMessages?.language === resource.language
        ? translatorMessages.messages[key]
        : resource.get(key);
    const template = typeof message === 'string' && message.length > 0 ? message : fallback;
    return formatMessage(template, values, resource.language);
  };
}

export async function getContentMessages(): Promise<Messages> {
  const resource = getContentI18nResource();
  if (resource) {
    return resource.messages;
  }
  return getMessages();
}

export function disposeContentI18n(): void {
  lifecycleVersion += 1;
  controller?.dispose();
  controller = null;
  translatorMessages = null;
}
