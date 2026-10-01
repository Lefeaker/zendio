import { chromium, expect, test, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { LearningProgress } from '../../src/shared/learningProgress';

async function selectPassage(page: Page, id: string): Promise<void> {
  await page.locator(id).scrollIntoViewIfNeeded();
  const rect = await page.locator(id).evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const first = range.getClientRects()[0];
    if (!first) throw new Error('Missing text geometry');
    return { x: first.x, y: first.y, width: first.width, height: first.height };
  });
  await page.keyboard.down('Shift');
  await page.mouse.move(rect.x + 1, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + Math.min(rect.width - 2, 380), rect.y + rect.height / 2, {
    steps: 15
  });
  await page.mouse.up();
  await page.keyboard.up('Shift');
}

async function expectUncoveredControls(page: Page): Promise<void> {
  const boxes = await page.locator('.practice-coach-hint').evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    })
  );
  for (const selector of [
    '.clipper-comment-textarea',
    '[data-action-id="reader"]',
    '[data-action-id="clip"]'
  ]) {
    const control = await page.locator(selector).boundingBox();
    if (!control) throw new Error('Missing practice control');
    for (const box of boxes)
      expect(
        box.right <= control.x ||
          box.left >= control.x + control.width ||
          box.bottom <= control.y ||
          box.top >= control.y + control.height
      ).toBe(true);
  }
}

test('bundled practice uses the real Shift selection dialog and reader', async ({
  browserName
}, testInfo) => {
  test.skip(browserName !== 'chromium', 'Installed Chromium extension test');
  const profile = await mkdtemp(path.join(tmpdir(), 'zendio-practice-'));
  const extensionPath = path.resolve(process.env.PLAYWRIGHT_DIST_DIR ?? 'build/dist');
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    acceptDownloads: true,
    recordVideo: { dir: testInfo.outputPath('recording'), size: { width: 1280, height: 720 } },
    args: [
      '--headless=new',
      '--disable-extensions-except=' + extensionPath,
      '--load-extension=' + extensionPath
    ]
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = worker.url().split('/')[2];
    const guide = await context.newPage();
    await guide.goto('chrome-extension://' + extensionId + '/onboarding/index.html');
    context.on('page', (page) =>
      page.on('pageerror', (error) => console.error('[practice-page]', error.message))
    );
    await guide.locator('#learningStartPractice').click();
    await expect
      .poll(() => context.pages().some((page) => page.url().includes('/onboarding/practice.html')))
      .toBe(true);
    const practice = context
      .pages()
      .find((page) => page.url().includes('/onboarding/practice.html'));
    if (!practice) throw new Error('Missing practice page');
    console.log('[practice-video]', await practice.video()?.path());
    await expect(practice.locator('#practiceFirst')).toBeVisible();
    await expect(practice.locator('#practiceStatus')).toContainText('Hold Shift');
    await expect(practice.locator('kbd')).toHaveText('Shift');
    await expect(practice.locator('.practice-coach-hint')).toHaveCount(0);
    await practice.screenshot({ path: testInfo.outputPath('practice-layout.png') });
    await selectPassage(practice, '#practiceFirst');
    await expect(practice.locator('.clipper-comment-textarea')).toBeVisible();
    await expect(practice.locator('.practice-coach-hint')).toHaveCount(1);
    await expect(practice.locator('.practice-coach-hint').last()).toContainText(
      'No vault is configured'
    );
    await expect(practice.locator('[data-action-id="reader"]')).not.toHaveClass(/practice-coached/);
    await expect(practice.locator('[data-milestone="selected"]')).toBeAttached();
    await expect(practice.locator('[data-action-id="clip"]')).toHaveClass(/practice-coached/);
    await expectUncoveredControls(practice);
    await practice.screenshot({ path: testInfo.outputPath('practice-clipper-arrows.png') });
    await practice.locator('.clipper-comment-textarea').fill('A real guided selection.');
    await practice.locator('[data-action-id="clip"]').click();
    const readProgress = () =>
      worker.evaluate(async () => {
        const data = await chrome.storage.local.get<{ 'learningProgress.v1'?: LearningProgress }>(
          'learningProgress.v1'
        );
        return data['learningProgress.v1'];
      });
    await expect.poll(async () => (await readProgress())?.latest?.destination).toBe('downloads');
    const saved = (await readProgress())?.latest;
    if (!saved) throw new Error('Missing saved note');
    expect(saved.sourceUrl).toContain('/onboarding/practice.html');
    expect(await readFile(saved.filePath, 'utf8')).toContain('A real guided selection.');
    await expect(practice.locator('[data-milestone="saved"]')).toBeAttached();
    await expect
      .poll(async () =>
        practice
          .locator('.practice-confetti-bit')
          .first()
          .evaluate((node) =>
            node
              .getAnimations()
              .some(
                (animation) =>
                  Number(animation.currentTime) >= 150 && animation.playState === 'running'
              )
          )
      )
      .toBe(true);
    await practice.screenshot({ path: testInfo.outputPath('practice-saved-confetti.png') });
    await rm(saved.filePath, { force: true });
    await practice.reload();
    await expect(practice.locator('#practiceResult')).toBeVisible();
    await expect(practice.locator('.practice-confetti-bit')).toHaveCount(0);
    await practice.locator('#practiceNext').click();
    await expect(practice).toHaveURL(/lesson=reader/);
    await expect(practice.locator('#practiceFirst')).toBeVisible();
    await selectPassage(practice, '#practiceFirst');
    await expect(practice.locator('[data-action-id="reader"]')).toBeVisible();
    await expect(practice.locator('[data-action-id="reader"]')).toHaveClass(/practice-coached/);
    await practice.locator('[data-action-id="reader"]').click();
    await expect(practice.locator('#aiob-reader-panel')).toBeVisible();
    await expect(practice.locator('.practice-coach-hint')).toContainText('Collapse');
    await practice.locator('[data-action-id="session:toggleCollapse"]').click();
    await expect(practice.locator('#practiceStatus')).toContainText('second passage');
    await selectPassage(practice, '#practiceSecond');
    await expect(practice.locator('[data-role="highlight-item"]')).toHaveCount(2);
    await expect(practice.locator('[data-action-id="reader:finish"]')).toHaveClass(
      /practice-coached/
    );
    await practice.screenshot({ path: testInfo.outputPath('practice-reader-arrow.png') });
    await practice.locator('[data-action-id="reader:finish"]').click();
    await expect.poll(async () => (await readProgress())?.latest?.course).toBe('reader');
    const readerSaved = (await readProgress())?.latest;
    if (!readerSaved) throw new Error('Missing reader note');
    const readerMarkdown = await readFile(readerSaved.filePath, 'utf8');
    expect(readerMarkdown).toContain('A useful note');
    expect(readerMarkdown).toContain('When reading a long article');
    await expect(practice.locator('#practiceResult')).toBeVisible();
    await rm(readerSaved.filePath, { force: true });
    await worker.evaluate(async () => {
      await chrome.storage.sync.set({ language: 'zh-CN' });
    });
    await practice.setViewportSize({ width: 1280, height: 800 });
    await practice.goto(
      'chrome-extension://' + extensionId + '/onboarding/practice.html?run=zh-layout'
    );
    await expect(practice.locator('#practiceFirst')).toBeVisible();
    await practice.screenshot({ path: testInfo.outputPath('practice-layout-zh.png') });
    await practice.setViewportSize({ width: 360, height: 800 });
    await practice.goto(
      'chrome-extension://' + extensionId + '/onboarding/practice.html?run=narrow'
    );
    await expect(practice.locator('#practiceFirst')).toBeVisible();
    await practice.screenshot({
      path: testInfo.outputPath('practice-select-narrow-zh.png'),
      fullPage: true
    });
    await selectPassage(practice, '#practiceFirst');
    await expect(practice.locator('.clipper-comment-textarea')).toBeVisible();
    await practice.screenshot({ path: testInfo.outputPath('practice-popup-narrow-zh.png') });
    await expectUncoveredControls(practice);
    await practice.setViewportSize({ width: 1280, height: 800 });
    await practice.screenshot({ path: testInfo.outputPath('practice-popup-desktop-zh.png') });
    for (const language of ['de', 'ru', 'ja']) {
      await worker.evaluate(async (lang) => {
        await chrome.storage.sync.set({ language: lang });
      }, language);
      await practice.setViewportSize({ width: 360, height: 800 });
      await practice.goto(
        'chrome-extension://' + extensionId + '/onboarding/practice.html?run=' + language
      );
      await expect(practice.locator('#practiceFirst')).toBeVisible();
      await selectPassage(practice, '#practiceFirst');
      await expect(practice.locator('.practice-coach-hint')).toHaveCount(1);
      await expectUncoveredControls(practice);
      expect(
        await practice.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      ).toBe(true);
      await practice.screenshot({
        path: testInfo.outputPath('practice-popup-' + language + '.png')
      });
    }
    await practice.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await practice.setViewportSize({ width: 1280, height: 800 });
    await worker.evaluate(async () => {
      await chrome.storage.sync.set({ language: 'zh-CN' });
    });
    await practice.goto(
      'chrome-extension://' + extensionId + '/onboarding/practice.html?run=reduced'
    );
    await expect(practice.locator('html')).toHaveAttribute('data-preview-theme', 'dark');
    await expect(practice.locator('#practiceFirst')).toBeVisible();
    await practice.screenshot({ path: testInfo.outputPath('practice-dark-zh.png') });
    await selectPassage(practice, '#practiceFirst');
    await expect(practice.locator('.practice-coach-hint')).toHaveCount(1);
    await expect(practice.locator('.practice-confetti-bit')).toHaveCount(0);
    await practice.screenshot({ path: testInfo.outputPath('practice-popup-dark-zh.png') });
    await practice.locator('.practice-coach-exit').click();
    await expect(practice).toHaveURL(/onboarding\/index.html$/);
    await expect(practice.locator('#practiceCoach')).toHaveCount(0);
    expect((await readProgress())?.latest?.operationId).toBe(readerSaved.operationId);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

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
    await guide.locator('.learning-custom-page summary').click();
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
