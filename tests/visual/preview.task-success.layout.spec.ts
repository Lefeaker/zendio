import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '4181'}`;
const GENERATED_TASK_SUCCESS_PREVIEW_ROOT = resolve(
  process.cwd(),
  '..',
  '.tmp/preview-task-success-layout/options-component-preview'
);
const GENERATED_TASK_SUCCESS_PREVIEW_URL = pathToFileURL(
  resolve(GENERATED_TASK_SUCCESS_PREVIEW_ROOT, 'index.html')
).toString();

test.describe('Stitch task success surface layout', () => {
  test.beforeAll(() => {
    execFileSync(
      process.execPath,
      [
        resolve(process.cwd(), 'scripts/build-preview.mjs'),
        '--outdir',
        GENERATED_TASK_SUCCESS_PREVIEW_ROOT
      ],
      {
        cwd: process.cwd(),
        stdio: 'inherit'
      }
    );
  });

  test('preview task-success schema exposes the Stitch prompt structure', async ({ page }) => {
    await page.goto(GENERATED_TASK_SUCCESS_PREVIEW_URL);
    await page.waitForSelector('.app');

    await page.locator('[data-footer-panel="task-success"]').click();

    const modal = page.locator('.resource-modal').first();
    await expect(modal).toHaveClass(/resource-modal--task-success/);
    await expect(page.locator('.task-success-window')).toBeVisible();
    await expect(page.locator('.task-success-body')).toBeVisible();
    await expect(page.locator('[data-role="task-progress"]')).toHaveCount(1);
    await expect(page.locator('.task-support-link')).toHaveCount(2);
    await expect(page.locator('.task-support-strip')).not.toContainText('GitHub');
    await expect(page.locator('.task-feedback-card')).toBeVisible();
    await expect(page.locator('.toast-preview-stack')).toHaveCount(0);
    await expect(page.locator('.prompt-toast.like')).toHaveCount(0);
    await expect(page.locator('.prompt-toast.dislike')).toHaveCount(0);
  });

  test('production support prompt mounts the task-success Stitch runtime surface', async ({
    page
  }) => {
    await page.goto(`${BASE}/content-orchestrator-harness.html`);
    await expect(page.getByText('Harness ready')).toBeVisible();

    await page.getByRole('button', { name: 'Show Support Prompt' }).click();

    await expect(page.getByText('SupportPrompt mounted')).toBeVisible({ timeout: 10000 });
    const prompt = page.locator('[data-stitch-surface="task-success"]').first();
    await expect(prompt).toHaveCount(1);
    await expect(prompt).toHaveClass(/stitch-runtime-surface/);
    await expect(page.locator('.task-success-window')).toHaveCount(1);
    await expect(page.locator('.resource-modal-overlay--task-success')).toHaveCount(1);
    await expect(page.locator('.task-success-body')).toHaveCount(1);
    await expect(page.locator('[data-role="like-btn"]')).toHaveCount(1);
    await expect(page.locator('[data-role="dislike-btn"]')).toHaveCount(1);
    await expect(page.locator('.task-support-link')).toHaveCount(2);
    await expect(page.locator('.task-support-qr')).toHaveCount(0);
    const wechatReward = page.locator('[data-role="wechat-reward-btn"]').first();
    await expect(wechatReward).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(page.locator('.task-support-strip')).not.toContainText('GitHub');
    await expect(page.locator('.task-feedback-label')).toHaveCount(0);
    await expect(page.locator('.task-feedback-row [data-role="dismiss-text"]')).toHaveCount(1);
    await expect(page.locator('.toast-preview-stack')).toHaveCount(0);
    await expect(page.locator('.prompt-toast.like')).toHaveCount(0);
    await expect(page.locator('.prompt-toast.dislike')).toHaveCount(0);
    const modal = page.locator('.resource-modal--task-success').first();
    await expect(modal).toHaveClass(/floating-bottom-right/);
    const rect = await modal.boundingBox();
    const viewport = page.viewportSize();
    expect(rect).toBeTruthy();
    expect(viewport).toBeTruthy();
    if (!rect || !viewport) {
      throw new Error('missing task success modal rect');
    }
    const headerRect = await page.locator('.task-success-header').first().boundingBox();
    expect(headerRect).toBeTruthy();
    if (!headerRect) {
      throw new Error('missing task success header rect');
    }
    expect(Math.abs(rect.width - headerRect.width)).toBeLessThanOrEqual(4);
    if (viewport.width >= 640) {
      expect(rect.width).toBeLessThan(viewport.width * 0.62);
    } else {
      expect(rect.width).toBeLessThanOrEqual(viewport.width - 16);
    }
    expect(rect.x + rect.width).toBeGreaterThan(viewport.width - 48);
    expect(rect.y + rect.height).toBeGreaterThan(viewport.height - 48);

    const progressRect = await page.locator('[data-role="task-progress"]').first().boundingBox();
    const stripRect = await page.locator('.task-support-strip').first().boundingBox();
    const feedbackRect = await page.locator('.task-feedback-card').first().boundingBox();
    expect(progressRect).toBeTruthy();
    expect(stripRect).toBeTruthy();
    expect(feedbackRect).toBeTruthy();
    if (!progressRect || !stripRect || !feedbackRect) {
      throw new Error('missing task-success progress, strip, or feedback rect');
    }
    expect(Math.round(progressRect.y - (headerRect.y + headerRect.height))).toBe(0);
    expect(Math.round(stripRect.y - (progressRect.y + progressRect.height))).toBe(0);
    expect(Math.round(feedbackRect.y - (stripRect.y + stripRect.height))).toBe(0);
    expect(
      Math.round(rect.y + rect.height - (feedbackRect.y + feedbackRect.height))
    ).toBeLessThanOrEqual(2);

    await wechatReward.click();
    await expect(page.locator('.task-support-qr')).toHaveCount(0);
    const rewardToast = page.locator('.support-prompt-toast.reward-qr').first();
    await expect(rewardToast).toHaveClass(/prompt-toast/);
    await expect(rewardToast).toHaveClass(/is-visible/);
    await expect(page.locator('[data-role="wechat-reward-qr-image"]')).toHaveAttribute(
      'src',
      /icons\/wechat-reward-qr\.jpg/
    );
    const rewardToastRect = await rewardToast.boundingBox();
    expect(rewardToastRect).toBeTruthy();
    if (!rewardToastRect) {
      throw new Error('missing WeChat reward toast rect');
    }
    expect(rewardToastRect.x + rewardToastRect.width).toBeGreaterThan(viewport.width - 48);
    expect(rewardToastRect.y + rewardToastRect.height).toBeGreaterThan(viewport.height - 48);
    await page.evaluate(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    await expect(rewardToast).not.toHaveClass(/is-visible/);
    if ((await rewardToast.count()) > 0) {
      await rewardToast.evaluate((toast) => {
        toast.dispatchEvent(new Event('transitionend'));
      });
    }
    await expect(page.locator('.support-prompt-toast.reward-qr')).toHaveCount(0);

    await page.locator('[data-role="dislike-btn"]').click();
    await expect(page.locator('[data-role="github-link"]')).toHaveCount(1);
    const toast = page.locator('.support-prompt-toast.dislike').first();
    await expect(toast).toHaveClass(/prompt-toast/);
    await expect(toast).toHaveClass(/is-visible/);
    const toastRect = await toast.boundingBox();
    expect(toastRect).toBeTruthy();
    if (!toastRect) {
      throw new Error('missing dislike toast rect');
    }
    expect(Math.abs(toastRect.width - rewardToastRect.width)).toBeLessThanOrEqual(2);
    expect(toastRect.x + toastRect.width).toBeGreaterThan(viewport.width - 48);
    expect(toastRect.y + toastRect.height).toBeGreaterThan(viewport.height - 48);
  });
});
