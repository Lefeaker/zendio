export type LangCode =
  | 'en'
  | 'zh-CN'
  | 'ja'
  | 'de'
  | 'fr'
  | 'es-ES'
  | 'es-419'
  | 'it'
  | 'ko'
  | 'pt-BR'
  | 'ru'
  | 'zh-TW'
  | 'qps-ploc';

export interface LanguageMetadata {
  label: string;
  dir: 'ltr' | 'rtl';
  englishName: string;
  nativeName: string;
  region: string;
  aliases?: string[];
  fallbacks?: LangCode[];
  textExpansion?: number;
}

export type PseudoLocaleCode = 'qps-ploc';
export type ReleaseLangCode = Exclude<LangCode, PseudoLocaleCode>;

const BASE_LANGUAGE: LangCode = 'en';
export const DEFAULT_LANGUAGE: LangCode = BASE_LANGUAGE;
export const PSEUDO_LOCALE_CODE: PseudoLocaleCode = 'qps-ploc';
export const PSEUDO_LOCALE_ENABLED = process.env.NODE_ENV !== 'production';

export const RELEASE_LANGUAGE_ORDER: ReleaseLangCode[] = [
  'en',
  'zh-CN',
  'ja',
  'de',
  'fr',
  'es-ES',
  'es-419',
  'it',
  'ko',
  'pt-BR',
  'ru',
  'zh-TW'
];

export const RELEASE_LANGUAGE_CONFIG: Record<ReleaseLangCode, LanguageMetadata> = {
  en: {
    label: 'English',
    dir: 'ltr',
    englishName: 'English',
    nativeName: 'English',
    region: 'US',
    aliases: ['en-US', 'en-GB', 'en_AU', 'en-CA', 'en-IN', 'en_NZ'],
    fallbacks: [],
    textExpansion: 1
  },
  'zh-CN': {
    label: '简体中文',
    dir: 'ltr',
    englishName: 'Simplified Chinese',
    nativeName: '简体中文',
    region: 'CN',
    aliases: ['zh', 'zh-Hans', 'zh_CN', 'zh-hans', 'zh-SG', 'zh_SG'],
    fallbacks: [BASE_LANGUAGE],
    textExpansion: 1
  },
  ja: {
    label: '日本語',
    dir: 'ltr',
    englishName: 'Japanese',
    nativeName: '日本語',
    region: 'JP',
    aliases: ['ja-JP', 'ja_JP'],
    fallbacks: [BASE_LANGUAGE],
    textExpansion: 1.05
  },
  de: {
    label: 'Deutsch',
    dir: 'ltr',
    englishName: 'German',
    nativeName: 'Deutsch',
    region: 'DE',
    aliases: ['de-DE', 'de_DE', 'de-AT', 'de_AT', 'de-CH', 'de_CH'],
    fallbacks: [BASE_LANGUAGE],
    textExpansion: 1.5
  },
  fr: {
    label: 'Français',
    dir: 'ltr',
    englishName: 'French',
    nativeName: 'Français',
    region: 'FR',
    aliases: ['fr-FR', 'fr_FR', 'fr-CA', 'fr_CA', 'fr-BE', 'fr_BE'],
    fallbacks: [BASE_LANGUAGE],
    textExpansion: 1.3
  },
  'es-ES': {
    label: 'Español (España)',
    dir: 'ltr',
    englishName: 'Spanish (Spain)',
    nativeName: 'Español (España)',
    region: 'ES',
    aliases: ['es', 'es-ES', 'es_ES'],
    fallbacks: ['es-419', BASE_LANGUAGE],
    textExpansion: 1.2
  },
  'es-419': {
    label: 'Español (Latinoamérica)',
    dir: 'ltr',
    englishName: 'Spanish (Latin America)',
    nativeName: 'Español (Latinoamérica)',
    region: '419',
    aliases: ['es-419', 'es_419', 'es-MX', 'es_LA', 'es-AR', 'es-CO', 'es-CL', 'es-PE', 'es-VE'],
    fallbacks: ['es-ES', BASE_LANGUAGE],
    textExpansion: 1.25
  },
  it: {
    label: 'Italiano',
    dir: 'ltr',
    englishName: 'Italian',
    nativeName: 'Italiano',
    region: 'IT',
    aliases: ['it-IT', 'it_IT', 'it-CH', 'it_CH'],
    fallbacks: [BASE_LANGUAGE],
    textExpansion: 1.25
  },
  ko: {
    label: '한국어',
    dir: 'ltr',
    englishName: 'Korean',
    nativeName: '한국어',
    region: 'KR',
    aliases: ['ko-KR', 'ko_KR'],
    fallbacks: [BASE_LANGUAGE],
    textExpansion: 0.95
  },
  'pt-BR': {
    label: 'Português (Brasil)',
    dir: 'ltr',
    englishName: 'Portuguese (Brazil)',
    nativeName: 'Português (Brasil)',
    region: 'BR',
    aliases: ['pt', 'pt-BR', 'pt_BR', 'pt-PT', 'pt_PT'],
    fallbacks: [BASE_LANGUAGE],
    textExpansion: 1.25
  },
  ru: {
    label: 'Русский',
    dir: 'ltr',
    englishName: 'Russian',
    nativeName: 'Русский',
    region: 'RU',
    aliases: ['ru-RU', 'ru_RU'],
    fallbacks: [BASE_LANGUAGE],
    textExpansion: 1.4
  },
  'zh-TW': {
    label: '繁體中文',
    dir: 'ltr',
    englishName: 'Traditional Chinese',
    nativeName: '繁體中文',
    region: 'TW',
    aliases: ['zh-TW', 'zh_TW', 'zh-Hant', 'zh-hant', 'zh-HK', 'zh_HK'],
    fallbacks: ['zh-CN', BASE_LANGUAGE],
    textExpansion: 1.05
  }
};

export const PSEUDO_LANGUAGE_CONFIG: Record<PseudoLocaleCode, LanguageMetadata> = {
  'qps-ploc': {
    label: '[Pseudo]',
    dir: 'ltr',
    englishName: 'Pseudo',
    nativeName: 'Pseudo',
    region: 'TEST',
    aliases: ['pseudo', 'qps-ploc', 'qps_ploc', 'x-pseudo'],
    fallbacks: [BASE_LANGUAGE],
    textExpansion: 1.6
  }
};

export const LANGUAGE_CONFIG: Partial<Record<LangCode, LanguageMetadata>> = PSEUDO_LOCALE_ENABLED
  ? { ...RELEASE_LANGUAGE_CONFIG, ...PSEUDO_LANGUAGE_CONFIG }
  : RELEASE_LANGUAGE_CONFIG;

export const LANGUAGE_METADATA = LANGUAGE_CONFIG;

export const RELEASE_WEB_EXTENSION_LOCALE_FOLDERS: Record<ReleaseLangCode, string> = {
  en: 'en',
  'zh-CN': 'zh_CN',
  ja: 'ja',
  de: 'de',
  fr: 'fr',
  'es-ES': 'es',
  'es-419': 'es_419',
  it: 'it',
  ko: 'ko',
  'pt-BR': 'pt_BR',
  ru: 'ru',
  'zh-TW': 'zh_TW'
};

export const WEB_EXTENSION_LOCALE_FOLDERS: Partial<Record<LangCode, string>> = PSEUDO_LOCALE_ENABLED
  ? { ...RELEASE_WEB_EXTENSION_LOCALE_FOLDERS, [PSEUDO_LOCALE_CODE]: PSEUDO_LOCALE_CODE }
  : RELEASE_WEB_EXTENSION_LOCALE_FOLDERS;

const RELEASE_LANGUAGE_SET = new Set<string>(RELEASE_LANGUAGE_ORDER);

export function isReleaseLanguage(code: string): code is ReleaseLangCode {
  return RELEASE_LANGUAGE_SET.has(code);
}

export function getRuntimeLanguageOrder(): LangCode[] {
  if (PSEUDO_LOCALE_ENABLED) {
    return [...RELEASE_LANGUAGE_ORDER, PSEUDO_LOCALE_CODE];
  }
  return [...RELEASE_LANGUAGE_ORDER];
}

export function getAvailableLanguageOrder(): LangCode[] {
  return process.env.NODE_ENV === 'development'
    ? getRuntimeLanguageOrder()
    : [...RELEASE_LANGUAGE_ORDER];
}

export interface AvailableLanguage {
  code: LangCode;
  name: string;
  dir: 'ltr' | 'rtl';
  nativeName: string;
  englishName: string;
  region: string;
  textExpansion: number;
}

export const AVAILABLE_LANGUAGE_ORDER = getAvailableLanguageOrder();

export const AVAILABLE_LANGUAGES: AvailableLanguage[] = AVAILABLE_LANGUAGE_ORDER.map((code) => {
  const meta = LANGUAGE_METADATA[code];
  if (!meta) {
    throw new Error(`Language metadata is not registered for ${code}`);
  }
  return {
    code,
    name: meta.label,
    dir: meta.dir,
    nativeName: meta.nativeName,
    englishName: meta.englishName,
    region: meta.region,
    textExpansion: meta.textExpansion ?? 1
  };
});

export const LANGUAGE_ALIASES: Partial<Record<LangCode, string[]>> = Object.fromEntries(
  getRuntimeLanguageOrder().map((code) => [code, [...(LANGUAGE_METADATA[code]?.aliases ?? [])]])
) as Partial<Record<LangCode, string[]>>;

export const LANGUAGE_FALLBACKS: Partial<Record<LangCode, LangCode[]>> = Object.fromEntries(
  getRuntimeLanguageOrder().map((code) => [code, [...(LANGUAGE_METADATA[code]?.fallbacks ?? [])]])
) as Partial<Record<LangCode, LangCode[]>>;

export function getConfiguredLanguageCodes(): LangCode[] {
  return getRuntimeLanguageOrder();
}

export function getWebExtensionLocaleFolder(code: LangCode): string {
  const folder = WEB_EXTENSION_LOCALE_FOLDERS[code];
  if (!folder) {
    throw new Error(`WebExtension locale folder is not registered for ${code}`);
  }
  return folder;
}
