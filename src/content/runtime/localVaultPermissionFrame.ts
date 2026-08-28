import {
  DEFAULT_LANGUAGE,
  DEFAULT_RUNTIME_MESSAGES,
  formatMessage,
  getMessagesForLanguage,
  resolveLanguage,
  type Language,
  type Messages
} from '@i18n';
import type { LocalVaultPermissionPromptResponse } from '../../shared/types';
import { LANGUAGE_CONFIG } from '../../i18n/config';
import {
  resolveLocalVaultPermissionService,
  type LocalVaultPermissionService
} from './localVaultPermissionFrameAdapter';
import permissionFrameCssText from './local-vault-permission-frame.css?inline';

export interface LocalVaultPermissionFrameOptions {
  document?: Document;
  window?: Window;
  permissionService?: LocalVaultPermissionService;
  language?: string;
}

type LocalVaultPermissionMessageSet = Pick<
  Messages,
  | 'localVaultPermissionAuthorizeButton'
  | 'localVaultPermissionChromeReconfirm'
  | 'localVaultPermissionDescription'
  | 'localVaultPermissionFolderFallback'
  | 'localVaultPermissionFrameTitle'
  | 'localVaultPermissionOpeningStatus'
  | 'localVaultPermissionTitle'
  | 'localVaultPermissionUseRestAlwaysButton'
  | 'localVaultPermissionUseRestOnceButton'
>;

interface LocalVaultPermissionLocalization {
  language: Language;
  messages: LocalVaultPermissionMessageSet;
}

function getParam(frameWindow: Window, name: string): string {
  return new URL(frameWindow.location.href).searchParams.get(name)?.trim() ?? '';
}

function selectPermissionMessages(
  messages: LocalVaultPermissionMessageSet
): LocalVaultPermissionMessageSet {
  return {
    localVaultPermissionAuthorizeButton: messages.localVaultPermissionAuthorizeButton,
    localVaultPermissionChromeReconfirm: messages.localVaultPermissionChromeReconfirm,
    localVaultPermissionDescription: messages.localVaultPermissionDescription,
    localVaultPermissionFolderFallback: messages.localVaultPermissionFolderFallback,
    localVaultPermissionFrameTitle: messages.localVaultPermissionFrameTitle,
    localVaultPermissionOpeningStatus: messages.localVaultPermissionOpeningStatus,
    localVaultPermissionTitle: messages.localVaultPermissionTitle,
    localVaultPermissionUseRestAlwaysButton: messages.localVaultPermissionUseRestAlwaysButton,
    localVaultPermissionUseRestOnceButton: messages.localVaultPermissionUseRestOnceButton
  };
}

function readRuntimeLanguage(): string | undefined {
  try {
    if (typeof chrome !== 'undefined' && typeof chrome.i18n?.getUILanguage === 'function') {
      const chromeLanguage = chrome.i18n.getUILanguage();
      if (chromeLanguage) {
        return chromeLanguage;
      }
    }
  } catch {
    // Ignore missing WebExtension runtime access and continue to navigator fallback.
  }

  return typeof navigator === 'undefined' ? undefined : navigator.language;
}

async function resolveLocalization(
  frameWindow: Window,
  explicitLanguage?: string
): Promise<LocalVaultPermissionLocalization> {
  const requestedLanguage = explicitLanguage || getParam(frameWindow, 'language');

  try {
    const language = resolveLanguage(requestedLanguage || readRuntimeLanguage());
    const messages = selectPermissionMessages(await getMessagesForLanguage(language));
    return { language, messages };
  } catch {
    try {
      const messages = selectPermissionMessages(await getMessagesForLanguage(DEFAULT_LANGUAGE));
      return { language: DEFAULT_LANGUAGE, messages };
    } catch {
      return {
        language: DEFAULT_LANGUAGE,
        messages: selectPermissionMessages(DEFAULT_RUNTIME_MESSAGES)
      };
    }
  }
}

function postResult(frameWindow: Window, response: LocalVaultPermissionPromptResponse): void {
  frameWindow.parent.postMessage(
    {
      type: 'AIIOB_LOCAL_VAULT_PERMISSION_RESULT',
      response
    },
    '*'
  );
}

function render(
  doc: Document,
  frameWindow: Window,
  permissionService: LocalVaultPermissionService,
  localization: LocalVaultPermissionLocalization
): void {
  const folderId = getParam(frameWindow, 'folderId');
  const { language, messages } = localization;
  const folderName =
    getParam(frameWindow, 'folderName') ||
    getParam(frameWindow, 'vaultName') ||
    messages.localVaultPermissionFolderFallback;

  const dir = LANGUAGE_CONFIG[language]?.dir ?? LANGUAGE_CONFIG[DEFAULT_LANGUAGE]?.dir ?? 'ltr';
  doc.documentElement.setAttribute('lang', language);
  doc.documentElement.setAttribute('dir', dir);
  doc.title = messages.localVaultPermissionTitle;

  const createElement = <K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    attributes: Record<string, string> = {}
  ): HTMLElementTagNameMap[K] => {
    const element = doc.createElement(tagName);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }
    return element;
  };

  const main = createElement('main', { class: 'permission-card' });
  const heading = createElement('div', { class: 'permission-heading' });
  const kicker = createElement('span', { class: 'permission-kicker' });
  kicker.textContent = 'Zendio';
  const frameTitleElement = createElement('h1', { 'data-role': 'frame-title' });
  heading.append(kicker, frameTitleElement);

  const descriptionElement = createElement('p', {
    class: 'permission-copy',
    'data-role': 'description'
  });
  const reconfirmElement = createElement('p', {
    class: 'permission-copy',
    'data-role': 'reconfirm'
  });
  const statusElement = createElement('p', {
    class: 'permission-status',
    'data-role': 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true'
  });
  const actions = createElement('div', { class: 'permission-actions' });
  const authorizeElement = createElement('button', {
    type: 'button',
    class: 'primary',
    'data-action': 'authorize'
  });
  const restOnceElement = createElement('button', {
    type: 'button',
    class: 'secondary',
    'data-action': 'rest-once'
  });
  const restAlwaysElement = createElement('button', {
    type: 'button',
    class: 'ghost',
    'data-action': 'rest-always'
  });
  actions.append(authorizeElement, restOnceElement, restAlwaysElement);
  main.append(heading, descriptionElement, reconfirmElement, statusElement, actions);
  doc.body.replaceChildren(main);

  const frameTitle = doc.querySelector<HTMLElement>('[data-role="frame-title"]');
  const description = doc.querySelector<HTMLElement>('[data-role="description"]');
  const reconfirm = doc.querySelector<HTMLElement>('[data-role="reconfirm"]');
  const status = doc.querySelector<HTMLElement>('[data-role="status"]');
  const authorize = doc.querySelector<HTMLButtonElement>('[data-action="authorize"]');
  const restOnce = doc.querySelector<HTMLButtonElement>('[data-action="rest-once"]');
  const restAlways = doc.querySelector<HTMLButtonElement>('[data-action="rest-always"]');

  if (frameTitle) {
    frameTitle.textContent = messages.localVaultPermissionFrameTitle;
  }
  if (description) {
    description.textContent = formatMessage(
      messages.localVaultPermissionDescription,
      { folderName },
      language
    );
  }
  if (reconfirm) {
    reconfirm.textContent = messages.localVaultPermissionChromeReconfirm;
  }
  if (authorize) {
    authorize.textContent = messages.localVaultPermissionAuthorizeButton;
  }
  if (restOnce) {
    restOnce.textContent = messages.localVaultPermissionUseRestOnceButton;
  }
  if (restAlways) {
    restAlways.textContent = messages.localVaultPermissionUseRestAlwaysButton;
  }

  authorize?.addEventListener('click', () => {
    void (async () => {
      if (!folderId) {
        postResult(frameWindow, {
          action: 'use-rest',
          permissionState: 'missing',
          errorMessage: 'Local folder id is missing.'
        });
        return;
      }
      if (status) {
        status.textContent = messages.localVaultPermissionOpeningStatus;
      }
      authorize.disabled = true;
      restOnce?.setAttribute('disabled', 'true');
      restAlways?.setAttribute('disabled', 'true');
      try {
        const permissionState = await permissionService.ensurePermission(folderId);
        if (permissionState === 'granted') {
          postResult(frameWindow, { action: 'granted', permissionState });
          return;
        }
        postResult(frameWindow, {
          action: 'use-rest',
          permissionState,
          persistRest: permissionState === 'denied'
        });
      } catch (error) {
        postResult(frameWindow, {
          action: 'use-rest',
          permissionState: 'prompt',
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      }
    })();
  });

  restOnce?.addEventListener('click', () => {
    postResult(frameWindow, { action: 'use-rest', permissionState: 'prompt' });
  });

  restAlways?.addEventListener('click', () => {
    postResult(frameWindow, {
      action: 'use-rest',
      permissionState: 'denied',
      persistRest: true
    });
  });
}

function ensureStyles(doc: Document): void {
  if (doc.getElementById('aiob-local-vault-permission-frame-style')) {
    return;
  }
  const style = doc.createElement('style');
  style.id = 'aiob-local-vault-permission-frame-style';
  style.textContent = permissionFrameCssText;
  doc.head.appendChild(style);
}

export function mountLocalVaultPermissionFrame(
  options: LocalVaultPermissionFrameOptions = {}
): void {
  const frameDocument = options.document ?? document;
  const frameWindow = options.window ?? window;
  const permissionService = options.permissionService ?? resolveLocalVaultPermissionService();
  ensureStyles(frameDocument);
  void resolveLocalization(frameWindow, options.language).then((localization) => {
    render(frameDocument, frameWindow, permissionService, localization);
  });
}

mountLocalVaultPermissionFrame();
