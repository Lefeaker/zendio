import { describe, it, expect, afterEach } from 'vitest';
import { createDefaultPageI18nController } from '../../src/i18n';
import type { PageI18nController } from '../../src/i18n';
import { messages } from '../../src/i18n/locales';
import { resolveLanguage } from '../../src/i18n/config';
import { setOptionsI18nContext } from '../../src/options/app/i18nContext';
import { e2ePlatformHarness } from './setup';
import { withDomEnvironment } from '../utils/domEnvironment';

interface RenderResult {
  resolvedLanguage: string | null;
  labels: {
    languageSettings: string | null;
    saveButton: string | null;
    diagnoseButton: string | null;
  };
}

const TEMPLATE_HTML = `
  <!DOCTYPE html>
  <html lang="en">
    <body>
      <main>
        <h2 id="language-settings" data-i18n="languageSettings"></h2>
        <button class="btn-save" data-i18n="saveButton"></button>
        <button class="btn-diagnose" data-i18n="diagnoseButton"></button>
      </main>
    </body>
  </html>
`;

async function renderWithLanguage(language: string): Promise<RenderResult> {
  await e2ePlatformHarness.storage.sync.set('language', language);

  return withDomEnvironment(
    TEMPLATE_HTML,
    {
      url: 'https://options.test/',
      globals: ['document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'Node']
    },
    async ({ window }) => {
      const controller: PageI18nController = createDefaultPageI18nController();
      try {
        await controller.load();
        controller.mount(window.document);
        setOptionsI18nContext(controller.getBinder(), controller.getCurrentResource());

        const resource = controller.getCurrentResource();
        return {
          resolvedLanguage: resource?.language ?? null,
          labels: {
            languageSettings: window.document.getElementById('language-settings')?.textContent?.trim() ?? null,
            saveButton: window.document.querySelector('.btn-save')?.textContent?.trim() ?? null,
            diagnoseButton: window.document.querySelector('.btn-diagnose')?.textContent?.trim() ?? null
          }
        };
      } finally {
        controller.dispose();
        setOptionsI18nContext(null, null);
      }
    }
  );
}

describe('i18n multilingual expansion e2e', () => {
  afterEach(async () => {
    await e2ePlatformHarness.storage.sync.clear();
  });

  const scenarioMatrix = [
    { input: 'es-MX', expected: 'es-419' },
    { input: 'es-ES', expected: 'es-ES' },
    { input: 'ko', expected: 'ko' }
  ] as const;

  it.each(scenarioMatrix)('renders translated strings for $input', async ({ input, expected }) => {
    const result = await renderWithLanguage(input);
    expect(result.resolvedLanguage).toBe(expected);

    const translated = messages[expected];
    expect(result.labels.languageSettings).toBe(translated.languageSettings);
    expect(result.labels.saveButton).toBe(translated.saveButton);
    expect(result.labels.diagnoseButton).toBe(translated.diagnoseButton);
  });

  it('falls back to default language when locale is unsupported', async () => {
    const result = await renderWithLanguage('xx-YY');
    const defaultLanguage = resolveLanguage('xx-YY');
    expect(defaultLanguage).toBe('en');
    expect(result.resolvedLanguage).toBe('en');

    const translated = messages.en;
    expect(result.labels.languageSettings).toBe(translated.languageSettings);
    expect(result.labels.saveButton).toBe(translated.saveButton);
    expect(result.labels.diagnoseButton).toBe(translated.diagnoseButton);
  });
});
