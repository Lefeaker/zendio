import { expect, type Locator } from '@playwright/test';

export async function expectSchemaRuntimeSurface(surface: Locator): Promise<void> {
  await expect(surface.locator('.resource-modal-stack')).toHaveCount(1);
  await expect(surface.locator('.surface-window')).toHaveCount(1);
  await expect(
    surface.locator('.surface-window-header, .clipper-header, .task-success-header')
  ).toHaveCount(1);
  await expect(
    surface.locator('.surface-window-body, .clipper-body, .task-success-body')
  ).toHaveCount(1);
}

export async function expectNoLegacyRuntimeSurface(surface: Locator): Promise<void> {
  await expect(surface.locator('.reader-dialog-content')).toHaveCount(0);
  await expect(surface.locator('.video-dialog-content')).toHaveCount(0);
  await expect(surface.locator('.clipper-dialog-shell')).toHaveCount(0);
  await expect(surface.locator('[data-role="support-link"]')).toHaveCount(0);
}
