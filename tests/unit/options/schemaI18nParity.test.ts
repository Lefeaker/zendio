import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import de from '@i18n/generated/locales/de.generated';
import en from '@i18n/generated/locales/en.generated';
import es419 from '@i18n/generated/locales/es-419.generated';
import esES from '@i18n/generated/locales/es-ES.generated';
import fr from '@i18n/generated/locales/fr.generated';
import itLocale from '@i18n/generated/locales/it.generated';
import ja from '@i18n/generated/locales/ja.generated';
import ko from '@i18n/generated/locales/ko.generated';
import ptBR from '@i18n/generated/locales/pt-BR.generated';
import ru from '@i18n/generated/locales/ru.generated';
import zhCN from '@i18n/generated/locales/zh-CN.generated';
import zhTW from '@i18n/generated/locales/zh-TW.generated';
import {
  schemaShellMessagesDe,
  schemaShellMessagesEn,
  schemaShellMessagesEnglish,
  schemaShellMessagesEs419,
  schemaShellMessagesEsEs,
  schemaShellMessagesFr,
  schemaShellMessagesIt,
  schemaShellMessagesJa,
  schemaShellMessagesKo,
  schemaShellMessagesPtBr,
  schemaShellMessagesRu,
  schemaShellMessagesZhHans,
  schemaShellMessagesZhHant
} from '@i18n/generated/schemaMessages.generated';

describe('schema i18n parity', () => {
  it('removes legacy handwritten locale and schema-shell facades', () => {
    const localesDir = resolve(process.cwd(), 'src/i18n/locales');
    const localeFiles = existsSync(localesDir)
      ? readdirSync(localesDir).filter((file) => file.endsWith('.ts'))
      : [];

    expect(localeFiles).toEqual([]);
    expect(existsSync(resolve(process.cwd(), 'src/i18n/schemaShellMessages.ts'))).toBe(false);
  });

  it('keeps generated schema catalogs aligned with the English keyset', () => {
    const englishKeys = Object.keys(schemaShellMessagesEnglish).sort();
    const generatedShellExports = [
      schemaShellMessagesEn,
      schemaShellMessagesEnglish,
      schemaShellMessagesZhHans,
      schemaShellMessagesDe,
      schemaShellMessagesEs419,
      schemaShellMessagesEsEs,
      schemaShellMessagesFr,
      schemaShellMessagesIt,
      schemaShellMessagesJa,
      schemaShellMessagesKo,
      schemaShellMessagesPtBr,
      schemaShellMessagesRu,
      schemaShellMessagesZhHant
    ];

    generatedShellExports.forEach((shellMessages) => {
      expect(Object.keys(shellMessages).sort()).toEqual(englishKeys);
    });

    [
      schemaShellMessagesZhHans,
      schemaShellMessagesDe,
      schemaShellMessagesEs419,
      schemaShellMessagesEsEs,
      schemaShellMessagesFr,
      schemaShellMessagesIt,
      schemaShellMessagesJa,
      schemaShellMessagesKo,
      schemaShellMessagesPtBr,
      schemaShellMessagesRu,
      schemaShellMessagesZhHant
    ].forEach((shellMessages) => {
      expect(shellMessages).not.toEqual(schemaShellMessagesEnglish);
    });
  });

  it('keeps release runtime locale maps in sync with the generated schema catalogs', () => {
    const localeSchemas = [
      en.runtime,
      schemaShellMessagesEnglish,
      zhCN.runtime,
      schemaShellMessagesZhHans,
      ja.runtime,
      schemaShellMessagesJa,
      de.runtime,
      schemaShellMessagesDe,
      fr.runtime,
      schemaShellMessagesFr,
      esES.runtime,
      schemaShellMessagesEsEs,
      es419.runtime,
      schemaShellMessagesEs419,
      itLocale.runtime,
      schemaShellMessagesIt,
      ko.runtime,
      schemaShellMessagesKo,
      ptBR.runtime,
      schemaShellMessagesPtBr,
      ru.runtime,
      schemaShellMessagesRu,
      zhTW.runtime,
      schemaShellMessagesZhHant
    ];

    for (let index = 0; index < localeSchemas.length; index += 2) {
      const runtime = localeSchemas[index] as Record<string, string>;
      const schemaMessages = localeSchemas[index + 1] as Record<string, string>;

      for (const [key, value] of Object.entries(schemaMessages)) {
        expect(runtime[key]).toBe(value);
      }
    }
  });

  it('keeps Stitch registry free of previous schema-shell hardcoded sentences', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/options/stitch/schema/registry.ts'),
      'utf8'
    );

    expect(source).not.toContain('Usage overview, interface language, and privacy controls.');
    expect(source).not.toContain('Manage vault connections and routing rules.');
    expect(source).not.toContain('保存页面时生成 AI 总结');
    expect(source).not.toContain('Support the project through the available public channels.');
  });
});
