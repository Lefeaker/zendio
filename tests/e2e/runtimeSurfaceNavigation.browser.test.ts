import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import {
  testWithExtension as test,
  createOptionsFixture,
  openFixtureWithRuntime,
  openVideoPanelFromControlBar,
  expandVideoPanel,
  youtubeFixtureHtml,
  YOUTUBE_URL
} from './utils/videoListenerScopeHarness';

async function expectNewOptionsTab(context: BrowserContext, link: Locator, source: Page) {
  const sourceUrl = source.url();
  const before = context.pages().length;
  const src = await link.locator('img').getAttribute('src');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('href', /^chrome-extension:\/\/[^/]+\/options\/index\.html$/);
  const [options] = await Promise.all([
    context.waitForEvent('page', { timeout: 8000 }),
    link.click()
  ]);
  await expect(options.locator('#optionsShellRoot')).toBeVisible();
  expect(context.pages()).toHaveLength(before + 1);
  expect(source.url()).toBe(sourceUrl);
  await expect(link.locator('img')).toHaveAttribute('src', src ?? '');
  await source.bringToFront();
}

test('keeps the clipper comment focus border quiet and opens Options from clipper and reader icons', async ({
  context,
  extensionPage
}, testInfo) => {
  await extensionPage.evaluate(() => chrome.storage.sync.set({ language: 'en' }));
  const { page, tabId } = await openFixtureWithRuntime(
    context,
    extensionPage,
    'https://runtime-navigation.test/article',
    '<html><head><title>Surface navigation</title></head><body><main><p id="selection">Selected content stays intact when the header opens settings.</p></main></body></html>',
    createOptionsFixture({ selectionTriggerMode: 'disabled' })
  );
  await expect(page.locator('html')).toHaveAttribute('data-aiob-content-runtime', 'true');
  await page.evaluate(() => {
    const selected = document.getElementById('selection');
    if (!selected) throw new Error('Missing selection fixture');
    const range = document.createRange();
    range.selectNodeContents(selected);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  await extensionPage.evaluate(
    (id) => chrome.tabs.sendMessage(id, { action: 'clipSelection' }),
    tabId
  );
  const clipper = page.locator('[data-stitch-surface="clipper"]');
  const comment = clipper.locator('[data-role="clipper-comment-input"]');
  await expect(comment).toBeVisible();
  await comment.focus();
  await comment.fill('Keep this note while opening settings.');
  console.log(
    'comment focus',
    await comment.evaluate((element) => ({
      outline: getComputedStyle(element).outline,
      shadow: getComputedStyle(element).boxShadow,
      border: getComputedStyle(element).borderColor
    }))
  );
  await expect(comment).toHaveCSS('outline-style', 'none');
  await expect(comment).toHaveCSS('box-shadow', 'none');
  await expect(comment).toHaveCSS('border-top-width', '1px');
  await clipper.screenshot({ path: testInfo.outputPath('clipper-focus-and-icon.png') });
  await expectNewOptionsTab(context, clipper.locator('a.surface-window-icon'), page);
  await expect(comment).toHaveValue('Keep this note while opening settings.');
  await clipper.locator('[data-action-id="reader"]').click();
  const reader = page.locator('#aiob-reader-panel');
  await expect(reader.locator('[data-highlight-input]')).toHaveCount(1);
  await expectNewOptionsTab(context, reader.locator('a.surface-window-icon'), page);
  await reader.locator('[data-action-id="session:toggleCollapse"]').click();
  await expect(reader.locator('.resource-modal')).toHaveClass(/is-collapsed/);
  await expectNewOptionsTab(context, reader.locator('a.surface-window-icon'), page);
  await expect(reader.locator('.resource-modal')).toHaveClass(/is-collapsed/);
});

test('opens a fresh Options tab from the video header without replacing the capture', async ({
  context,
  extensionPage
}) => {
  await extensionPage.evaluate(() => chrome.storage.sync.set({ language: 'en' }));
  const { page } = await openFixtureWithRuntime(
    context,
    extensionPage,
    `${YOUTUBE_URL}&surface-navigation=video`,
    youtubeFixtureHtml()
  );
  await openVideoPanelFromControlBar(page, 'A video note kept while opening settings', {
    captureScreenshotEnabled: false
  });
  await expandVideoPanel(page);
  const video = page.locator('#aiob-video-panel');
  const note = video.locator('[data-capture-input]').first();
  await expect(note).toHaveValue('A video note kept while opening settings');
  await expectNewOptionsTab(context, video.locator('a.surface-window-icon'), page);
  await expect(note).toHaveValue('A video note kept while opening settings');
});
