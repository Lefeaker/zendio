import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '@shared/errors/errorHandler';
import { createTestPlatformHarness } from '../../utils/platformTestHarness';

const harness = createTestPlatformHarness();

beforeEach(() => {
  vi.stubGlobal('navigator', undefined);
  harness.configure();
});

afterEach(() => {
  harness.reset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('i18n storage fallbacks', () => {
  it('falls back to navigator language when storage is not configured', async () => {
    vi.stubGlobal('navigator', { language: 'zh-CN' });
    const { configureI18nStorage, getCurrentLanguage } = await import('../../../src/i18n');
    configureI18nStorage(null);

    await expect(getCurrentLanguage()).resolves.toBe('zh-CN');
  });

  it('reads and writes configured language through injected storage', async () => {
    const { configureI18nStorage, getCurrentLanguage, setCurrentLanguage } = await import(
      '../../../src/i18n'
    );
    configureI18nStorage(harness.storage.sync);

    await harness.storage.sync.set('language', 'fr');
    await expect(getCurrentLanguage()).resolves.toBe('fr');

    await setCurrentLanguage('zh-CN');
    await expect(harness.storage.sync.get<string>('language')).resolves.toBe('zh-CN');
  });

  it('returns default language when storage read fails', async () => {
    const { configureI18nStorage, DEFAULT_LANGUAGE, getCurrentLanguage } = await import(
      '../../../src/i18n'
    );
    configureI18nStorage(harness.storage.sync);
    const getSpy = vi
      .spyOn(harness.storage.sync, 'get')
      .mockRejectedValueOnce(new Error('sync failure'));
    const handleSpy = vi.spyOn(errorHandler, 'handle');

    const result = await getCurrentLanguage();

    expect(result).toBe(DEFAULT_LANGUAGE);
    expect(handleSpy).toHaveBeenCalledTimes(1);
    const [error] = handleSpy.mock.calls[0];
    expect(error).toMatchObject({ code: 'I18N_LANGUAGE_LOAD_FAILED', domain: 'i18n' });
    getSpy.mockRestore();
  });

  it('handles storage write errors without throwing', async () => {
    const { configureI18nStorage, setCurrentLanguage } = await import('../../../src/i18n');
    configureI18nStorage(harness.storage.sync);
    const setSpy = vi
      .spyOn(harness.storage.sync, 'set')
      .mockRejectedValueOnce(new Error('write failure'));
    const handleSpy = vi.spyOn(errorHandler, 'handle');

    await expect(setCurrentLanguage('en')).resolves.toBeUndefined();
    expect(handleSpy).toHaveBeenCalledTimes(1);
    const [error] = handleSpy.mock.calls[0];
    expect(error).toMatchObject({ code: 'I18N_LANGUAGE_SAVE_FAILED', domain: 'i18n' });
    setSpy.mockRestore();
  });
});
