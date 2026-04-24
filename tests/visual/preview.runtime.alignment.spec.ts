import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import {
  PREVIEW_STITCH_SECONDARY_FOOTER_LABELS,
  PREVIEW_STITCH_SECONDARY_INDEX_URL
} from './utils/renderProductionOptionsShell';

function getExpectedModalWidth(viewportWidth: number, desktopMin: number, desktopMax: number) {
  if (viewportWidth <= 430) {
    return { min: 320, max: 360 };
  }
  return { min: desktopMin, max: desktopMax };
}

async function openSurface(page: Page, label: string) {
  await page.goto(PREVIEW_STITCH_SECONDARY_INDEX_URL);
  await page.locator('.footer-link').filter({ hasText: label }).click();
  await page.waitForSelector('.resource-modal-overlay');
}

async function measureAlignment(page: Page, count: number): Promise<number[]> {
  return page.evaluate((limit: number) => {
    return Array.from(document.querySelectorAll('.session-item-card'))
      .slice(0, limit)
      .map((card) => {
        const marker = card.querySelector('.session-item-marker span');
        const primary = card.querySelector(
          '.session-item-primary-line, .session-item-comment-input'
        );
        if (!(marker instanceof HTMLElement) || !(primary instanceof HTMLElement)) {
          throw new Error('Missing marker or primary line for session alignment measurement.');
        }
        const markerRect = marker.getBoundingClientRect();
        const inputRect = primary.getBoundingClientRect();
        const markerCenter = markerRect.top + markerRect.height / 2;
        const primaryStyle = getComputedStyle(primary);
        const lineHeight = Number.parseFloat(primaryStyle.lineHeight);
        const inputCenter =
          primary.classList.contains('reader-selection-text') && Number.isFinite(lineHeight)
            ? inputRect.top + lineHeight / 2
            : inputRect.top + inputRect.height / 2;
        return Math.abs(markerCenter - inputCenter);
      });
  }, count);
}

test.describe('preview runtime marker alignment', () => {
  test('preview footer inventories the protected stitch secondary targets', async ({ page }) => {
    await page.goto(PREVIEW_STITCH_SECONDARY_INDEX_URL);

    const labels = await page
      .locator('.footer-link')
      .evaluateAll((links) => links.map((link) => link.textContent?.trim() ?? '').filter(Boolean));

    expect(labels).toEqual([...PREVIEW_STITCH_SECONDARY_FOOTER_LABELS]);
  });

  test('clipper matches the current production dialog width', async ({ page }) => {
    await openSurface(page, '剪藏弹窗');

    const metrics = await page.evaluate(() => {
      const dialog = document.querySelector('.clipper-surface-window');
      if (!(dialog instanceof HTMLElement)) {
        throw new Error('Missing clipper dialog window.');
      }
      const rect = dialog.getBoundingClientRect();
      return {
        width: rect.width,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        viewportCenterX: window.innerWidth / 2,
        viewportCenterY: window.innerHeight / 2
      };
    });
    const expectedWidth = getExpectedModalWidth(metrics.viewportCenterX * 2, 560, 610);

    expect(metrics.width).toBeGreaterThanOrEqual(expectedWidth.min);
    expect(metrics.width).toBeLessThanOrEqual(expectedWidth.max);
    expect(Math.abs(metrics.centerX - metrics.viewportCenterX)).toBeLessThanOrEqual(24);
    expect(Math.abs(metrics.centerY - metrics.viewportCenterY)).toBeLessThanOrEqual(32);
  });

  test('clipper preserves the stitch secondary shell action row', async ({ page }) => {
    await openSurface(page, '剪藏弹窗');

    await expect(page.locator('.clipper-surface-window')).toBeVisible();
    await expect(page.locator('.surface-window-title')).toHaveText('Clip Selection');
    await expect(page.locator('.clipper-comment-textarea')).toBeVisible();
    await expect(page.locator('.clipper-footer-secondary button')).toHaveText(['进入阅读模式']);
    await expect(page.locator('.clipper-footer-primary button')).toHaveText(['直接剪藏']);
  });

  test('reader and video match the current production dialog width', async ({ page }) => {
    for (const label of ['阅读模式', '视频模式']) {
      await openSurface(page, label);
      const metrics = await page.evaluate(() => {
        const dialog = document.querySelector('.resource-modal--session');
        if (!(dialog instanceof HTMLElement)) {
          throw new Error('Missing session dialog window.');
        }
        const rect = dialog.getBoundingClientRect();
        return {
          width: rect.width,
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
          viewportCenterX: window.innerWidth / 2,
          viewportCenterY: window.innerHeight / 2
        };
      });
      const expectedWidth = getExpectedModalWidth(metrics.viewportCenterX * 2, 470, 490);

      expect(metrics.width).toBeGreaterThanOrEqual(expectedWidth.min);
      expect(metrics.width).toBeLessThanOrEqual(expectedWidth.max);
      expect(Math.abs(metrics.centerX - metrics.viewportCenterX)).toBeLessThanOrEqual(24);
      expect(Math.abs(metrics.centerY - metrics.viewportCenterY)).toBeLessThanOrEqual(48);

      await page.locator('.resource-modal-overlay').click({ position: { x: 10, y: 10 } });
    }
  });

  test('reader markers align with the first text line', async ({ page }) => {
    await openSurface(page, '阅读模式');
    const diffs = await measureAlignment(page, 3);

    for (const diff of diffs) {
      expect(diff).toBeLessThanOrEqual(2);
    }
  });

  test('reader keeps selected text above the editable note', async ({ page }) => {
    await openSurface(page, '阅读模式');
    const firstItem = page.locator('.session-item-card').first();
    const selectedText = firstItem.locator('.reader-selection-text');
    const noteInput = firstItem.locator('.reader-note-input');

    await expect(selectedText).toBeVisible();
    await expect(noteInput).toBeVisible();
    await expect(selectedText).toContainText('真正重要的不是信息本身');

    const gap = await firstItem.evaluate((item) => {
      const selected = item.querySelector('.reader-selection-text');
      const note = item.querySelector('.reader-note-input');
      if (!(selected instanceof HTMLElement) || !(note instanceof HTMLInputElement)) {
        throw new Error('Missing reader selection or note input.');
      }
      return note.getBoundingClientRect().top - selected.getBoundingClientRect().bottom;
    });
    expect(gap).toBeGreaterThan(4);
  });

  test('video timestamps align with the first text line', async ({ page }) => {
    await openSurface(page, '视频模式');
    const diffs = await measureAlignment(page, 4);

    for (const diff of diffs) {
      expect(diff).toBeLessThanOrEqual(2);
    }
  });

  test('reader and video expose a local exit confirmation popover', async ({ page }) => {
    for (const label of ['阅读模式', '视频模式']) {
      await openSurface(page, label);
      const trigger = page.locator('.surface-window-exit-trigger');
      await expect(trigger).toBeVisible();
      await trigger.click();

      const popover = page.locator('.surface-exit-popover');
      await expect(popover).toBeVisible();

      const triggerBox = await trigger.boundingBox();
      const popoverBox = await popover.boundingBox();
      expect(triggerBox).not.toBeNull();
      expect(popoverBox).not.toBeNull();
      const popoverRight = popoverBox ? popoverBox.x + popoverBox.width : 0;
      const triggerRight = triggerBox ? triggerBox.x + triggerBox.width : 0;
      expect(Math.abs(popoverRight - triggerRight)).toBeLessThanOrEqual(24);

      await page.locator('.resource-modal-overlay').click({ position: { x: 10, y: 10 } });
    }
  });

  test('video placeholder captures current time without a duplicate footer action', async ({
    page
  }) => {
    await openSurface(page, '视频模式');

    await expect(page.locator('.session-item-marker span').last()).toHaveText('+');
    await expect(page.getByRole('button', { name: '记录当前时间点' })).toHaveCount(0);
  });
});
