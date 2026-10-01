import { chromium, expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('installed onboarding learns from a real selection export and keeps progress after reload', async ({
  browserName
}, testInfo) => {
  test.skip(browserName !== 'chromium', 'Installed Chromium extension test');
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(
      '<!doctype html><title>Learning fixture</title><article><h1>Keep the ideas that matter</h1><p id="excerpt">A useful note preserves both the original idea and your own understanding of it.</p><p>Keep a source link so you can find the context again. This is an ordinary article for the extension to capture.</p></article>'
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture address');
  const url = 'http://127.0.0.1:' + address.port + '/article';
  const profile = await mkdtemp(path.join(tmpdir(), 'zendio-learning-'));
  const extensionPath = path.resolve(process.env.PLAYWRIGHT_DIST_DIR ?? 'build/dist');
  let context = await chromium.launchPersistentContext(profile, {
    headless: false,
    acceptDownloads: true,
    args: [
      '--headless=new',
      '--disable-extensions-except=' + extensionPath,
      '--load-extension=' + extensionPath
    ]
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = worker.url().split('/')[2];
    await worker.evaluate(async () => {
      await chrome.storage.sync.set({ language: 'en' });
    });
    const article = await context.newPage();
    await article.goto(url);
    const guide = await context.newPage();
    await guide.goto('chrome-extension://' + extensionId + '/onboarding/index.html');
    await expect(guide.locator('.learning-count')).toContainText('0 / 6');
    await guide.locator('#learningPage').selectOption(url);
    const opened = context.waitForEvent('page');
    await guide.locator('#learningOpenPage').click();
    const practice = await opened;
    await practice.waitForLoadState();
    await expect(guide.locator('.learning-count')).toContainText('0 / 6');
    // Use the same injection and message entrypoints as the native context-menu dispatcher.
    const tabId = await worker.evaluate(async (pageUrl) => {
      const tabs = await chrome.tabs.query({ url: pageUrl });
      const tab = tabs[tabs.length - 1];
      if (tab?.id === undefined) throw new Error('Missing practice tab');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/index.js']
      });
      return tab.id;
    }, url);
    await expect(practice.locator('html')).toHaveAttribute('data-aiob-content-runtime', 'true');
    await practice.locator('#excerpt').evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    });
    await worker.evaluate(async (id) => {
      await chrome.tabs.sendMessage(id, { action: 'clipSelection', tabId: id, frameId: 0 });
    }, tabId);
    const comment = practice.locator('.clipper-comment-textarea');
    await expect(comment).toBeVisible();
    await comment.fill('My first real learning note.');
    await practice.locator('[data-action-id="clip"]').click();
    await expect(guide.locator('.learning-count')).toContainText('1 / 6', { timeout: 20_000 });
    await expect(guide.locator('#learningResult')).toContainText('Markdown downloaded');
    const actualPath = await guide.locator('.learning-path').innerText();
    const markdown = await readFile(actualPath, 'utf8');
    expect(markdown).toContain('A useful note preserves');
    expect(markdown).toContain('My first real learning note.');
    expect(markdown).toContain(url);
    await guide.reload();
    await expect(guide.locator('.learning-count')).toContainText('1 / 6');
    await guide.locator('#learningLibraryButton').click();
    await guide.locator('[data-learning-course="video"]').click();
    await guide.getByRole('button', { name: 'Try later', exact: true }).click();
    await expect(guide.locator('.learning-count')).toContainText('1 / 6');
    await expect(guide.locator('[data-learning-course="video"]')).toContainText('Saved for later');
    await guide.screenshot({ path: testInfo.outputPath('learning-desktop.png'), fullPage: true });
    await guide.setViewportSize({ width: 360, height: 800 });
    expect(
      await guide.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await guide.screenshot({ path: testInfo.outputPath('learning-mobile.png'), fullPage: true });

    for (const language of ['zh-CN', 'ja', 'de']) {
      await worker.evaluate(async (lang) => {
        await chrome.storage.sync.set({ language: lang });
      }, language);
      await guide.reload();
      await expect(guide.locator('.learning-count')).toContainText('1 / 6');
      expect(
        await guide.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      await guide.screenshot({
        path: testInfo.outputPath('learning-' + language + '.png'),
        fullPage: true
      });
    }
    await guide.emulateMedia({ colorScheme: 'dark' });
    await guide.reload();
    await expect(guide.locator('html')).toHaveAttribute('data-preview-theme', 'dark');
    await guide.screenshot({ path: testInfo.outputPath('learning-dark.png'), fullPage: true });
    await rm(actualPath, { force: true });
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      headless: false,
      args: [
        '--headless=new',
        '--disable-extensions-except=' + extensionPath,
        '--load-extension=' + extensionPath
      ]
    });
    const resumed = await context.newPage();
    await resumed.goto('chrome-extension://' + extensionId + '/onboarding/index.html');
    await expect(resumed.locator('.learning-count')).toContainText('1 / 6');
  } finally {
    await context.close();
    server.close();
    await rm(profile, { recursive: true, force: true });
  }
});
