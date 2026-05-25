import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
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
  schemaShellMessagesZhHant
} from '@i18n/schemaShellMessages';

describe('schema i18n parity', () => {
  it('requires formal locales to own schema-shell copy instead of spreading the English block', () => {
    const localeFiles = [
      'en.ts',
      'de.ts',
      'es-419.ts',
      'es-ES.ts',
      'fr.ts',
      'it.ts',
      'ja.ts',
      'ko.ts',
      'pt-BR.ts',
      'ru.ts',
      'zh-CN.ts',
      'zh-TW.ts'
    ];

    localeFiles.forEach((filename) => {
      const source = readFileSync(resolve(process.cwd(), 'src/i18n/locales', filename), 'utf8');

      expect(source).not.toMatch(/\bschemaShellMessagesEn\b/);
      expect(source).not.toContain('...schemaShellMessagesEn');
    });

    const shellSource = readFileSync(
      resolve(process.cwd(), 'src/i18n/schemaShellMessages.ts'),
      'utf8'
    );
    const formalSchemaShellExports = [
      'schemaShellMessagesEnglish',
      'schemaShellMessagesDe',
      'schemaShellMessagesEs419',
      'schemaShellMessagesEsEs',
      'schemaShellMessagesFr',
      'schemaShellMessagesIt',
      'schemaShellMessagesJa',
      'schemaShellMessagesKo',
      'schemaShellMessagesPtBr',
      'schemaShellMessagesRu'
    ];

    formalSchemaShellExports.forEach((exportName) => {
      expect(shellSource).not.toContain(`export const ${exportName} = schemaShellMessagesEn;`);
      expect(shellSource).not.toContain(`export const ${exportName} = { ...schemaShellMessagesEn`);
    });

    expect(shellSource).not.toContain('...schemaShellMessagesZhHans');
  });

  it('requires formal schema-shell exports to keep the full keyset without collapsing back to English', () => {
    const englishKeys = Object.keys(schemaShellMessagesEn).sort();
    const formalShellExports = [
      schemaShellMessagesEnglish,
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

    formalShellExports.forEach((shellMessages) => {
      expect(Object.keys(shellMessages).sort()).toEqual(englishKeys);
    });

    [
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
      expect(shellMessages).not.toEqual(schemaShellMessagesEn);
    });
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
