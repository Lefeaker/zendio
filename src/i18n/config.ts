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

const BASE_LANGUAGE: LangCode = 'en';

const LANGUAGE_ORDER: LangCode[] = [
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
  'zh-TW',
  'qps-ploc'
];

export const LANGUAGE_CONFIG: Record<LangCode, LanguageMetadata> = {
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
  },
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

const isDevelopment = process.env.NODE_ENV === 'development';

export const DEFAULT_LANGUAGE: LangCode = 'en';

export const CHROME_STATIC_KEYS = ['extName', 'extDescription'] as const;

export interface AvailableLanguage {
  code: LangCode;
  name: string;
  dir: 'ltr' | 'rtl';
  nativeName: string;
  englishName: string;
  region: string;
  textExpansion: number;
}

export const AVAILABLE_LANGUAGES: AvailableLanguage[] = LANGUAGE_ORDER.filter(
  (code) => code !== 'qps-ploc' || isDevelopment
).map((code) => {
  const meta = LANGUAGE_CONFIG[code];
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

export function getConfiguredLanguageCodes(): LangCode[] {
  return [...LANGUAGE_ORDER];
}

function normalizeLanguageCandidate(value: string): string {
  return value.trim().replace(/_/g, '-');
}

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function isSupportedLanguage(code: string): code is LangCode {
  return Reflect.has(LANGUAGE_CONFIG, code);
}

function resolveLanguageCandidates(input?: string): LangCode[] {
  const candidates: LangCode[] = [];
  const seen = new Set<LangCode>();

  const addCandidate = (code?: string): void => {
    if (!code || !isSupportedLanguage(code)) {
      return;
    }
    if (seen.has(code)) {
      return;
    }
    seen.add(code);
    candidates.push(code);
  };

  if (input) {
    const normalized = normalizeLanguageCandidate(input);

    for (const code of LANGUAGE_ORDER) {
      if (equalsIgnoreCase(code, normalized)) {
        addCandidate(code);
        break;
      }
    }

    for (const code of LANGUAGE_ORDER) {
      const aliases = LANGUAGE_CONFIG[code].aliases ?? [];
      if (aliases.some((alias) => equalsIgnoreCase(alias, normalized))) {
        addCandidate(code);
      }
    }

    const base = normalized.split('-')[0];
    for (const code of LANGUAGE_ORDER) {
      if (equalsIgnoreCase(code.split('-')[0], base)) {
        addCandidate(code);
      }
    }
  }

  if (candidates.length === 0) {
    addCandidate(DEFAULT_LANGUAGE);
  }

  for (let index = 0; index < candidates.length; index++) {
    const code = candidates[index];
    const fallbacks = LANGUAGE_CONFIG[code]?.fallbacks ?? [];
    for (const fallback of fallbacks) {
      addCandidate(fallback);
    }
  }

  addCandidate(BASE_LANGUAGE);
  addCandidate(DEFAULT_LANGUAGE);

  return candidates;
}

export function getLanguageFallbackChain(input?: string): LangCode[] {
  return resolveLanguageCandidates(input);
}

/**
 * Resolve arbitrary language input (user preference, navigator.language, aliases)
 * into one of the supported language codes.
 */
export function resolveLanguage(input?: string): LangCode {
  const [primary] = resolveLanguageCandidates(input);
  return primary ?? DEFAULT_LANGUAGE;
}
