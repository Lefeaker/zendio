import { expect, test } from '@playwright/test';
import { attachBrowserDiagnostics, persistBrowserDiagnostics } from './utils/browserDiagnostics';

const BASE = 'http://127.0.0.1:4173';

test.describe('migration harness smoke', () => {
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

  test('interaction contract harness opens the shared dialog contract', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`${BASE}/interaction-contract-harness.html`);
    await expect(page.getByText('Interaction Contract Harness')).toBeVisible();
    await page.getByRole('button', { name: 'Open dialog' }).click();
    await expect(page.locator('body')).toContainText('Interaction Contract Harness');
    expect(consoleErrors).toEqual([]);
  });

  test('content orchestrator harness loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`${BASE}/content-orchestrator-harness.html`);
    await expect(page.locator('body')).toContainText(/Clipper|Reader|Video/);
    expect(consoleErrors).toEqual([]);
  });

  test('runtime observability harness reaches ready state', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`${BASE}/runtime-observability-harness.html`);
    await expect(page.getByText('Harness ready')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});
