import { expect, type Locator, type Page } from '@playwright/test';
import type { StoredOptions } from '../../src/shared/types/options';
import { testWithExtension as test } from './utils/videoListenerScopeHarness';

async function readOptions(page: Page) {
  return page.evaluate(async () => {
    const stored = await chrome.storage.sync.get<{ options?: StoredOptions }>('options');
    return stored.options;
  });
}

async function expectCapsule(group: Locator, count: number, fill: string) {
  await expect(group).toHaveClass(/segmented-control/);
  await expect(group).toHaveCSS('display', 'grid');
  await expect
    .poll(() =>
      group.evaluate((element) => {
        const buttons = [...element.querySelectorAll<HTMLButtonElement>('button')];
        const index = buttons.findIndex((button) => button.getAttribute('aria-pressed') === 'true');
        const track = getComputedStyle(element, '::before');
        const width = Number.parseFloat(track.width);
        return Math.abs(new DOMMatrixReadOnly(track.transform).m41 - index * width) < 1;
      })
    )
    .toBe(true);
  const geometry = await group.evaluate((element) => {
    const style = getComputedStyle(element);
    const track = getComputedStyle(element, '::before');
    return {
      gap: style.columnGap,
      border: style.borderTopStyle,
      radius: Number.parseFloat(style.borderRadius),
      height: element.getBoundingClientRect().height,
      fill: track.backgroundColor,
      widths: [...element.querySelectorAll('button')].map(
        (button) => button.getBoundingClientRect().width
      ),
      trackWidth: Number.parseFloat(track.width)
    };
  });
  expect(geometry.widths).toHaveLength(count);
  expect(Math.max(...geometry.widths) - Math.min(...geometry.widths)).toBeLessThan(1);
  expect(Math.abs(geometry.trackWidth - (geometry.widths[0] ?? 0))).toBeLessThan(2);
  expect(geometry.radius).toBeGreaterThanOrEqual(geometry.height / 2);
  expect(geometry.border).toBe('solid');
  expect(geometry.gap).toBe('0px');
  expect(geometry.fill).toBe(fill);
}

test('saves and reconnects a local-folder-only vault after clearing its REST fields', async ({
  extensionPage,
  context
}) => {
  await extensionPage.evaluate(() => chrome.storage.sync.set({ language: 'en' }));
  const page = await context.newPage();
  // Replace only the picker with a native OPFS handle; binding, persistence,
  // permission queries and connection tests still run through production owners.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () =>
        (await navigator.storage.getDirectory()).getDirectoryHandle('Local-only-vault', {
          create: true
        })
    });
  });
  await page.goto(new URL('/options/index.html', extensionPage.url()).href);
  await page.locator('[data-nav-panel="storage"]').click();
  const row = page.locator('.storage-vault-table-scroll tbody tr').first();
  await row.locator('.local-folder-trigger').click();
  await expect(row.locator('.local-folder-trigger')).toContainText('Local-only-vault');
  await expect(row.locator('.local-folder-trigger')).toHaveClass(/is-selected/);
  const textInputs = row.locator('input[type="text"]');
  await textInputs.nth(1).fill('');
  await textInputs.nth(2).fill('');
  await row.locator('input[type="password"]').fill('');
  await expect
    .poll(async () => (await readOptions(extensionPage))?.vaultRouter?.vaults[0]?.httpsUrl)
    .toBe('');
  await expect
    .poll(async () => (await readOptions(extensionPage))?.vaultRouter?.vaults[0]?.httpUrl)
    .toBe('');
  const saved = await readOptions(extensionPage);
  expect(saved?.vaultRouter?.vaults[0]).toMatchObject({ httpsUrl: '', httpUrl: '', apiKey: '' });

  await page.reload();
  await page.locator('[data-nav-panel="storage"]').click();
  await expect(row.locator('.local-folder-trigger')).toContainText('Local-only-vault');
  await expect(textInputs.nth(1)).toHaveValue('');
  await expect(textInputs.nth(2)).toHaveValue('');
  await page.locator('[data-action-id="storage:testConnection"]').click();
  const notice = page.locator('[data-panel-id="storage"] .notice');
  await expect(notice).toHaveClass(/success/);
  await expect(notice).toContainText('✅ Local Folder');
  await expect(notice).toContainText('— REST API (HTTPS)');
  await expect(notice).toContainText('— REST API (HTTP)');
  await expect(notice).not.toContainText('❌');
});

test('persists segmented selection and export choices and presents the v0.3.0 changelog', async ({
  extensionPage,
  context
}) => {
  await extensionPage.evaluate(() => chrome.storage.sync.set({ language: 'zh-CN' }));
  const page = await context.newPage();
  await page.goto(new URL('/options/index.html', extensionPage.url()).href);
  await page.locator('[data-nav-panel="capture-behavior"]').click();
  const trigger = page.locator('.selection-trigger-inline > .chips');
  const exportChoices = page.locator('[data-panel-id="capture-behavior"] .chips').filter({
    has: page.locator('button[data-value="full"]')
  });
  await expect(trigger.locator('button')).toHaveText(['关闭', '直接', '辅助键']);
  await expect(exportChoices.locator('button')).toHaveText(['全文', '仅高亮']);
  await expect(page.locator('.selection-trigger-inline select')).toHaveCount(0);
  const fill = await trigger.evaluate(
    (element) => getComputedStyle(element, '::before').backgroundColor
  );

  for (const mode of ['direct', 'disabled', 'modifier']) {
    await trigger.locator(`[data-value="${mode}"]`).click();
    await expect(trigger.locator('[aria-pressed="true"]')).toHaveAttribute('data-value', mode);
    await expectCapsule(trigger, 3, fill);
    await expect
      .poll(async () => (await readOptions(extensionPage))?.fragmentClipper?.selectionTriggerMode)
      .toBe(mode);
    await expect(page.locator('.modifier-key-choices')).toHaveCount(mode === 'modifier' ? 1 : 0);
  }
  await page.locator('.modifier-key-choices [data-value="shift"]').click();
  await expect(trigger.locator('[data-value="modifier"]')).toHaveAttribute('aria-pressed', 'true');
  for (const mode of ['full', 'highlights', 'full']) {
    const button = exportChoices.locator(`[data-value="${mode}"]`);
    await button.focus();
    await button.press('Space');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expectCapsule(exportChoices, 2, fill);
    await expect
      .poll(async () => (await readOptions(extensionPage))?.readingSession?.exportMode)
      .toBe(mode);
  }
  await page.reload();
  await page.locator('[data-nav-panel="capture-behavior"]').click();
  await expect(trigger.locator('[data-value="modifier"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.modifier-key-choices [data-value="shift"]')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(exportChoices.locator('[data-value="full"]')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(await extensionPage.evaluate(() => chrome.runtime.getManifest().version)).toBe('0.3.0');
  await page.locator('[data-footer-panel="changelog"]').click();
  const latest = page.locator('.release-card').first();
  await expect(latest).toContainText('v0.3.0');
  await expect(latest).toContainText('2026-09-12');
  await expect(latest.locator('li')).toHaveCount(8);
  await expect(latest).toContainText('避免结束清理重试重复导出');
  await expect(latest).toContainText('仅绑定本地目录');
  await expect(page.locator('.release-card')).toHaveCount(4);
});

test('keeps segmented controls readable in both themes and on narrow screens', async ({
  extensionPage,
  context
}, testInfo) => {
  const page = await context.newPage();
  for (const language of ['zh-CN', 'en', 'de']) {
    await extensionPage.evaluate((value) => chrome.storage.sync.set({ language: value }), language);
    await page.goto(new URL('/options/index.html', extensionPage.url()).href);
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.locator('[data-nav-panel="overview"]').click();
      await page.locator(`.interface-theme-grid .chips [data-value="${theme}"]`).click();
      const themeControl = page.locator('.interface-theme-grid .segmented-control');
      const fill = await themeControl.evaluate(
        (element) => getComputedStyle(element, '::before').backgroundColor
      );
      await expectCapsule(themeControl, 3, fill);
      await page.locator('[data-nav-panel="capture-behavior"]').click();
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const panel = page.locator('[data-panel-id="capture-behavior"]');
        await expect(panel.locator('.selection-trigger-inline > .chips button')).toHaveCount(3);
        const fits = await panel.evaluate((element) =>
          [...element.querySelectorAll<HTMLButtonElement>('.chips button')].every((button) => {
            const box = button.getBoundingClientRect();
            return (
              box.left >= 0 &&
              box.right <= window.innerWidth + 1 &&
              button.scrollWidth <= button.clientWidth
            );
          })
        );
        expect(fits).toBe(true);
        await expectCapsule(panel.locator('.selection-trigger-inline > .chips'), 3, fill);
        await expectCapsule(
          panel.locator('.chips').filter({ has: page.locator('button[data-value="full"]') }),
          2,
          fill
        );
        await panel.locator('.selection-trigger-inline').screenshot({
          path: testInfo.outputPath(`${language}-${theme}-${width}-trigger.png`)
        });
        await panel
          .locator('.chips')
          .filter({ has: page.locator('button[data-value="full"]') })
          .screenshot({
            path: testInfo.outputPath(`${language}-${theme}-${width}-export.png`)
          });
      }
    }
  }
});
