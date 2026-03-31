import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachBrowserDiagnostics, persistBrowserDiagnostics } from './utils/browserDiagnostics';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedHtml: string | null = null;

async function getHarnessHtml(): Promise<string> {
  if (cachedHtml) {
    return cachedHtml;
  }

  const result = await build({
    entryPoints: [path.join(__dirname, 'utils/yamlConfigHarness.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    sourcemap: false
  });

  const script = result.outputFiles[0]?.text ?? '';
  const encoded = Buffer.from(script, 'utf-8').toString('base64');

  cachedHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>YAML Config Harness</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 16px; }
      #yamlConfigTable, #yamlDomainOverrides { margin-top: 16px; }
      .aobx-table__row { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 8px; padding: 8px 0; border-bottom: 1px solid #ddd; }
      .aobx-table__cell, .aobx-table__actions { display: flex; flex-direction: column; gap: 4px; }
      .aobx-domain__card { border: 1px solid #ccc; border-radius: 8px; padding: 12px; margin-top: 12px; }
      button { cursor: pointer; }
    </style>
  </head>
  <body>
    <button id="yamlAddFieldBtn" type="button">Add Custom Field</button>
    <div id="yamlConfigTable"></div>
    <div id="yamlDomainOverrides"></div>
    <script type="module" src="data:text/javascript;base64,${encoded}"></script>
  </body>
</html>`;

  return cachedHtml;
}

async function mountHarness(page: Page): Promise<void> {
  const html = await getHarnessHtml();
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForSelector('#yamlConfigTable', { state: 'attached' });
  await page.evaluate(() => {
    window.yamlTest.resetAutoSave();
    window.yamlTest.mount();
  });
  await page.waitForSelector('.aobx-table__row');
}

async function triggerFirstMatchingClick(page: Page, selector: string): Promise<void> {
  await page.evaluate((target) => {
    const element = document.querySelector<HTMLElement>(target);
    if (!element) {
      throw new Error(`Element not found: ${target}`);
    }
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, selector);
}

test.describe('YAML configuration browser interactions', () => {
  let diagnostics: ReturnType<typeof attachBrowserDiagnostics> | null = null;

  test.beforeEach(({ page }) => {
    diagnostics = attachBrowserDiagnostics(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (diagnostics) {
      await persistBrowserDiagnostics(page, testInfo, diagnostics);
    }
    diagnostics = null;
  });

  test('manages domain overrides with array previews', async ({ page }) => {
    await mountHarness(page);

    await page.locator('.aobx-domain__add-btn').click();

    const card = page.locator('.aobx-domain__card').first();
    await expect(card).toBeVisible();

    await card.locator('.aobx-domain__domain-input').fill('example.com');
    await card.locator('.aobx-domain__type-select').selectOption('article');

    await triggerFirstMatchingClick(page, '.aobx-domain__card .aobx-domain__add-field-btn');
    const tagsField = card.locator('.aobx-domain__field').nth(0);
    await expect(card.locator('.aobx-domain__field')).toHaveCount(1);
    await expect(tagsField.locator('.aobx-domain__field-select')).toBeVisible();
    await tagsField.locator('.aobx-domain__field-select').selectOption('tags');

    const tagsInput = tagsField.locator('input.aobx-table__array-input');
    await tagsInput.fill('alpha; beta; gamma');
    await tagsInput.blur();
    await expect(tagsInput).toHaveValue('alpha; beta; gamma');

    await triggerFirstMatchingClick(page, '.aobx-domain__card .aobx-domain__add-field-btn');
    const authorField = card.locator('.aobx-domain__field').nth(1);
    await expect(card.locator('.aobx-domain__field')).toHaveCount(2);
    await expect(authorField.locator('.aobx-domain__field-select')).toBeVisible();
    await authorField.locator('.aobx-domain__field-select').selectOption('author');

    const enabledToggle = authorField.locator('.aobx-domain__field-enabled input[type="checkbox"]');
    await enabledToggle.check();

    const authorInput = authorField.locator('.aobx-domain__field-body input.aobx-input').first();
    await authorInput.fill('Guest Author');
    await authorInput.blur();

    const valuePathInput = authorField.locator('.aobx-domain__value-path-input');
    await valuePathInput.fill('meta.author');
    await valuePathInput.blur();

    const overrides = await page.evaluate(() => window.yamlTest.collect());
    const domainOverrides = overrides?.contentTypes?.article?.domainOverrides?.['example.com'];
    expect(domainOverrides).toBeTruthy();
    if (!domainOverrides) {
      throw new Error('Domain overrides missing for example.com');
    }
    const rules = domainOverrides;
    expect(rules[0]).toMatchObject({
      name: 'tags',
      defaultValue: ['alpha', 'beta', 'gamma'],
      enabled: true
    });
    expect(rules[1]).toMatchObject({
      name: 'author',
      defaultValue: 'Guest Author',
      valuePath: 'meta.author',
      enabled: true
    });

    const autoSaves = await page.evaluate(() => window.yamlTest.autoSaveEvents());
    expect(autoSaves).toContain('yamlConfig');
  });
});
