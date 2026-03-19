import { DEFAULT_LANGUAGE, getLanguageFallbackChain } from './config';
import type { LangCode } from './config';
import type { LocaleDefinition, LocaleStaticMessages } from './localeDefinition';
import en from './locales/en';
import zhCN from './locales/zh-CN';
import ja from './locales/ja';
import de from './locales/de';
import fr from './locales/fr';
import esES from './locales/es-ES';
import es419 from './locales/es-419';
import it from './locales/it';
import ko from './locales/ko';
import ptBR from './locales/pt-BR';
import ru from './locales/ru';
import zhTW from './locales/zh-TW';
import qpsPloc from './locales/qps-ploc';

export type Language = LangCode;

export type { Messages } from './messages';
export { DEFAULT_LANGUAGE, AVAILABLE_LANGUAGES } from './config';

const localeEntries: ReadonlyArray<[Language, LocaleDefinition]> = [
  ['en', en],
  ['zh-CN', zhCN],
  ['ja', ja],
  ['de', de],
  ['fr', fr],
  ['es-ES', esES],
  ['es-419', es419],
  ['it', it],
  ['ko', ko],
  ['pt-BR', ptBR],
  ['ru', ru],
  ['zh-TW', zhTW],
  ['qps-ploc', qpsPloc]
];

const buildRecord = <Value,>(selector: (definition: LocaleDefinition) => Value): Record<Language, Value> => {
  return Object.fromEntries(
    localeEntries.map(([code, definition]) => [code, selector(definition)])
  ) as Record<Language, Value>;
};

const localeModules = buildRecord((definition) => definition);

export { localeModules };

export const messages = buildRecord((definition) => definition.runtime);

export const staticMessages = buildRecord((definition) => definition.static);

export function getStaticMessages(language: Language): LocaleStaticMessages {
  const chain = getLanguageFallbackChain(language);
  for (const code of chain) {
    const candidate = staticMessages[code];
    if (candidate) {
      return candidate;
    }
  }
  return staticMessages[DEFAULT_LANGUAGE];
}
