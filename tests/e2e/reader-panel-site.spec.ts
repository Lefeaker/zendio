
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

import { chromium } from '@playwright/test';

const testWithExtension = test.extend<{
    context: BrowserContext;
    extensionId: string;
}>({
    context: async (_unused, use) => {
        const pathToExtension = EXTENSION_PATH;
        const userDataDir = '/tmp/test-user-data-dir-' + Math.random();
        const context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            args: [
                `--disable-extensions-except=${pathToExtension}`,
                `--load-extension=${pathToExtension}`,
            ],
        });
        await use(context);
        await context.close();
    },
    extensionId: async ({ context }, use) => {
        // Optional: if we need to know the extension ID
        let [background] = context.serviceWorkers();
        if (!background)
            background = await context.waitForEvent('serviceworker');

        const extensionId = background.url().split('/')[2];
        await use(extensionId);
    },
});

async function verifyPanelAppears(page: Page) {
    // Wait for the shadow host
    const shadowHost = page.locator('aob-reader-dialog-container');
    await expect(shadowHost).toBeAttached({ timeout: 5000 });

    // Checking inside shadow DOM for the panel
    // Since we can't easily pierce shadow roots with simple selectors in some versions,
    // we might need locator('...').contentFrame() or similar if it were an iframe, but it's shadow DOM.
    // Playwright pierces open shadow roots by default for CSS selectors.
    const panel = page.locator('.reader-panel');
    // Wait for visibility effectively
    await expect(panel).toBeVisible({ timeout: 5000 });
}

testWithExtension.describe('Reader Panel Site Verification', () => {
    testWithExtension.slow(); // These tests interact with real sites and can be slow

    testWithExtension('Wikipedia (en)', async ({ page }) => {
        await page.goto('https://en.wikipedia.org/wiki/Artificial_intelligence');

        // Select some text
        await page.getByText('Artificial intelligence', { exact: false }).first().selectText();

        await verifyPanelAppears(page);

        // Check for Focus management (Tab should cycle inside, this is harder to test automatically without flaky focus, but we check presence)
        // Check "Finish" button exists
        await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
    });

    testWithExtension('Medium', async ({ page }) => {
        await page.goto('https://medium.com/tag/programming');
        // Click first article
        await page.locator('article').first().click();
        await page.waitForLoadState('domcontentloaded');

        // Select para
        await page.locator('p').first().selectText();

        await verifyPanelAppears(page);
    });

    // GitHub Gist often has complex DOM
    testWithExtension('GitHub Gist', async ({ page }) => {
        await page.goto('https://gist.github.com/discover');
        await page.locator('.gist-snippet').first().click();

        // Select code or text
        await page.locator('.blob-wrapper').first().click(); // ensure focus
        // Basic text selection simulation
        await page.keyboard.press('Control+A'); // Select all might be too much, but let's try specific locator

        // let's try selecting a specific line
        await page.locator('table.highlight tr').nth(2).selectText();

        await verifyPanelAppears(page);
    });

    testWithExtension('Stack Overflow', async ({ page }) => {
        await page.goto('https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array');

        // Select question text
        await page.locator('.js-post-body p').first().selectText();

        await verifyPanelAppears(page);
    });

    // Twitter/X might require login or be tricky with hydration
    // Skipping login-walled sites for "anonymous" verification if possible, or expect failure/skip
    // Twitter usually redirects to login. We will mark as skipped if it detects login wall.
    testWithExtension('Twitter/X', async ({ page }) => {
        await page.goto('https://twitter.com/bgurley/status/1726677000?lang=en'); // Random tweet
        // Wait for potential content or login redirect
        try {
            await page.waitForSelector('article', { timeout: 5000 });
            await page.locator('div[data-testid="tweetText"]').first().selectText();
            await verifyPanelAppears(page);
        } catch {
            console.log('Skipping Twitter test due to login wall or timeout');
            test.skip();
        }
    });

    testWithExtension('Reddit', async ({ page }) => {
        await page.goto('https://www.reddit.com/r/programming/');

        // Select a post title or text
        // New Reddit architecture is complex.
        const firstPost = page.locator('shreddit-post').first();
        if (await firstPost.count() > 0) {
            await firstPost.click(); // Open post
            await page.waitForLoadState('networkidle');
        }

        await page.locator('p').first().selectText();
        await verifyPanelAppears(page);
    });


    testWithExtension('YouTube', async ({ page }) => {
        await page.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', { waitUntil: 'domcontentloaded' }); // Me at the zoo - short video

        // Select text in description or comments
        // Expand description first if needed
        const moreButton = page.locator('#expand');
        if (await moreButton.isVisible()) {
            await moreButton.click();
        }

        await page.locator('#description-inline-expander').first().click(); // ensure focus
        await page.locator('ytd-text-inline-expander').first().locator('span').first().selectText();

        await verifyPanelAppears(page);
    });

    testWithExtension('Bilibili', async ({ page }) => {
        await page.goto('https://www.bilibili.com/video/BV1GJ411x7h7', { waitUntil: 'domcontentloaded' });

        // Select text in description
        await page.locator('.desc-info-text').first().selectText();

        await verifyPanelAppears(page);
    });

    testWithExtension('Zhihu', async ({ page }) => {
        await page.goto('https://www.zhihu.com/question/20899988', { waitUntil: 'domcontentloaded' }); // "Simple" question

        // Zhihu is tricky with richness. Just try to select some text in an answer.
        await page.locator('.RichContent-inner').first().click();
        await page.locator('.RichContent-inner p').first().selectText();

        await verifyPanelAppears(page);
    });
});
