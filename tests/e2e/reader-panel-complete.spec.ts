import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

// Test result collector
interface TestResult {
    site: string;
    url: string;
    passed: boolean;
    checks: {
        panelAppears: boolean;
        focusManagement: boolean;
        styleIsolation: boolean;
        highlightList: boolean;
        exportFlow: boolean;
    };
    errors: string[];
    screenshotPath?: string;
}

const testResults: TestResult[] = [];

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

// Custom Fixture - Load extension
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
                `--load-extension=${EXTENSION_PATH}`,
            ],
        });
        await use(context);
        await context.close();
    },
    extensionId: async ({ context }, use) => {
        let [background] = context.serviceWorkers();
        if (!background)
            background = await context.waitForEvent('serviceworker');
        const extensionId = background.url().split('/')[2];
        await use(extensionId);
    },
});

// Helper: Activate Reader Panel
async function activateReaderPanel(page: Page) {
    await page.waitForTimeout(500);
}

// Helper: Verify Panel appears
async function verifyPanelAppears(page: Page): Promise<boolean> {
    try {
        const shadowHost = page.locator('aob-reader-dialog-container');
        await expect(shadowHost).toBeAttached({ timeout: 5000 });
        const panel = page.locator('.reader-panel');
        await expect(panel).toBeVisible({ timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

// Helper: Verify focus management
async function verifyFocusManagement(page: Page): Promise<boolean> {
    try {
        const finishBtn = page.getByRole('button', { name: /Finish/ });
        await finishBtn.focus();
        await expect(finishBtn).toBeFocused();
        
        const cancelBtn = page.getByRole('button', { name: /Cancel/ });
        await cancelBtn.focus();
        await expect(cancelBtn).toBeFocused();
        
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        
        return true;
    } catch {
        return false;
    }
}

// Helper: Verify style isolation
async function verifyStyleIsolation(page: Page): Promise<boolean> {
    try {
        const hasDaisyStyles = await page.evaluate(() => {
            const host = document.querySelector('aob-reader-dialog-container');
            if (!host || !host.shadowRoot) return false;
            const modal = host.shadowRoot.querySelector('.modal');
            const modalBox = host.shadowRoot.querySelector('.modal-box');
            return !!(modal && modalBox);
        });
        return hasDaisyStyles;
    } catch {
        return false;
    }
}

// Helper: Take screenshot
async function takeScreenshot(page: Page, site: string, testName: string): Promise<string> {
    const screenshotDir = path.join(__dirname, '../../test-results/screenshots');
    if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
    }
    
    const filename = `${site.replace(/[^a-z0-9]/gi, '_')}_${testName}_${Date.now()}.png`;
    const filepath = path.join(screenshotDir, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    return filepath;
}

// Helper: Record test result
function recordResult(
    site: string, 
    url: string, 
    passed: boolean, 
    checks: TestResult['checks'], 
    errors: string[] = [],
    screenshotPath?: string
) {
    testResults.push({ site, url, passed, checks, errors, screenshotPath });
}

// Test Suite
testWithExtension.describe('Reader Panel Site Verification - Complete', () => {
    testWithExtension.slow();
    testWithExtension.setTimeout(120000);

    // 1. Wikipedia
    testWithExtension('Wikipedia (en)', async ({ page }) => {
        const site = 'Wikipedia';
        const url = 'https://en.wikipedia.org/wiki/Artificial_intelligence';
        const checks = {
            panelAppears: false,
            focusManagement: false,
            styleIsolation: false,
            highlightList: false,
            exportFlow: false
        };
        const errors: string[] = [];
        
        try {
            await page.goto(url, { waitUntil: 'networkidle' });
            await activateReaderPanel(page);
            
            await page.getByText('Artificial intelligence', { exact: false }).first().selectText();
            await page.waitForTimeout(500);
            
            checks.panelAppears = await verifyPanelAppears(page);
            checks.styleIsolation = await verifyStyleIsolation(page);
            
            const finishBtn = page.getByRole('button', { name: /Finish/ });
            checks.exportFlow = await finishBtn.isVisible().catch(() => false);
            checks.focusManagement = await verifyFocusManagement(page);
            
        } catch (e: unknown) {
            errors.push(`Error: ${getErrorMessage(e)}`);
        }
        
        const screenshot = await takeScreenshot(page, site, 'test');
        recordResult(site, url, errors.length === 0, checks, errors, screenshot);
        expect(checks.panelAppears).toBe(true);
    });

    // 2. Medium
    testWithExtension('Medium', async ({ page }) => {
        const site = 'Medium';
        const url = 'https://medium.com/tag/programming';
        const checks = {
            panelAppears: false,
            focusManagement: false,
            styleIsolation: false,
            highlightList: false,
            exportFlow: false
        };
        const errors: string[] = [];
        
        try {
            await page.goto(url, { waitUntil: 'networkidle' });
            await page.locator('article').first().click();
            await page.waitForLoadState('domcontentloaded');
            await activateReaderPanel(page);
            
            await page.locator('p').first().selectText();
            checks.panelAppears = await verifyPanelAppears(page);
            checks.styleIsolation = await verifyStyleIsolation(page);
            
        } catch (e: unknown) {
            errors.push(`Error: ${getErrorMessage(e)}`);
        }
        
        const screenshot = await takeScreenshot(page, site, 'test');
        recordResult(site, url, errors.length === 0, checks, errors, screenshot);
        expect(checks.panelAppears).toBe(true);
    });

    // 3. GitHub Gist
    testWithExtension('GitHub Gist', async ({ page }) => {
        const site = 'GitHub Gist';
        const url = 'https://gist.github.com/discover';
        const checks = {
            panelAppears: false,
            focusManagement: false,
            styleIsolation: false,
            highlightList: false,
            exportFlow: false
        };
        const errors: string[] = [];
        
        try {
            await page.goto(url, { waitUntil: 'networkidle' });
            await page.locator('.gist-snippet').first().click();
            await activateReaderPanel(page);
            
            await page.locator('table.highlight tr').nth(2).selectText();
            checks.panelAppears = await verifyPanelAppears(page);
            checks.styleIsolation = await verifyStyleIsolation(page);
            
        } catch (e: unknown) {
            errors.push(`Error: ${getErrorMessage(e)}`);
        }
        
        const screenshot = await takeScreenshot(page, site, 'test');
        recordResult(site, url, errors.length === 0, checks, errors, screenshot);
        expect(checks.panelAppears).toBe(true);
    });

    // 4. Stack Overflow
    testWithExtension('Stack Overflow', async ({ page }) => {
        const site = 'Stack Overflow';
        const url = 'https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array';
        const checks = {
            panelAppears: false,
            focusManagement: false,
            styleIsolation: false,
            highlightList: false,
            exportFlow: false
        };
        const errors: string[] = [];
        
        try {
            await page.goto(url, { waitUntil: 'networkidle' });
            await activateReaderPanel(page);
            
            await page.locator('.js-post-body p').first().selectText();
            checks.panelAppears = await verifyPanelAppears(page);
            checks.styleIsolation = await verifyStyleIsolation(page);
            
        } catch (e: unknown) {
            errors.push(`Error: ${getErrorMessage(e)}`);
        }
        
        const screenshot = await takeScreenshot(page, site, 'test');
        recordResult(site, url, errors.length === 0, checks, errors, screenshot);
        expect(checks.panelAppears).toBe(true);
    });

    // 5. Twitter/X
    testWithExtension('Twitter/X', async ({ page }) => {
        const site = 'Twitter/X';
        const url = 'https://twitter.com/elonmusk/status/1234567890';
        const checks = {
            panelAppears: false,
            focusManagement: false,
            styleIsolation: false,
            highlightList: false,
            exportFlow: false
        };
        const errors: string[] = [];
        
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            
            // Skip if login wall detected
            const hasLoginWall = await page.locator('text=/log in|sign in/i').first().isVisible().catch(() => false);
            if (hasLoginWall) {
                test.skip();
                return;
            }
            
            await page.waitForSelector('article', { timeout: 5000 });
            await activateReaderPanel(page);
            
            await page.locator('div[data-testid="tweetText"]').first().selectText();
            checks.panelAppears = await verifyPanelAppears(page);
            checks.styleIsolation = await verifyStyleIsolation(page);
            
        } catch (e: unknown) {
            errors.push(`Error: ${getErrorMessage(e)}`);
        }
        
        const screenshot = await takeScreenshot(page, site, 'test');
        recordResult(site, url, errors.length === 0, checks, errors, screenshot);
    });

    // 6. Reddit
    testWithExtension('Reddit', async ({ page }) => {
        const site = 'Reddit';
        const url = 'https://www.reddit.com/r/programming/';
        const checks = {
            panelAppears: false,
            focusManagement: false,
            styleIsolation: false,
            highlightList: false,
            exportFlow: false
        };
        const errors: string[] = [];
        
        try {
            await page.goto(url, { waitUntil: 'networkidle' });
            await activateReaderPanel(page);
            
            const firstPost = page.locator('shreddit-post').first();
            if (await firstPost.count() > 0) {
                await firstPost.click();
                await page.waitForLoadState('networkidle');
            }
            
            await page.locator('p').first().selectText();
            checks.panelAppears = await verifyPanelAppears(page);
            checks.styleIsolation = await verifyStyleIsolation(page);
            
        } catch (e: unknown) {
            errors.push(`Error: ${getErrorMessage(e)}`);
        }
        
        const screenshot = await takeScreenshot(page, site, 'test');
        recordResult(site, url, errors.length === 0, checks, errors, screenshot);
        expect(checks.panelAppears).toBe(true);
    });

    // 7. YouTube
    testWithExtension('YouTube', async ({ page }) => {
        const site = 'YouTube';
        const url = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
        const checks = {
            panelAppears: false,
            focusManagement: false,
            styleIsolation: false,
            highlightList: false,
            exportFlow: false
        };
        const errors: string[] = [];
        
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await activateReaderPanel(page);
            
            const moreButton = page.locator('#expand');
            if (await moreButton.isVisible()) {
                await moreButton.click();
            }
            
            await page.locator('#description-inline-expander').first().click();
            await page.locator('ytd-text-inline-expander').first().locator('span').first().selectText();
            
            checks.panelAppears = await verifyPanelAppears(page);
            checks.styleIsolation = await verifyStyleIsolation(page);
            
        } catch (e: unknown) {
            errors.push(`Error: ${getErrorMessage(e)}`);
        }
        
        const screenshot = await takeScreenshot(page, site, 'test');
        recordResult(site, url, errors.length === 0, checks, errors, screenshot);
        expect(checks.panelAppears).toBe(true);
    });

    // 8. Bilibili
    testWithExtension('Bilibili', async ({ page }) => {
        const site = 'Bilibili';
        const url = 'https://www.bilibili.com/video/BV1GJ411x7h7';
        const checks = {
            panelAppears: false,
            focusManagement: false,
            styleIsolation: false,
            highlightList: false,
            exportFlow: false
        };
        const errors: string[] = [];
        
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await activateReaderPanel(page);
            
            await page.locator('.desc-info-text').first().selectText();
            checks.panelAppears = await verifyPanelAppears(page);
            checks.styleIsolation = await verifyStyleIsolation(page);
            
        } catch (e: unknown) {
            errors.push(`Error: ${getErrorMessage(e)}`);
        }
        
        const screenshot = await takeScreenshot(page, site, 'test');
        recordResult(site, url, errors.length === 0, checks, errors, screenshot);
        expect(checks.panelAppears).toBe(true);
    });

    // 9. Zhihu
    testWithExtension('Zhihu', async ({ page }) => {
        const site = 'Zhihu';
        const url = 'https://www.zhihu.com/question/20899988';
        const checks = {
            panelAppears: false,
            focusManagement: false,
            styleIsolation: false,
            highlightList: false,
            exportFlow: false
        };
        const errors: string[] = [];
        
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await activateReaderPanel(page);
            
            await page.locator('.RichContent-inner').first().click();
            await page.locator('.RichContent-inner p').first().selectText();
            
            checks.panelAppears = await verifyPanelAppears(page);
            checks.styleIsolation = await verifyStyleIsolation(page);
            
        } catch (e: unknown) {
            errors.push(`Error: ${getErrorMessage(e)}`);
        }
        
        const screenshot = await takeScreenshot(page, site, 'test');
        recordResult(site, url, errors.length === 0, checks, errors, screenshot);
        expect(checks.panelAppears).toBe(true);
    });

    // 10. WeChat MP
    testWithExtension('WeChat MP', ({ page: _page }) => {
        const site = 'WeChat MP';
        const url = 'https://mp.weixin.qq.com/s/example';
        const checks = {
            panelAppears: false,
            focusManagement: false,
            styleIsolation: false,
            highlightList: false,
            exportFlow: false
        };
        const errors: string[] = [];
        
        // Note: WeChat MP requires specific article URLs
        test.skip();
        
        recordResult(site, url, true, checks, errors);
    });

    // 11. Notion
    testWithExtension('Notion', ({ page: _page }) => {
        const site = 'Notion';
        const url = 'https://www.notion.so/example';
        const checks = {
            panelAppears: false,
            focusManagement: false,
            styleIsolation: false,
            highlightList: false,
            exportFlow: false
        };
        const errors: string[] = [];
        
        // Note: Notion requires login
        test.skip();
        
        recordResult(site, url, true, checks, errors);
    });

    // Generate report after all tests
    testWithExtension.afterAll(() => {
        const reportDir = path.join(__dirname, '../../test-results');
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = path.join(reportDir, `reader-panel-test-report-${timestamp}.md`);

        let report = `# Reader Panel DaisyDialog 测试报告\n\n`;
        report += `生成时间: ${new Date().toLocaleString()}\n\n`;
        report += `## 测试汇总\n\n`;
        report += `- 总站点数: ${testResults.length}\n`;
        report += `- 通过: ${testResults.filter(r => r.passed).length}\n`;
        report += `- 失败: ${testResults.filter(r => !r.passed).length}\n\n`;
        
        report += `| 站点 | 状态 | Panel | 样式 | 焦点 | 导出 | 错误 | 截图 |\n`;
        report += `|------|------|-------|------|------|------|------|------|\n`;
        
        for (const result of testResults) {
            const status = result.passed ? '✅' : '❌';
            const panel = result.checks.panelAppears ? '✅' : '❌';
            const style = result.checks.styleIsolation ? '✅' : '❌';
            const focus = result.checks.focusManagement ? '✅' : '❌';
            const export_ = result.checks.exportFlow ? '✅' : '❌';
            const errors = result.errors.length > 0 ? result.errors.join('; ') : '-';
            const screenshot = result.screenshotPath ? `[截图](${result.screenshotPath})` : '-';
            
            report += `| ${result.site} | ${status} | ${panel} | ${style} | ${focus} | ${export_} | ${errors} | ${screenshot} |\n`;
        }
        
        report += `\n## 详细结果\n\n`;
        
        for (const result of testResults) {
            report += `### ${result.site}\n\n`;
            report += `- URL: ${result.url}\n`;
            report += `- 状态: ${result.passed ? '通过' : '失败'}\n`;
            report += `- Panel 出现: ${result.checks.panelAppears ? '✅' : '❌'}\n`;
            report += `- 样式隔离: ${result.checks.styleIsolation ? '✅' : '❌'}\n`;
            report += `- 焦点管理: ${result.checks.focusManagement ? '✅' : '❌'}\n`;
            report += `- 导出流程: ${result.checks.exportFlow ? '✅' : '❌'}\n`;
            if (result.errors.length > 0) {
                report += `- 错误: ${result.errors.join('\n  - ')}\n`;
            }
            if (result.screenshotPath) {
                report += `- 截图: ${result.screenshotPath}\n`;
            }
            report += `\n`;
        }

        fs.writeFileSync(reportPath, report);
        console.log(`\n✅ 测试报告已生成: ${reportPath}\n`);
    });
});
