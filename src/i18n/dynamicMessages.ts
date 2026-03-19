import { configProvider } from '../shared/config';
import { pseudoLocalizeString } from './pseudoLocalization';
import type { Language } from './locales';

type RestDefaults = ReturnType<typeof configProvider.getRestDefaults>;

interface DynamicMessages {
  httpsUrlHint: string;
  httpUrlHint: string;
  vaultNamePlaceholder: string;
}

const DYNAMIC_MESSAGE_KEYS: readonly (keyof DynamicMessages)[] = [
  'httpsUrlHint',
  'httpUrlHint',
  'vaultNamePlaceholder'
] as const;

type DynamicMessageFactory = (defaults: RestDefaults) => DynamicMessages;

const englishDynamicFactory: DynamicMessageFactory = (defaults) => ({
  httpsUrlHint: `Usually port ${defaults.httpsPort}, for secure connections`,
  httpUrlHint: `Usually port ${defaults.httpPort}, as fallback connection`,
  vaultNamePlaceholder: defaults.vault
});

const dynamicMessageFactories: Partial<Record<Language, DynamicMessageFactory>> = {
  'zh-CN': (defaults) => ({
    httpsUrlHint: `通常端口为 ${defaults.httpsPort}，适用于安全连接`,
    httpUrlHint: `通常端口为 ${defaults.httpPort}，作为备用连接`,
    vaultNamePlaceholder: defaults.vault
  }),
  en: englishDynamicFactory,
  ja: (defaults) => ({
    httpsUrlHint: `通常はポート ${defaults.httpsPort}、セキュア接続用`,
    httpUrlHint: `通常はポート ${defaults.httpPort}、フォールバック接続用`,
    vaultNamePlaceholder: defaults.vault
  }),
  de: (defaults) => ({
    httpsUrlHint: `Normalerweise Port ${defaults.httpsPort}, für sichere Verbindungen`,
    httpUrlHint: `Normalerweise Port ${defaults.httpPort}, als Fallback-Verbindung`,
    vaultNamePlaceholder: defaults.vault
  }),
  fr: (defaults) => ({
    httpsUrlHint: `Généralement port ${defaults.httpsPort}, pour les connexions sécurisées`,
    httpUrlHint: `Généralement port ${defaults.httpPort}, comme connexion de secours`,
    vaultNamePlaceholder: defaults.vault
  }),
  'es-ES': (defaults) => ({
    httpsUrlHint: `Normalmente puerto ${defaults.httpsPort}, para conexiones seguras`,
    httpUrlHint: `Normalmente puerto ${defaults.httpPort}, como conexión de respaldo`,
    vaultNamePlaceholder: defaults.vault
  }),
  'es-419': (defaults) => ({
    httpsUrlHint: `Usualmente puerto ${defaults.httpsPort}, para conexiones seguras`,
    httpUrlHint: `Usualmente puerto ${defaults.httpPort}, como conexión de respaldo`,
    vaultNamePlaceholder: defaults.vault
  }),
  it: (defaults) => ({
    httpsUrlHint: `Solitamente porta ${defaults.httpsPort}, per connessioni sicure`,
    httpUrlHint: `Solitamente porta ${defaults.httpPort}, per connessioni di backup`,
    vaultNamePlaceholder: defaults.vault
  }),
  ko: (defaults) => ({
    httpsUrlHint: `일반적으로 포트 ${defaults.httpsPort}, 보안 연결용`,
    httpUrlHint: `일반적으로 포트 ${defaults.httpPort}, 백업 연결용`,
    vaultNamePlaceholder: defaults.vault
  }),
  'pt-BR': (defaults) => ({
    httpsUrlHint: `Geralmente porta ${defaults.httpsPort}, para conexões seguras`,
    httpUrlHint: `Geralmente porta ${defaults.httpPort}, como conexão de fallback`,
    vaultNamePlaceholder: defaults.vault
  }),
  ru: (defaults) => ({
    httpsUrlHint: `Обычно порт ${defaults.httpsPort}, для безопасных соединений`,
    httpUrlHint: `Обычно порт ${defaults.httpPort}, как резервное соединение`,
    vaultNamePlaceholder: defaults.vault
  }),
  'zh-TW': (defaults) => ({
    httpsUrlHint: `通常是埠 ${defaults.httpsPort}，用於安全連接`,
    httpUrlHint: `通常是埠 ${defaults.httpPort}，用於備用連接`,
    vaultNamePlaceholder: defaults.vault
  }),
  'qps-ploc': (defaults) => {
    const base = englishDynamicFactory(defaults);
    return {
      httpsUrlHint: pseudoLocalizeString(base.httpsUrlHint),
      httpUrlHint: pseudoLocalizeString(base.httpUrlHint),
      vaultNamePlaceholder: pseudoLocalizeString(base.vaultNamePlaceholder)
    };
  }
};

const FALLBACK_LANGUAGE: Language = 'zh-CN';

function resolveDynamicMessageFactory(language: Language): DynamicMessageFactory {
  return dynamicMessageFactories[language]
    ?? dynamicMessageFactories[FALLBACK_LANGUAGE]
    ?? englishDynamicFactory;
}

/**
 * Generate dynamic i18n messages that include configuration values
 */
export function generateDynamicMessages(language: Language): DynamicMessages {
  const restDefaults = configProvider.getRestDefaults();
  const factory = resolveDynamicMessageFactory(language);
  return factory(restDefaults);
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
  vaultInputs.forEach(input => {
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
