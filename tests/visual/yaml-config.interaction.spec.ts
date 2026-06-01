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
      #yamlEditorHost { margin-top: 16px; }
      .stitch-yaml-config-table { overflow-x: auto; }
      .stitch-yaml-domain-rule { border: 1px solid #ccc; border-radius: 8px; padding: 12px; margin-top: 12px; }
      .yaml-rule-meta, .yaml-domain-field-row, .stitch-yaml-actions { display: flex; gap: 8px; margin-top: 8px; }
      button { cursor: pointer; }
    </style>
  </head>
  <body>
    <section id="yamlHarnessRoot">
      <div id="yamlEditorHost"></div>
    </section>
    <script type="module" src="data:text/javascript;base64,${encoded}"></script>
  </body>
</html>`;

  return cachedHtml;
}

async function mountHarness(page: Page): Promise<void> {
  const html = await getHarnessHtml();
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForSelector('#yamlEditorHost', { state: 'attached' });
  await page.evaluate(() => {
    window.yamlTest.resetAutoSave();
    window.yamlTest.mount();
  });
  await page.waitForSelector('[data-stitch-widget="yaml-config"]');
  await page.waitForSelector('.stitch-yaml-config-table tbody tr');
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

    await page.locator('.stitch-yaml-actions button', { hasText: '+ Add domain rule' }).click();

    const card = page.locator('.stitch-yaml-domain-rule').first();
    await expect(card).toBeVisible();

    await card.locator('input[data-yaml-domain="domain"]').fill('example.com');
    await card.locator('.yaml-rule-meta select').selectOption('article');

    const tagsField = card.locator('.yaml-domain-field-row').nth(0);
    await expect(card.locator('.yaml-domain-field-row')).toHaveCount(1);
    await expect(tagsField.locator('select[data-yaml-domain-field="name"]')).toBeVisible();
    await tagsField.locator('select[data-yaml-domain-field="name"]').selectOption('tags');

    const tagsInput = tagsField.locator('input[data-yaml-domain-field="defaultValue"]');
    await tagsInput.fill('alpha; beta; gamma');
    await tagsInput.blur();
    await expect(tagsInput).toHaveValue('alpha; beta; gamma');

    await card.locator('button', { hasText: '+ Add field' }).click();
    const authorField = card.locator('.yaml-domain-field-row').nth(1);
    await expect(card.locator('.yaml-domain-field-row')).toHaveCount(2);
    await expect(authorField.locator('select[data-yaml-domain-field="name"]')).toBeVisible();
    await authorField.locator('select[data-yaml-domain-field="name"]').selectOption('author');

    const enabledToggle = authorField.locator('input[data-yaml-domain-field="enabled"]');
    await enabledToggle.check();

    const authorInput = authorField.locator('input[data-yaml-domain-field="defaultValue"]');
    await authorInput.fill('Guest Author');
    await authorInput.blur();

    const valuePathInput = authorField.locator('input[data-yaml-domain-field="valuePath"]');
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
