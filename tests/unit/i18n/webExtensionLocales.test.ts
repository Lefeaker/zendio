import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RELEASE_LANGUAGE_ORDER } from '../../../src/i18n/catalog/languages';
import { getConfiguredLanguageCodes, getWebExtensionLocaleFolder } from '../../../src/i18n/config';

const root = process.cwd();
const publicLocalesDir = join(root, 'public', '_locales');
const rootLocalesDir = join(root, '_locales');

describe('WebExtension locale folders', () => {
  it('maps runtime locale codes with regional subtags to WebExtension folder names', () => {
    expect(getWebExtensionLocaleFolder('zh-CN')).toBe('zh_CN');
    expect(getWebExtensionLocaleFolder('zh-TW')).toBe('zh_TW');
    expect(getWebExtensionLocaleFolder('pt-BR')).toBe('pt_BR');
    expect(getWebExtensionLocaleFolder('es-419')).toBe('es_419');
    expect(getWebExtensionLocaleFolder('es-ES')).toBe('es');
  });

  it('keeps a public locale folder for every configured locale code', async () => {
    const publicFolders = new Set(await readdir(publicLocalesDir));

    for (const code of getConfiguredLanguageCodes()) {
      expect(publicFolders.has(getWebExtensionLocaleFolder(code))).toBe(true);
    }
  });

  it('keeps a public locale folder for every release locale code', async () => {
    const publicFolders = new Set(await readdir(publicLocalesDir));

    for (const code of RELEASE_LANGUAGE_ORDER) {
      expect(publicFolders.has(getWebExtensionLocaleFolder(code))).toBe(true);
    }
  });

  it('does not keep a root locale compatibility duplicate', async () => {
    await expect(readdir(rootLocalesDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
