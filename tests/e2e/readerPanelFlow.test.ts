import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

const DEFAULT_URL = 'https://en.wikipedia.org/wiki/Artificial_intelligence';

type ReaderPanelGlobals = typeof globalThis & {
    __aiobReaderActive?: boolean;
};

const testWithExtension = test.extend<{
    context: BrowserContext;
    extensionId: string;
}>({
    context: async (_unused, use) => {
        const userDataDir = '/tmp/test-user-data-dir-' + Math.random();
        const context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            args: [
                `--disable-extensions-except=${EXTENSION_PATH}`,
                `--load-extension=${EXTENSION_PATH}`
            ]
        });
        await use(context);
        await context.close();
    },
    extensionId: async ({ context }, use) => {
        let [background] = context.serviceWorkers();
        if (!background) {
            background = await context.waitForEvent('serviceworker');
        }
        const extensionId = background.url().split('/')[2];
        await use(extensionId);
    }
});

async function openReaderDialogFromSelection(page: Page): Promise<void> {
    await page.goto(DEFAULT_URL, { waitUntil: 'domcontentloaded' });

    await page.locator('p').first().selectText();

    const clipperDialog = page.locator('#obsidian-clipper-dialog');
    await expect(clipperDialog).toBeAttached({ timeout: 8000 });

    const readerAction = page.getByRole('button', { name: /open reader|add to reader|打开阅读|添加到阅读/i });
    await expect(readerAction).toBeVisible({ timeout: 8000 });
    await readerAction.click();

    const dialogTitle = page.locator('[data-role="dialog-title"]');
    await expect(dialogTitle).toBeVisible({ timeout: 8000 });
}

async function waitForDialogClosed(page: Page): Promise<void> {
    await page.waitForFunction(() => {
        const isReaderActive = (window as ReaderPanelGlobals).__aiobReaderActive === true;
        const hasDialog = Array.from(document.querySelectorAll('div')).some((el) =>
            Boolean(el.shadowRoot?.querySelector('[data-role="dialog-title"]'))
        );
        return !isReaderActive || !hasDialog;
    }, null, { timeout: 10000 });
}

testWithExtension.describe('Reader Panel E2E Flow', () => {
    testWithExtension.slow();
    testWithExtension.setTimeout(60000);

    testWithExtension('opens Reader Dialog and renders highlights', async ({ page }) => {
        await openReaderDialogFromSelection(page);

        const highlightItem = page.locator('[data-role="highlight-item"]').first();
        await expect(highlightItem).toBeVisible({ timeout: 8000 });

        const exportBtn = page.locator('[data-role="export-btn"]');
        await expect(exportBtn).toBeVisible();
    });

    testWithExtension('exports highlights and closes dialog', async ({ page }) => {
        await openReaderDialogFromSelection(page);

        const exportBtn = page.locator('[data-role="export-btn"]');
        await exportBtn.click();

        await waitForDialogClosed(page);
    });

    testWithExtension('supports keyboard navigation and escape to close', async ({ page }) => {
        await openReaderDialogFromSelection(page);

        const exportBtn = page.locator('[data-role="export-btn"]');
        await exportBtn.focus();
        await expect(exportBtn).toBeFocused();

        await page.keyboard.press('Tab');
        const closeBtn = page.locator('[data-role="close-btn"]');
        await expect(closeBtn).toBeFocused();

        await page.keyboard.press('Escape');
        await waitForDialogClosed(page);
    });
});
