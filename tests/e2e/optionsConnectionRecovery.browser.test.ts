import { chromium, expect, test, type Page } from '@playwright/test';
import { createServer, type ServerResponse } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const extensionPath = path.resolve(process.env.PLAYWRIGHT_DIST_DIR ?? 'build/dist');
const serviceStatus = { status: 'OK', service: 'Obsidian Local REST API', authenticated: true };
type Mode = 'valid' | 'html' | 'unauthenticated' | 'headers' | 'body' | 'held';
declare global {
  interface Window {
    connectionGate?: { intercepted: number; release(): void };
  }
}

async function setup() {
  let mode: Mode = 'valid';
  const requests: Array<{ method: string | undefined; url: string | undefined }> = [];
  const pending: ServerResponse[] = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', mode === 'html' ? 'text/html' : 'application/json');
    if (mode === 'headers' || mode === 'held') {
      pending.push(response);
      return;
    }
    if (mode === 'body') {
      response.write('{"status":');
      pending.push(response);
      return;
    }
    response.end(
      mode === 'html'
        ? '<html>Other local server</html>'
        : JSON.stringify({ ...serviceStatus, authenticated: mode !== 'unauthenticated' })
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing loopback listener');
  const endpoint = `http://127.0.0.1:${address.port}`;
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'zendio-connection-recovery-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });
  const background = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await background.evaluate(async (httpUrl) => {
    await chrome.storage.sync.set({
      language: 'en',
      options: {
        rest: {
          baseUrl: httpUrl,
          httpUrl,
          httpsUrl: '',
          apiKey: 'connection-test-only-key',
          vault: 'Probe Vault'
        },
        vaultRouter: {
          defaultVaultId: 'probe',
          vaults: [
            {
              id: 'probe',
              name: 'Probe Vault',
              vault: 'Probe Vault',
              httpsUrl: '',
              httpUrl,
              apiKey: 'connection-test-only-key',
              isDefault: true,
              enabled: true
            }
          ]
        }
      }
    });
  }, endpoint);
  const page = await context.newPage();
  await page.goto(new URL('/options/index.html', background.url()).href);
  await page.locator('[data-nav-panel="storage"]').click();
  return {
    page,
    requests,
    setMode(value: Mode) {
      mode = value;
    },
    release() {
      for (const response of pending.splice(0))
        if (!response.destroyed) response.end(JSON.stringify(serviceStatus));
    },
    async close() {
      await context.close();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
      await rm(userDataDir, { recursive: true, force: true });
    }
  };
}

const button = (page: Page) => page.locator('[data-action-id="storage:testConnection"]');
const notice = (page: Page) => page.locator('[data-panel-id="storage"] .notice');

async function expectSuccess(page: Page) {
  await expect(notice(page)).toHaveClass(/success/);
  await expect(notice(page)).toContainText('✅ REST API (HTTP)');
  await expect(button(page)).toBeEnabled();
}

test('installed Options rejects unrelated/unauthenticated servers and recovers from HTTP headers/body stalls', async () => {
  const harness = await setup();
  try {
    for (const mode of ['html', 'unauthenticated', 'headers', 'body'] as const) {
      harness.setMode(mode);
      const before = harness.requests.length;
      await button(harness.page).click();
      await expect.poll(() => harness.requests.length).toBeGreaterThan(before);
      await expect(notice(harness.page)).toHaveClass(/danger/, { timeout: 22_000 });
      await expect(notice(harness.page)).toContainText(
        mode === 'headers' || mode === 'body' ? 'REQUEST_TIMEOUT' : 'Obsidian Local REST API'
      );
      await expect(button(harness.page)).toBeEnabled();
      harness.setMode('valid');
      await button(harness.page).click();
      await expectSuccess(harness.page);
    }
    expect(harness.requests.every(({ method, url }) => method === 'GET' && url === '/')).toBe(true);
    await harness.page.screenshot({ path: test.info().outputPath('connection-recovered.png') });
  } finally {
    await harness.close();
  }
});

test('installed Options expires a hung message channel and ignores its reply after a successful retry', async () => {
  const harness = await setup();
  try {
    // Replace only the browser message transport before its production adapter captures it.
    await harness.page.addInitScript(() => {
      const original = chrome.runtime.sendMessage;
      let held: ((response: object) => void) | undefined;
      let intercepted = 0;
      Object.defineProperty(chrome.runtime, 'sendMessage', {
        configurable: true,
        value: (message: { type?: string }, callback?: (response: object) => void) => {
          if (message.type === 'TEST_VAULT_CONNECTION' && intercepted === 0) {
            intercepted += 1;
            held = callback;
            return new Promise(() => {});
          }
          Reflect.apply(original, chrome.runtime, callback ? [message, callback] : [message]);
        }
      });
      window.connectionGate = {
        get intercepted() {
          return intercepted;
        },
        release() {
          held?.({ success: false, message: '', error: 'obsolete-message-reply' });
        }
      };
    });
    await harness.page.reload();
    await harness.page.locator('[data-nav-panel="storage"]').click();
    await button(harness.page).click();
    await expect
      .poll(() => harness.page.evaluate(() => window.connectionGate?.intercepted))
      .toBe(1);
    await expect(notice(harness.page)).toContainText('REQUEST_TIMEOUT', { timeout: 28_000 });
    expect(harness.requests).toHaveLength(0);
    await button(harness.page).click();
    await expectSuccess(harness.page);
    const current = await notice(harness.page).textContent();
    await harness.page.evaluate(() => window.connectionGate?.release());
    await harness.page.waitForTimeout(100);
    expect(await notice(harness.page).textContent()).toBe(current);
  } finally {
    await harness.close();
  }
});

test('installed Options discards an in-flight result after the tested Vault is edited', async () => {
  const harness = await setup();
  try {
    harness.setMode('held');
    await button(harness.page).click();
    await expect.poll(() => harness.requests.length).toBe(1);
    const name = harness.page
      .locator('.storage-vault-table-scroll tbody tr input[type="text"]')
      .first();
    await name.fill('New draft');
    await name.fill('Probe Vault');
    const before = await notice(harness.page).textContent();
    harness.release();
    await harness.page.waitForTimeout(150);
    expect(await notice(harness.page).textContent()).toBe(before);
    harness.setMode('valid');
    await button(harness.page).click();
    await expectSuccess(harness.page);
    await expect(name).toHaveValue('Probe Vault');
  } finally {
    await harness.close();
  }
});
