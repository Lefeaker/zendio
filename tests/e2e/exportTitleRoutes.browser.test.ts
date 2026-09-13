import { test, configureSink, type Destination } from './utils/exportTitleSinks';
import { expect } from '@playwright/test';
import {
  openFixtureWithRuntime,
  createOptionsFixture,
  bilibiliFixtureHtml,
  youtubeFixtureHtml,
  installPlaybackFixture,
  injectContentRuntime,
  startVideoMode,
  expandVideoPanel,
  submitControlBarNote
} from './utils/videoListenerScopeHarness';

const platforms: Array<'bilibili' | 'youtube'> = ['bilibili', 'youtube'];
const destinations: Destination[] = ['downloads', 'local', 'rest'];
const modes: Array<'article' | 'reading-full' | 'reading-highlights' | 'fragment'> = [
  'article',
  'reading-full',
  'reading-highlights',
  'fragment'
];

platforms.forEach((platform) => {
  destinations.forEach((destination) => {
    test(`${platform}: late video title reaches ${destination}`, async ({
      context,
      extensionPage
    }, testInfo) => {
      const downloadDirectory = testInfo.outputPath('downloads');
      const url =
        platform === 'bilibili'
          ? 'https://www.bilibili.com/video/BV1gyEd6xEyu/'
          : 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
      const html = (platform === 'bilibili' ? bilibiliFixtureHtml() : youtubeFixtureHtml())
        .replace(/<title>[^<]*<\/title>/, '<title></title>')
        .replace(/(<h1[^>]*>)[^<]*(<\/h1>)/, '$1$2');
      const { page, tabId } = await openFixtureWithRuntime(context, extensionPage, url, html);
      const sink = await configureSink(extensionPage, destination, downloadDirectory);
      try {
        await page.reload();
        await injectContentRuntime(extensionPage, tabId);
        await installPlaybackFixture(extensionPage, tabId, true);
        await startVideoMode(extensionPage, tabId);
        await expandVideoPanel(page);
        await page.locator('[data-role="add-btn"]').click();
        await expect(page.locator('[data-role="capture-item"]')).toHaveCount(1);
        const title =
          platform === 'bilibili' ? '视频 标题：延迟加载' : 'YouTube Actual Video Title';
        await page.locator('h1').evaluate((heading, nextTitle) => {
          heading.textContent = nextTitle;
        }, title);
        await page.locator('[data-role="finish-btn"]').click();
        const filename =
          platform === 'bilibili' ? '视频-标题：延迟加载.md' : 'youtube-actual-video-title.md';
        const markdown = await sink.read(`Video/${filename}`);
        expect(markdown).toContain(`title: "${title}"`);
        expect(markdown).toContain('0:42');
        expect(markdown).not.toContain('title: "Bilibili Video"');
        expect(markdown).not.toContain('title: "YouTube Video"');
      } finally {
        await sink.close();
      }
    });
  });
});

platforms.forEach((platform) => {
  modes.forEach((mode) => {
    destinations.forEach((destination) => {
      test(`${platform}: ${mode} title reaches ${destination}`, async ({
        context,
        extensionPage
      }, testInfo) => {
        const title = `${platform} Article Title`;
        const paragraph =
          'Selected article paragraph with enough useful text to identify the exported content.';
        const url =
          platform === 'bilibili'
            ? 'https://www.bilibili.com/read/cv123456/'
            : 'https://www.youtube.com/post/title-fixture';
        const { page, tabId } = await openFixtureWithRuntime(
          context,
          extensionPage,
          url,
          `<html><head><title>${title}</title></head><body><article><h1>${title}</h1><p id="selected">${paragraph}</p><p>${'Further article content. '.repeat(40)}</p></article></body></html>`,
          createOptionsFixture(
            { selectionTriggerMode: 'disabled' },
            { exportMode: mode === 'reading-full' ? 'full' : 'highlights' }
          )
        );
        const sink = await configureSink(
          extensionPage,
          destination,
          testInfo.outputPath('downloads')
        );
        try {
          await page.reload();
          await injectContentRuntime(extensionPage, tabId);
          await expect(page.locator('html')).toHaveAttribute('data-aiob-content-runtime', 'true');
          if (mode !== 'article') {
            await page.locator('#selected').evaluate((element) => {
              const range = document.createRange();
              range.selectNodeContents(element);
              window.getSelection()?.removeAllRanges();
              window.getSelection()?.addRange(range);
            });
          }
          await extensionPage.evaluate(
            ({ tabId, action }) => chrome.tabs.sendMessage(tabId, { action }),
            { tabId, action: mode === 'article' ? 'clipFull' : 'clipSelection' }
          );
          const clipper = page.locator('[data-stitch-surface="clipper"]');
          if (mode.startsWith('reading')) {
            await clipper.locator('[data-action-id="reader"]').click();
            const highlight = page.locator('[data-role="highlight-item"]');
            await expect(highlight).toHaveCount(1);
            await expect(highlight).toContainText('Selected article paragraph');
            await page.locator('[data-role="export-btn"]').click();
          } else if (mode === 'fragment') {
            await clipper.locator('[data-action-id="clip"]').click();
          }
          const directory =
            mode === 'article' ? 'Articles' : mode === 'fragment' ? 'Fragments' : 'Reading';
          const markdown = await sink.read(
            `${directory}/${platform}-article-title.md`,
            mode !== 'article'
          );
          expect(markdown).toContain(title);
          expect(markdown).toContain(paragraph);
          expect(markdown).not.toMatch(/title: "(?:Bilibili|YouTube) Video"/);
        } finally {
          await sink.close();
        }
      });
    });
  });
});

platforms.forEach((platform) => {
  test(`${platform}: control-bar capture honors explicit Downloads and the current title`, async ({
    context,
    extensionPage
  }, testInfo) => {
    const url =
      platform === 'bilibili'
        ? 'https://www.bilibili.com/video/BV1gyEd6xEyu/'
        : 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
    const { page, tabId } = await openFixtureWithRuntime(
      context,
      extensionPage,
      url,
      platform === 'bilibili' ? bilibiliFixtureHtml() : youtubeFixtureHtml()
    );
    const sink = await configureSink(
      extensionPage,
      'explicit-downloads',
      testInfo.outputPath('downloads')
    );
    try {
      await page.reload();
      await injectContentRuntime(extensionPage, tabId);
      await installPlaybackFixture(extensionPage, tabId, true);
      await submitControlBarNote(page, 'Control-bar note survives export', {
        captureScreenshotEnabled: false
      });
      await expandVideoPanel(page);
      await page.locator('.export-destination-summary').click();
      await page.locator('.export-destination-option[data-destination-id="downloads"]').click();
      const title = `${platform} Renamed Video`;
      await page.locator('h1').evaluate((heading, value) => {
        heading.textContent = value;
      }, title);
      await page.locator('[data-role="finish-btn"]').click();
      const markdown = await sink.read(`Video/${platform}-renamed-video.md`);
      expect(markdown).toContain(`title: "${title}"`);
      expect(markdown).toContain('Control-bar note survives export');
    } finally {
      await sink.close();
    }
  });
});
