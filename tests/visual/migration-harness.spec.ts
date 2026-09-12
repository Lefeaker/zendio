import { expect, test } from '@playwright/test';
import { attachBrowserDiagnostics, persistBrowserDiagnostics } from './utils/browserDiagnostics';

const BASE = `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '4181'}`;

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

  test('interaction contract harness executes retained primitive and dialog semantics', async ({
    page
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`${BASE}/interaction-contract-harness.html`);
    await expect(page.getByText('Interaction Contract Harness')).toBeVisible();

    const loadingDanger = page.locator('[data-contract-role="loading-danger-button"]');
    await expect(loadingDanger).toHaveClass(/btn-danger/u);
    await expect(loadingDanger).toHaveClass(/loading/u);
    await expect(loadingDanger).toHaveAttribute('aria-busy', 'true');
    await expect(loadingDanger).toBeDisabled();

    const requiredInput = page.getByRole('textbox', { name: 'Required contract value' });
    await expect(requiredInput).toHaveAttribute('aria-invalid', 'true');
    await requiredInput.fill('valid value');
    await expect(requiredInput).not.toHaveAttribute('aria-invalid', 'true');

    const confirmation = page.getByRole('checkbox', { name: 'Require confirmation' });
    await expect(confirmation).toHaveAttribute('aria-invalid', 'true');
    await confirmation.check();
    await expect(confirmation).toBeChecked();
    await expect(confirmation).not.toHaveAttribute('aria-invalid', 'true');

    await page.getByRole('button', { name: 'Open dialog' }).click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toContainText('Contract dialog');
    await dialog.getByRole('button', { name: 'Dismiss' }).click();
    await expect(dialog).toHaveCount(0);
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
