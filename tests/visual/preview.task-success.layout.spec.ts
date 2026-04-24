import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { PREVIEW_STITCH_SECONDARY_INDEX_URL } from './utils/renderProductionOptionsShell';

function getExpectedTaskWidth(viewportWidth: number) {
  if (viewportWidth <= 430) {
    return { min: 320, max: 360 };
  }
  return { min: 470, max: 490 };
}

async function openTaskSuccess(page: Page) {
  await page.goto(PREVIEW_STITCH_SECONDARY_INDEX_URL);
  await page.locator('.footer-link').filter({ hasText: '任务完成' }).click();
  await page.waitForSelector('.resource-modal-overlay');
}

test.describe('preview task success layout', () => {
  test('task success uses the narrower production-width modal', async ({ page }) => {
    await openTaskSuccess(page);

    const modalBox = await page.locator('.resource-modal--task-success').boundingBox();
    const viewport = page.viewportSize();
    const expectedWidth = getExpectedTaskWidth(viewport?.width ?? 0);
    expect(modalBox).not.toBeNull();
    expect(modalBox?.width ?? 0).toBeGreaterThanOrEqual(expectedWidth.min);
    expect(modalBox?.width ?? 0).toBeLessThanOrEqual(expectedWidth.max);
  });

  test('task success preserves the stitch secondary shell section order', async ({ page }) => {
    await openTaskSuccess(page);

    const bodyOrder = await page
      .locator('.task-success-body > *')
      .evaluateAll((sections): string[] =>
        sections.map((section) => (section instanceof HTMLElement ? section.className : ''))
      );
    const toastCardOrder = await page
      .locator('.toast-preview-stack > *')
      .evaluateAll((cards): string[] =>
        cards.map((card) => (card instanceof HTMLElement ? card.className : ''))
      );

    expect(bodyOrder).toEqual(['task-support-strip', 'task-feedback-card', 'toast-preview-stack']);
    expect(toastCardOrder).toEqual(['toast-preview-card', 'toast-preview-card']);
  });

  test('support and feedback rows use the full modal width', async ({ page }) => {
    await openTaskSuccess(page);

    const windowBox = await page.locator('.task-success-window').boundingBox();
    const supportBox = await page.locator('.task-support-strip').boundingBox();
    const feedbackBox = await page.locator('.task-feedback-card').boundingBox();

    expect(windowBox).not.toBeNull();
    expect(supportBox).not.toBeNull();
    expect(feedbackBox).not.toBeNull();
    expect(Math.abs((supportBox?.width ?? 0) - (windowBox?.width ?? 0))).toBeLessThanOrEqual(2);
    expect(Math.abs((feedbackBox?.width ?? 0) - (windowBox?.width ?? 0))).toBeLessThanOrEqual(2);
  });

  test('support links show logos without generic open labels', async ({ page }) => {
    await openTaskSuccess(page);

    await expect(page.locator('.task-support-link')).toHaveCount(2);
    await expect(page.locator('.task-support-link img')).toHaveCount(2);
    await expect(page.locator('.task-support-link').filter({ hasText: '打开' })).toHaveCount(0);

    const logoFilters = await page
      .locator('.task-support-link img')
      .evaluateAll((logos) => logos.map((logo) => getComputedStyle(logo).filter));
    expect(logoFilters.every((filter) => filter && filter !== 'none')).toBe(true);
  });

  test('status and dismiss copy move into section headers', async ({ page }) => {
    await openTaskSuccess(page);

    await expect(page.locator('.task-header-status')).toHaveText('成功发送到 Research Vault');
    await expect(page.locator('.task-feedback-dismiss')).toHaveText('点击页面其他区域即可关闭');
    await expect(page.locator('.task-success-window')).not.toContainText('success');
    await expect(page.locator('.task-success-window')).not.toContainText('Articles/Research/2026');
  });

  test('toast actions stay on one row and cards match the modal width', async ({ page }) => {
    await openTaskSuccess(page);

    const windowBox = await page.locator('.task-success-window').boundingBox();
    const toastCards = page.locator('.toast-preview-card');
    await expect(toastCards).toHaveCount(2);

    for (let index = 0; index < 2; index += 1) {
      const cardBox = await toastCards.nth(index).boundingBox();
      expect(cardBox).not.toBeNull();
      expect(Math.abs((cardBox?.width ?? 0) - (windowBox?.width ?? 0))).toBeLessThanOrEqual(2);

      const buttons = toastCards.nth(index).locator('.toast-action-list button');
      await expect(buttons).toHaveCount(2);
      const first = await buttons.nth(0).boundingBox();
      const second = await buttons.nth(1).boundingBox();
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(Math.abs((first?.y ?? 0) - (second?.y ?? 0))).toBeLessThanOrEqual(2);
    }
  });
});
