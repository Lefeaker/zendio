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

async function expectUncoveredControls(
  page: Page,
  selectors = ['.clipper-comment-textarea', '[data-action-id="reader"]', '[data-action-id="clip"]']
): Promise<void> {
  const boxes = await page.locator('.practice-coach-hint').evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    })
  );
  for (const selector of selectors) {
    const control = await page.locator(selector).first().boundingBox();
    if (!control) throw new Error('Missing practice control');
    for (const box of boxes)
      expect(
        box.right <= control.x ||
          box.left >= control.x + control.width ||
          box.bottom <= control.y ||
          box.top >= control.y + control.height,
        selector + JSON.stringify({ box, control })
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
    await expect(practice.locator('#practiceStatus')).toContainText('final passage');
    await practice.mouse.wheel(0, 2000);
    await selectPassage(practice, '#practiceSecond');
    await expect(practice.locator('[data-role="highlight-item"]')).toHaveCount(2);
    const bottomScroll = await practice.evaluate(() => scrollY);
    expect(bottomScroll).toBeGreaterThan(500);
    await expect(practice.locator('#practiceStatus')).toContainText('Click number 1');
    await practice.locator('.session-item-marker-index').first().click();
    await expect.poll(() => practice.evaluate(() => scrollY)).toBeLessThan(bottomScroll - 300);
    await expect(practice.locator('#practiceStatus')).toContainText('Click number 2');
    await practice.screenshot({ path: testInfo.outputPath('reader-jump-first.png') });
    await practice.locator('.session-item-marker-index').last().click();
    await expect.poll(() => practice.evaluate(() => scrollY)).toBeGreaterThan(500);
    await practice.screenshot({ path: testInfo.outputPath('reader-jump-last.png') });

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

test('bundled video practice uses real timestamps screenshots and export', async ({
  browserName
}, testInfo) => {
  test.skip(browserName !== 'chromium');
  const profile = await mkdtemp(path.join(tmpdir(), 'zendio-video-practice-'));
  const extensionPath = path.resolve(process.env.PLAYWRIGHT_DIST_DIR ?? 'build/dist');
  const context = await chromium.launchPersistentContext(profile, {
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
    const id = worker.url().split('/')[2];
    const page = await context.newPage();
    page.on('pageerror', (error) => console.error('[video-practice]', error.message));
    await page.goto(
      'chrome-extension://' + id + '/onboarding/practice.html?lesson=video&run=video-test'
    );
    const video = page.locator('#practiceVideo');
    await expect
      .poll(() => video.evaluate((node: HTMLVideoElement) => node.readyState))
      .toBeGreaterThanOrEqual(2);
    await page.locator('[data-practice-time="3"]').click();
    await page.locator('#practiceStartVideo').click();
    await expect(page.locator('#aiob-video-panel')).toBeVisible();
    await page.locator('[data-action-id="video:add"]').click();
    await expect(page.locator('.session-item-marker-time')).toHaveText('00:03');
    await page.locator('[data-practice-time="12"]').click();
    await page.locator('[data-action-id="video:add"]').click();
    await expect(page.locator('.video-timestamp-marker')).toHaveCount(2);
    await page.locator('.session-item-marker-time').first().click();
    await expect
      .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
      .toBeCloseTo(3, 0);
    await expect(page.locator('#practiceStatus')).toContainText('Click 00:12');
    await page.locator('.session-item-marker-time').last().click();
    await expect
      .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
      .toBeCloseTo(12, 0);
    await expect(page.locator('#practiceStatus')).toContainText('hollow dot');
    await video.evaluate((node: HTMLVideoElement) => {
      node.dataset.testSeeks = '0';
      node.addEventListener('seeking', () => {
        node.dataset.testSeeks = String(Number(node.dataset.testSeeks) + 1);
      });
    });

    await page.locator('.video-screenshot-toggle').first().click();
    await expect(page.locator('.video-screenshot-toggle').first()).toHaveAttribute(
      'data-screenshot-state',
      'on'
    );
    await page.locator('.video-screenshot-toggle').first().click();
    await expect(page.locator('.video-screenshot-toggle').first()).toHaveAttribute(
      'data-screenshot-state',
      'off'
    );
    await expect(page.locator('#practiceStatus')).toContainText('hollow dot');
    await page.locator('.video-screenshot-toggle').first().click();
    await expect(page.locator('.video-screenshot-toggle').first()).toHaveAttribute(
      'data-screenshot-state',
      'on'
    );
    await expect(video).toHaveAttribute('data-test-seeks', '0');
    expect(await video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(false);
    await expect(page.locator('#practiceStatus')).toContainText('finish and export');
    await page.screenshot({ path: testInfo.outputPath('video-practice.png') });
    await page.locator('[data-action-id="video:finish"]').click();
    await expect
      .poll(() =>
        worker.evaluate(async () => {
          const data = await chrome.storage.local.get<{ 'learningProgress.v1'?: LearningProgress }>(
            'learningProgress.v1'
          );
          return data['learningProgress.v1']?.latest?.course;
        })
      )
      .toBe('video');
    const files = await worker.evaluate(() => chrome.downloads.search({}));
    expect(files).toHaveLength(2);
    const markdownFile = files.find(
      (file) => file.mime?.includes('text') || file.filename.endsWith('.md')
    );
    if (!markdownFile) throw new Error('Missing real Markdown');
    const markdown = await readFile(markdownFile.filename, 'utf8');
    expect(markdown).toContain('[0:03]');
    expect(markdown).toContain('[0:12]');
    expect(markdown.match(/!\[Screenshot\]/g)).toHaveLength(1);
    expect(markdown.indexOf('![Screenshot]')).toBeLessThan(markdown.indexOf('[0:12]'));
    const screenshotFile = files.find((file) => file.mime === 'image/jpeg');
    if (!screenshotFile) throw new Error('Missing real screenshot');
    const screenshot = await readFile(screenshotFile.filename);
    const pixel = await page.evaluate(async (data) => {
      const img = new Image();
      img.src = 'data:image/jpeg;base64,' + data;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Missing canvas');
      ctx.drawImage(img, 0, 0);
      return Array.from(ctx.getImageData(20, 60, 1, 1).data);
    }, screenshot.toString('base64'));
    expect(Math.abs((pixel[0] ?? 0) - 92)).toBeLessThan(15);
    expect(Math.abs((pixel[2] ?? 0) - 159)).toBeLessThan(15);
    for (const file of files) await rm(file.filename, { force: true });
    await expect(page.locator('#practiceResult')).toBeVisible();
    await expect(page.locator('[data-settings-guide="vault"]')).toBeVisible();
    await expect(page.locator('[data-settings-guide="overview"]')).toBeVisible();
    await expect(page.locator('[data-settings-guide="ai"]')).toBeVisible();
    const vaultPagePromise = context.waitForEvent('page');
    await page.locator('[data-settings-guide="vault"]').click();
    const vaultPage = await vaultPagePromise;
    await expect(vaultPage.locator('#settingsTour')).toBeVisible();
    await expect(vaultPage.locator('#settingsTourTopics')).toHaveValue('vault');
    await expect(
      vaultPage.locator('.settings-tour-target .local-folder-trigger').first()
    ).toBeVisible();
    await vaultPage.close();
    for (const language of ['zh-CN', 'de']) {
      await worker.evaluate(async (lang) => {
        await chrome.storage.sync.set({ language: lang });
      }, language);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(
        'chrome-extension://' + id + '/onboarding/practice.html?lesson=video&run=' + language
      );
      await page.locator('[data-practice-time="3"]').click();
      await page.locator('#practiceStartVideo').click();
      await page.locator('[data-action-id="video:add"]').click();
      await page.locator('[data-practice-time="12"]').click();
      await page.locator('[data-action-id="video:add"]').click();
      await page.screenshot({ path: testInfo.outputPath('video-seek-' + language + '.png') });
      await page.locator('.session-item-marker-time').first().click();
      await expect(page.locator('.session-item-marker-time').last()).toHaveClass(
        /practice-coached/
      );
      await page.locator('.session-item-marker-time').last().click();
      await expect(page.locator('.video-screenshot-toggle').first()).toHaveClass(
        /practice-coached/
      );
      await page.screenshot({ path: testInfo.outputPath('video-dot-' + language + '.png') });
      await page.setViewportSize({ width: 360, height: 800 });
      await expect
        .poll(() =>
          video.evaluate((node) => {
            const box = node.getBoundingClientRect();
            return (
              document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === node
            );
          })
        )
        .toBe(true);
      await page.screenshot({ path: testInfo.outputPath('video-narrow-' + language + '.png') });
      await expectUncoveredControls(page, [
        '#practiceVideo',
        '[data-practice-time="3"]',
        '[data-practice-time="12"]',
        '.session-item-marker-time',
        '.video-screenshot-toggle',
        '[data-action-id="video:add"]',
        '[data-action-id="video:finish"]'
      ]);
      const counterBox = await page.locator('.session-counter').boundingBox();
      const actionsBox = await page.locator('.session-footer-actions').boundingBox();
      if (!counterBox || !actionsBox) throw new Error('Missing video footer');
      expect(
        counterBox.y + counterBox.height <= actionsBox.y ||
          counterBox.x + counterBox.width <= actionsBox.x
      ).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      await page.locator('[data-action-id="video:cancel"]').click();
    }
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('practice links to the actual settings tour and modifier edits update practice', async ({
  browserName
}, testInfo) => {
  test.skip(browserName !== 'chromium');
  const profile = await mkdtemp(path.join(tmpdir(), 'zendio-settings-tour-'));
  const extensionPath = path.resolve(process.env.PLAYWRIGHT_DIST_DIR ?? 'build/dist');
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    args: [
      '--headless=new',
      '--disable-extensions-except=' + extensionPath,
      '--load-extension=' + extensionPath
    ]
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = worker.url().split('/')[2];
    await worker.evaluate(() => chrome.storage.sync.set({ language: 'zh-CN' }));
    const practice = await context.newPage();
    await practice.goto('chrome-extension://' + id + '/onboarding/practice.html?run=settings-link');
    await expect(practice.locator('kbd')).toHaveText('Shift');
    const settingsPromise = context.waitForEvent('page');
    await practice.locator('[data-settings-guide="selection"]').click();
    const settings = await settingsPromise;
    await expect(settings.locator('#settingsTour')).toBeVisible();
    await expect(settings.locator('.settings-tour-target')).toHaveClass(/selection-trigger-inline/);
    await settings.screenshot({ path: testInfo.outputPath('settings-selection-zh.png') });
    await settings
      .locator('.settings-tour-target')
      .getByRole('button', { name: 'Alt', exact: true })
      .click();
    await expect(practice.locator('kbd')).toHaveText('Alt');
    const select = settings.locator('#settingsTourTopics');
    for (const topic of [
      'overview',
      'vault',
      'routing',
      'sources',
      'reading',
      'selection',
      'output',
      'maintenance',
      'ai'
    ]) {
      await select.selectOption(topic);
      await expect(settings.locator('.settings-tour-target')).toBeVisible();
      await expect(settings).toHaveURL(new RegExp('guide=' + topic));
    }
    await select.selectOption('vault');
    await expect(settings.locator('#settingsTour')).toContainText('默认仓库');
    await expect(settings.locator('#settingsTour a')).toHaveAttribute(
      'href',
      'https://github.com/coddingtonbear/obsidian-local-rest-api'
    );
    await settings.screenshot({ path: testInfo.outputPath('settings-vault-zh.png') });
    await settings.reload();
    await expect(settings.locator('#settingsTourTopics')).toHaveValue('vault');
    await settings.setViewportSize({ width: 360, height: 800 });
    await expect(settings.locator('#settingsTourNext')).toBeVisible();
    expect(await settings.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await settings.screenshot({ path: testInfo.outputPath('settings-narrow-zh.png') });
    await settings.locator('#settingsTourClose').click();
    await expect(settings.locator('#settingsTour')).toHaveCount(0);
    expect(new URL(settings.url()).searchParams.has('guide')).toBe(false);
    await settings.reload();
    await expect(settings.locator('#settingsTour')).toHaveCount(0);
    await expect(practice.locator('kbd')).toHaveText('Alt');
    await worker.evaluate(() => chrome.storage.sync.set({ language: 'de' }));
    await settings.emulateMedia({ colorScheme: 'dark' });
    await settings.goto(
      'chrome-extension://' + id + '/options/index.html?guide=reading#section-capture-behavior'
    );
    await expect(settings.locator('#settingsTour')).toContainText('Sidebar Highlights');
    await expect(settings.locator('#settingsTourClose')).toBeVisible();
    expect(
      await settings.locator('#settingsTourNext').evaluate((node) => {
        const box = node.getBoundingClientRect();
        return box.top >= 0 && box.bottom <= innerHeight;
      })
    ).toBe(true);
    await settings.screenshot({ path: testInfo.outputPath('settings-narrow-dark-de.png') });
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
