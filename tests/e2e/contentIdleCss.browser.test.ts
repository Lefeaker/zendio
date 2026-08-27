import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const extensionPath = path.resolve(process.env.PLAYWRIGHT_DIST_DIR ?? 'build/dist');

test('idle content loads zero packs and the first feature requests one exact flattened pack', async () => {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'zendio-u03-content-css-'));
  let context: BrowserContext | null = null;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });
    const background = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id');
    const packRequests: string[] = [];
    context.on('request', (request) => {
      if (request.url().includes('/ui/stitch-runtime/styles/')) packRequests.push(request.url());
    });
    const page = await context.newPage();
    const port = process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '43103';
    await page.goto(`http://127.0.0.1:${port}/manifest.json`, {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForTimeout(250);
    expect(packRequests).toEqual([]);

    const packUrl = `chrome-extension://${extensionId}/ui/stitch-runtime/styles/clipper.css`;
    const css = await page.evaluate(async (url) => (await fetch(url)).text(), packUrl);
    expect(css).not.toMatch(/^\s*@import\b/m);
    expect(packRequests).toEqual([packUrl]);
  } finally {
    await context?.close();
  }
});
