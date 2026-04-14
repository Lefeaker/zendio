import { describe, expect, it } from 'vitest';
import {
  CHROME_STATIC_KEYS,
  DEFAULT_LANGUAGE,
  getConfiguredLanguageCodes,
  getLanguageFallbackChain,
  resolveLanguage
} from '../../../src/i18n/config';
import { getAvailableLanguages } from '../../../src/i18n';
import { getLocaleCodes, loadLocaleDefinition } from '../../../src/i18n/locales';

describe('i18n config', () => {
  it('resolves pseudo locale aliases', () => {
    expect(resolveLanguage('pseudo')).toBe('qps-ploc');
    expect(resolveLanguage('qps_ploc')).toBe('qps-ploc');
  });

  it('resolves base qps language code', () => {
    expect(resolveLanguage('qps')).toBe('qps-ploc');
  });

  it('keeps default language as English outside development', () => {
    expect(DEFAULT_LANGUAGE).toBe('en');
  });

  it('builds multi-level fallback chain for es-419', () => {
    expect(getLanguageFallbackChain('es-419')).toEqual(['es-419', 'es-ES', 'en']);
  });

  it('builds multi-level fallback chain for es-ES', () => {
    expect(getLanguageFallbackChain('es-ES')).toEqual(['es-ES', 'es-419', 'en']);
  });

  it('exposes extended metadata in available languages list', () => {
    const languages = getAvailableLanguages();
    const zhCN = languages.find((item) => item.code === 'zh-CN');
    expect(zhCN).toBeDefined();
    expect(zhCN?.nativeName).toBe('简体中文');
    expect(zhCN?.region).toBe('CN');
    expect(zhCN?.textExpansion).toBe(1);
  });

  it('keeps locale module registry in sync with configured language codes', () => {
    const configured = getConfiguredLanguageCodes();
    const modules = getLocaleCodes();

    expect(new Set(modules)).toEqual(new Set(configured));
  });

  it('ensures locale static messages provide required Chrome keys', async () => {
    const requiredKeys = new Set(CHROME_STATIC_KEYS);

    for (const code of getLocaleCodes()) {
      const definition = await loadLocaleDefinition(code);
      expect(definition.static).toBeDefined();
      for (const key of requiredKeys) {
        expect(definition.static?.[key]).toBeTruthy();
      }
    }
  });
});
