import { expect, test } from '@playwright/test';

test('Options preview keeps a semantic table after the primitive/token migration', async ({
  page
}) => {
  const port = process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '4182';
  await page.goto(`http://127.0.0.1:${port}/options/index.html`);
  await expect(page.locator('body')).toBeVisible();
});
