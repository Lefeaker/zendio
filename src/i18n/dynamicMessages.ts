import { configProvider } from '../shared/config/provider';
import type { Language } from './locales';
import {
  DYNAMIC_MESSAGE_KEYS,
  type DynamicMessageTemplates,
  getDynamicMessageTemplates
} from './catalog/dynamicTemplates';

type RestDefaults = ReturnType<typeof configProvider.getRestDefaults>;

interface DynamicMessages {
  httpsUrlHint: string;
  httpUrlHint: string;
  vaultNamePlaceholder: string;
}

function interpolateDynamicTemplate(
  template: string,
  values: Record<string, string | number | undefined>
): string {
  return template.replace(/\{(\w+)\}/g, (match, token: string) => {
    const value = values[token];
    return value === undefined ? match : String(value);
  });
}

function formatDynamicMessageTemplates(
  templates: DynamicMessageTemplates,
  defaults: RestDefaults
): DynamicMessages {
  const values = {
    httpsPort: defaults.httpsPort,
    httpPort: defaults.httpPort,
    vault: defaults.vault
  };

  return {
    httpsUrlHint: interpolateDynamicTemplate(templates.httpsUrlHint, values),
    httpUrlHint: interpolateDynamicTemplate(templates.httpUrlHint, values),
    vaultNamePlaceholder: interpolateDynamicTemplate(templates.vaultNamePlaceholder, values)
  };
}

/**
 * Generate dynamic i18n messages that include configuration values
 */
export function generateDynamicMessages(language: Language): DynamicMessages {
  const restDefaults = configProvider.getRestDefaults();
  const templates = getDynamicMessageTemplates(language);
  return formatDynamicMessageTemplates(templates, restDefaults);
}

/**
 * Update DOM elements with dynamic messages
 */
export function updateDynamicMessages(language: Language) {
  // Check if we're in a browser environment
  if (typeof document === 'undefined') {
    return;
  }

  const messages = generateDynamicMessages(language);

  // Update HTTPS URL hint
  const httpsHint = document.querySelector('[data-i18n="httpsUrlHint"]');
  if (httpsHint) {
    httpsHint.textContent = messages.httpsUrlHint;
  }

  // Update HTTP URL hint
  const httpHint = document.querySelector('[data-i18n="httpUrlHint"]');
  if (httpHint) {
    httpHint.textContent = messages.httpUrlHint;
  }

  // Update vault name placeholder
  const vaultInputs = document.querySelectorAll('input[id*="vault"], input[placeholder*="Vault"]');
  vaultInputs.forEach((input) => {
    if (input instanceof HTMLInputElement && !input.value) {
      input.placeholder = messages.vaultNamePlaceholder;
    }
  });
}

/**
 * Get dynamic message for a specific key
 */
function isDynamicMessageKey(key: string): key is keyof DynamicMessages {
  for (const validKey of DYNAMIC_MESSAGE_KEYS) {
    if (validKey === key) {
      return true;
    }
  }
  return false;
}

export function getDynamicMessage(key: string, language: Language): string {
  const messages = generateDynamicMessages(language);
  if (isDynamicMessageKey(key)) {
    return messages[key];
  }
  return '';
}
