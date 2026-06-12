/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { I18nBindingAdapter, I18nBindingHandle, I18nResource } from '../../../src/i18n';
import { createTestPlatformHarness } from '../../utils/platformTestHarness';

const harness = createTestPlatformHarness();

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('navigator', undefined);
  harness.configure();
});

afterEach(() => {
  harness.reset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function createRecordingBindingAdapter(): I18nBindingAdapter & { resources: I18nResource[] } {
  const resources: I18nResource[] = [];
  const createHandle = (): I18nBindingHandle => ({
    dispose: vi.fn()
  });

  return {
    bindText: () => createHandle(),
    bindAttribute: () => createHandle(),
    bindHtml: () => createHandle(),
    refresh: (resource) => {
      resources.push(resource);
    },
    clear: vi.fn(),
    resources
  };
}

describe('i18n storage fallbacks', () => {
  it('falls back to navigator language when storage is not configured', async () => {
    vi.stubGlobal('navigator', { language: 'zh-CN' });
    const { configureI18nStorage, getCurrentLanguage } = await import('../../../src/i18n');
    configureI18nStorage(null);

    await expect(getCurrentLanguage()).resolves.toBe('zh-CN');
  });

  it('uses Chrome UI language when navigator candidates are unsupported', async () => {
    vi.stubGlobal('navigator', { languages: ['nl-NL'], language: 'sv-SE' });
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => 'ja-JP' } });
    const { configureI18nStorage, getCurrentLanguage } = await import('../../../src/i18n');
    configureI18nStorage(null);

    await expect(getCurrentLanguage()).resolves.toBe('ja');
  });

  it('reads storage language and persists the resolved language through injected storage', async () => {
    const { configureI18nStorage, getCurrentLanguage, setCurrentLanguage } =
      await import('../../../src/i18n');
    configureI18nStorage(harness.storage.sync);

    await harness.storage.sync.set('language', 'fr');
    await expect(getCurrentLanguage()).resolves.toBe('fr');

    await setCurrentLanguage('es' as never);
    await expect(harness.storage.sync.get<string>('language')).resolves.toBe('es-ES');
  });

  it('falls back to navigator language and reports when storage read fails', async () => {
    vi.stubGlobal('navigator', { language: 'ja-JP' });
    const { configureI18nStorage, DEFAULT_LANGUAGE, getCurrentLanguage } =
      await import('../../../src/i18n');
    const { errorHandler } = await import('@shared/errors/errorHandler');
    configureI18nStorage(harness.storage.sync);
    const getSpy = vi
      .spyOn(harness.storage.sync, 'get')
      .mockRejectedValueOnce(new Error('sync failure'));
    const handleSpy = vi.spyOn(errorHandler, 'handle');

    const result = await getCurrentLanguage();

    expect(result).not.toBe(DEFAULT_LANGUAGE);
    expect(result).toBe('ja');
    expect(handleSpy).toHaveBeenCalledTimes(1);
    const [error] = handleSpy.mock.calls[0];
    expect(error).toMatchObject({ code: 'I18N_LANGUAGE_LOAD_FAILED', domain: 'i18n' });
    getSpy.mockRestore();
  });

  it('handles storage write errors without throwing', async () => {
    const { configureI18nStorage, setCurrentLanguage } = await import('../../../src/i18n');
    const { errorHandler } = await import('@shared/errors/errorHandler');
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

  it('updates document metadata when loading a resolved locale', async () => {
    const { loadLocale } = await import('../../../src/i18n');

    await loadLocale('zh');

    expect(document.documentElement.getAttribute('lang')).toBe('zh-CN');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });
});

describe('locale fallback characterization', () => {
  it('resolves alias and default fallback behavior for runtime messages', async () => {
    const { DEFAULT_RUNTIME_MESSAGES, loadMessagesWithFallback } =
      await import('../../../src/i18n/locales');

    const zhAliasMessages = await loadMessagesWithFallback('zh');
    const zhMessages = await loadMessagesWithFallback('zh-CN');
    const unknownMessages = await loadMessagesWithFallback('unsupported-locale');

    expect(zhAliasMessages).toEqual(zhMessages);
    expect(unknownMessages).toBe(DEFAULT_RUNTIME_MESSAGES);
  });

  it('keeps content/runtime locale loads schema-free', async () => {
    const { loadMessagesWithFallback } = await import('../../../src/i18n/locales');

    const runtimeMessages = await loadMessagesWithFallback('en');

    expect(runtimeMessages.extensionName).toBeTypeOf('string');
    expect('schemaOverviewTitle' in runtimeMessages).toBe(false);
    expect(runtimeMessages.schemaOverviewTitle).toBeUndefined();
  });

  it('returns merged runtime and schema messages through getMessagesForLanguage', async () => {
    const { getMessagesForLanguage } = await import('../../../src/i18n');

    const pageMessages = await getMessagesForLanguage('en');

    expect(pageMessages.extensionName).toBeTypeOf('string');
    expect(pageMessages.schemaOverviewTitle).toBe('Overview');
  });

  it('loads schema-backed resources for extension-page controllers', async () => {
    vi.stubGlobal('window', { location: { protocol: 'chrome-extension:' } });
    const { createDefaultPageI18nController } = await import('../../../src/i18n');
    const bindingAdapter = createRecordingBindingAdapter();
    const controller = createDefaultPageI18nController({ bindingAdapter });

    await controller.load('en');

    const resource = controller.getCurrentResource();
    expect(resource?.messages.schemaOverviewTitle).toBe('Overview');
    expect(resource?.get('schemaOverviewTitle')).toBe('Overview');
    expect(bindingAdapter.resources.at(-1)?.messages.schemaOverviewTitle).toBe('Overview');
    controller.dispose();
  });

  it('keeps non-extension controller resources schema-free unless explicit page-message loading is used', async () => {
    vi.stubGlobal('window', { location: { protocol: 'https:' } });
    const { createDefaultPageI18nController, getMessagesForLanguage } =
      await import('../../../src/i18n');
    const bindingAdapter = createRecordingBindingAdapter();
    const controller = createDefaultPageI18nController({ bindingAdapter });

    await controller.load('en');

    const resource = controller.getCurrentResource();
    expect(resource?.messages.schemaOverviewTitle).toBeUndefined();
    expect(resource?.get('schemaOverviewTitle')).toBeUndefined();

    const pageMessages = await getMessagesForLanguage('en');
    expect(pageMessages.schemaOverviewTitle).toBe('Overview');
    controller.dispose();
  });
});
