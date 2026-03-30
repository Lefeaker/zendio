import { expect, test } from '@playwright/test';
import type { Language } from '../../src/i18n/locales';
import { renderOptionsLanguageCanvas } from './utils/optionsLanguageRenderer';

const LANGUAGES: Language[] = [
  'en',
  'de',
  'fr',
  'ru',
  'pt-BR',
  'es-ES',
  'ja',
  'zh-CN',
  'ko',
  'qps-ploc'
];

test.describe('options language section visual regression', () => {
  for (const language of LANGUAGES) {
    test(`renders language card - ${language}`, async ({ page }, testInfo) => {
      const viewport = page.viewportSize();
      const viewportWidth =
        viewport?.width ??
        (typeof testInfo.project.use?.viewport?.width === 'number'
          ? testInfo.project.use.viewport.width
          : 1280);

      const html = await renderOptionsLanguageCanvas(language, viewportWidth);
      await page.setContent(html, { waitUntil: 'load' });
      await page.waitForTimeout(200);

      await expect(page).toHaveScreenshot(`options-language-${language}.png`);
    });
  }
});
