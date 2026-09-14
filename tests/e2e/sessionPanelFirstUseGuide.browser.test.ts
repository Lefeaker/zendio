import { expect, type Locator, type Page } from '@playwright/test';
import {
  testWithExtension as test,
  createOptionsFixture,
  openFixtureWithRuntime,
  openVideoPanelFromControlBar,
  expandVideoPanel,
  youtubeFixtureHtml,
  YOUTUBE_URL
} from './utils/videoListenerScopeHarness';

async function startReader(page: Page, extensionPage: Page, tabId: number) {
  await expect(page.locator('html')).toHaveAttribute('data-aiob-content-runtime', 'true');
  await page.evaluate(() => {
    const text = document.querySelector('p');
    if (!text) throw new Error('Missing article text');
    const range = document.createRange();
    range.selectNodeContents(text);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  await extensionPage.evaluate(
    (id) => chrome.tabs.sendMessage(id, { action: 'clipSelection' }),
    tabId
  );
  await page.locator('[data-stitch-surface="clipper"] [data-action-id="reader"]').click();
}

async function resize(page: Page, handle: Locator, dx: number, dy: number) {
  const box = await handle.boundingBox();
  if (!box) throw new Error('Resize handle missing');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

const scenarios: Array<{
  mode: 'reader' | 'video';
  language: string;
  title: string;
  dark: boolean;
}> = [
  { mode: 'reader', language: 'en', title: 'Quick tip', dark: false },
  { mode: 'reader', language: 'zh-CN', title: '小提示', dark: true },
  { mode: 'video', language: 'de', title: 'Kurzer Tipp', dark: false }
];

scenarios.forEach(({ mode, language, title, dark }) => {
  test(`first-use guide survives resize and is acknowledged once for ${mode} in ${language}`, async ({
    context,
    extensionPage
  }, testInfo) => {
    await extensionPage.evaluate(async (language) => {
      await chrome.storage.sync.set({ language });
      await chrome.storage.local.set({
        'aiob.sessionPanel.width': 500,
        'aiob.sessionPanel.maxWidth': 576,
        'aiob.sessionPanel.height': 600
      });
    }, language);
    const sourceUrl =
      mode === 'video' ? `${YOUTUBE_URL}&guide=first` : 'https://first-use-guide.test/article';
    const html =
      mode === 'video'
        ? youtubeFixtureHtml()
        : '<html><head><title>First-use guide</title></head><body><p>A note to keep while learning the panel controls.</p></body></html>';
    const open = async (url: string) => {
      const options = {
        ...createOptionsFixture({ selectionTriggerMode: 'disabled' }),
        interfaceTheme: dark ? 'dark' : 'light'
      };
      const fixture = await openFixtureWithRuntime(context, extensionPage, url, html, options);
      await fixture.page.setViewportSize({ width: 1100, height: 850 });
      if (mode === 'reader') await startReader(fixture.page, extensionPage, fixture.tabId);
      else {
        await openVideoPanelFromControlBar(fixture.page, 'Video note stays intact', {
          captureScreenshotEnabled: false
        });
        await expect(fixture.page.locator('.session-first-use-guide')).toBeHidden();
        await expandVideoPanel(fixture.page);
      }
      return fixture.page;
    };
    const page = await open(sourceUrl);
    const panel = page.locator(`#aiob-${mode}-panel`);
    const guide = panel.locator('.session-first-use-guide');
    await expect(guide).toBeVisible();
    await expect(panel.locator('[data-stitch-surface]')).toHaveAttribute(
      'data-preview-theme',
      dark ? 'dark' : 'light'
    );
    await expect(guide.locator('strong')).toHaveText(title);
    await expect(guide.locator('p')).toHaveCount(2);
    const input = panel
      .locator(mode === 'reader' ? '[data-highlight-input]' : '[data-capture-input]')
      .first();
    await input.fill('Keep this unsaved note');
    const modal = panel.locator('.resource-modal--session');
    const initial = await modal.boundingBox();
    if (!initial) throw new Error('Session panel missing');
    await resize(page, panel.locator('.session-panel-resize-handle'), initial.width - 400, 0);
    await resize(
      page,
      panel.locator('.session-panel-height-resize-handle'),
      0,
      initial.height - 500
    );
    await expect(modal).toHaveCSS('width', '400px');
    await expect(modal).toHaveCSS('height', '500px');
    await expect(guide.getByRole('button')).toBeInViewport();
    expect(await guide.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true
    );
    await panel.screenshot({ path: testInfo.outputPath('first-use-guide.png') });
    const [options] = await Promise.all([
      context.waitForEvent('page'),
      panel.locator('a.surface-window-icon').click()
    ]);
    await expect(options.locator('#optionsShellRoot')).toBeVisible();
    await expect(options).toHaveURL(/\/options\/index\.html$/);
    await options.close();
    await page.bringToFront();
    await expect(input).toHaveValue('Keep this unsaved note');
    await guide.getByRole('button').click();
    await expect(guide).toBeHidden();
    await expect(input).toHaveValue('Keep this unsaved note');
    const key = `aiob.firstUse.${mode}Panel.v1`;
    await expect
      .poll(() =>
        extensionPage.evaluate(async (key) => (await chrome.storage.local.get(key))[key], key)
      )
      .toBe(true);
    await panel.locator('[data-action-id="session:toggleCollapse"]').click();
    await panel.locator('.surface-window-brand').click();
    await expect(guide).toBeHidden();
    await page.close();
    const reopened = await open(`${sourceUrl}${sourceUrl.includes('?') ? '&' : '?'}reopened=1`);
    await expect(reopened.locator(`#aiob-${mode}-panel .session-first-use-guide`)).toBeHidden();
  });
});
