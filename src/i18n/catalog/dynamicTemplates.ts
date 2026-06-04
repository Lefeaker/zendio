import { getLanguageFallbackChain } from '../config';
import type { Language } from '../locales';
import type { ReleaseLangCode } from './languages';
import { isReleaseLanguage, PSEUDO_LOCALE_CODE, PSEUDO_LOCALE_ENABLED } from './languages';
import { buildPseudoDynamicMessageTemplates } from './pseudoLocale';

export interface DynamicMessageTemplates {
  httpsUrlHint: string;
  httpUrlHint: string;
  vaultNamePlaceholder: string;
}

export type DynamicMessageKey = keyof DynamicMessageTemplates;

export const DYNAMIC_MESSAGE_KEYS: readonly DynamicMessageKey[] = [
  'httpsUrlHint',
  'httpUrlHint',
  'vaultNamePlaceholder'
] as const;

export const DYNAMIC_MESSAGE_TEMPLATES: Record<ReleaseLangCode, DynamicMessageTemplates> = {
  en: {
    httpsUrlHint: 'Usually port {httpsPort}, for secure connections',
    httpUrlHint: 'Usually port {httpPort}, as fallback connection',
    vaultNamePlaceholder: '{vault}'
  },
  'zh-CN': {
    httpsUrlHint: '通常端口为 {httpsPort}，适用于安全连接',
    httpUrlHint: '通常端口为 {httpPort}，作为备用连接',
    vaultNamePlaceholder: '{vault}'
  },
  ja: {
    httpsUrlHint: '通常はポート {httpsPort}、セキュア接続用',
    httpUrlHint: '通常はポート {httpPort}、フォールバック接続用',
    vaultNamePlaceholder: '{vault}'
  },
  de: {
    httpsUrlHint: 'Normalerweise Port {httpsPort}, für sichere Verbindungen',
    httpUrlHint: 'Normalerweise Port {httpPort}, als Fallback-Verbindung',
    vaultNamePlaceholder: '{vault}'
  },
  fr: {
    httpsUrlHint: 'Généralement port {httpsPort}, pour les connexions sécurisées',
    httpUrlHint: 'Généralement port {httpPort}, comme connexion de secours',
    vaultNamePlaceholder: '{vault}'
  },
  'es-ES': {
    httpsUrlHint: 'Normalmente puerto {httpsPort}, para conexiones seguras',
    httpUrlHint: 'Normalmente puerto {httpPort}, como conexión de respaldo',
    vaultNamePlaceholder: '{vault}'
  },
  'es-419': {
    httpsUrlHint: 'Usualmente puerto {httpsPort}, para conexiones seguras',
    httpUrlHint: 'Usualmente puerto {httpPort}, como conexión de respaldo',
    vaultNamePlaceholder: '{vault}'
  },
  it: {
    httpsUrlHint: 'Solitamente porta {httpsPort}, per connessioni sicure',
    httpUrlHint: 'Solitamente porta {httpPort}, per connessioni di backup',
    vaultNamePlaceholder: '{vault}'
  },
  ko: {
    httpsUrlHint: '일반적으로 포트 {httpsPort}, 보안 연결용',
    httpUrlHint: '일반적으로 포트 {httpPort}, 백업 연결용',
    vaultNamePlaceholder: '{vault}'
  },
  'pt-BR': {
    httpsUrlHint: 'Geralmente porta {httpsPort}, para conexões seguras',
    httpUrlHint: 'Geralmente porta {httpPort}, como conexão de fallback',
    vaultNamePlaceholder: '{vault}'
  },
  ru: {
    httpsUrlHint: 'Обычно порт {httpsPort}, для безопасных соединений',
    httpUrlHint: 'Обычно порт {httpPort}, как резервное соединение',
    vaultNamePlaceholder: '{vault}'
  },
  'zh-TW': {
    httpsUrlHint: '通常是埠 {httpsPort}，用於安全連接',
    httpUrlHint: '通常是埠 {httpPort}，用於備用連接',
    vaultNamePlaceholder: '{vault}'
  }
};

const ENGLISH_DYNAMIC_MESSAGE_TEMPLATES = DYNAMIC_MESSAGE_TEMPLATES.en;

function createPseudoDynamicMessageTemplates(): DynamicMessageTemplates {
  return buildPseudoDynamicMessageTemplates(ENGLISH_DYNAMIC_MESSAGE_TEMPLATES);
}

const pseudoDynamicMessageTemplates = PSEUDO_LOCALE_ENABLED
  ? createPseudoDynamicMessageTemplates()
  : null;

export function getDynamicMessageTemplates(language: Language): DynamicMessageTemplates {
  for (const candidate of getLanguageFallbackChain(language)) {
    if (PSEUDO_LOCALE_ENABLED && candidate === PSEUDO_LOCALE_CODE && pseudoDynamicMessageTemplates) {
      return pseudoDynamicMessageTemplates;
    }

    if (!isReleaseLanguage(candidate)) {
      continue;
    }

    const templates = DYNAMIC_MESSAGE_TEMPLATES[candidate];
    if (templates) {
      return templates;
    }
  }

  return ENGLISH_DYNAMIC_MESSAGE_TEMPLATES;
}
