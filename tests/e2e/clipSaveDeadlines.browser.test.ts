import { createServer, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import {
  testWithExtension as test,
  createOptionsFixture,
  seedOptions,
  injectContentRuntime,
  EXTENSION_PATH,
  type StoredOptionsFixture
} from './utils/videoListenerScopeHarness';
import { durableNote, openRecoveryReader, recoveryDrafts } from './utils/sessionRecoveryHarness';

declare global {
  // eslint-disable-next-line no-var
  var __restDeadlineProbe: { delays: number[]; fire: () => void; restore: () => void } | undefined;
}

test('aborts a real REST request while preserving unknown Reader drafts and newer edits', async ({
  page,
  context,
  extensionPage
}, testInfo) => {
  const received: string[] = [];
  let disconnected = false;
  let pendingResponse: ServerResponse | undefined;
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      if (request.method !== 'PUT') {
        response.end('{}');
        return;
      }
      received.push(body);
      pendingResponse = response;
      // The server already accepted the note, but deliberately withholds its acknowledgement.
      response.on('close', () => {
        disconnected = true;
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Loopback server address missing');
  const endpoint = `http://127.0.0.1:${address.port}`;
  const worker = context.serviceWorkers()[0];
  if (!worker) throw new Error('Installed extension background missing');
  try {
    await seedOptions(extensionPage, createOptionsFixture());
    await extensionPage.evaluate(async (endpoint) => {
      const stored = await chrome.storage.sync.get<{ options: StoredOptionsFixture }>('options');
      await chrome.storage.sync.set({
        language: 'en',
        options: {
          ...stored.options,
          rest: {
            baseUrl: endpoint,
            httpUrl: endpoint,
            httpsUrl: '',
            vault: 'DeadlineTest',
            apiKey: 'synthetic'
          },
          vaultRouter: {
            defaultVaultId: 'default',
            vaults: [
              {
                id: 'default',
                name: 'Deadline Test',
                vault: 'DeadlineTest',
                enabled: true,
                isDefault: true,
                httpUrl: endpoint,
                httpsUrl: '',
                apiKey: 'synthetic',
                rules: []
              }
            ],
            rules: []
          },
          classifier: { enabled: false },
          templates: { reading: 'Reading/{title}.md' }
        }
      });
    }, endpoint);
    const url = 'https://network-deadline.test/reader';
    const tabId = await openRecoveryReader(page, extensionPage, url);
    await expect(page.locator('#aiob-reader-panel .export-destination-row')).toContainText(
      'Deadline Test'
    );
    await durableNote(page, extensionPage, 'The remote may already contain this note');
    await worker.evaluate(() => {
      const original = globalThis.setTimeout.bind(globalThis);
      const delays: number[] = [];
      let fire: () => void = () => {
        throw new Error('REST deadline callback was not captured');
      };
      // Fault injection invokes the production timer callback; unit fake-clock checks cover 120s.
      Object.defineProperty(globalThis, 'setTimeout', {
        configurable: true,
        value: (...args: Parameters<typeof setTimeout>) => {
          const [handler, delay] = args;
          if (typeof delay === 'number' && delay > 110_000 && delay <= 120_000) {
            delays.push(delay);
            fire = () => handler();
          }
          return original(...args);
        }
      });
      globalThis.__restDeadlineProbe = {
        delays,
        fire: () => fire(),
        restore: () =>
          Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value: original })
      };
    });
    await page.locator('[data-action-id="reader:finish"]').click();
    await expect.poll(() => received.length).toBe(1);
    expect(received[0]).toContain('The remote may already contain this note');
    const delays = await worker.evaluate(() => globalThis.__restDeadlineProbe?.delays);
    expect(delays).toHaveLength(1);
    expect(delays?.[0]).toBeGreaterThan(110_000);
    expect(delays?.[0]).toBeLessThanOrEqual(120_000);
    await worker.evaluate(() => globalThis.__restDeadlineProbe?.fire());
    await expect.poll(() => disconnected).toBe(true);
    await expect(page.locator('[data-session-export-notice="reader"]')).toContainText('unknown');
    await expect
      .poll(async () => JSON.stringify(await recoveryDrafts(extensionPage, url)))
      .toContain('"outcome":"unknown"');
    await durableNote(page, extensionPage, 'A newer edit survives the cancelled request');
    pendingResponse?.end('{}');
    await page.reload();
    await injectContentRuntime(extensionPage, tabId);
    await expect(page.locator('[data-session-export-notice="reader"]')).toContainText('unknown');
    await expect(page.locator('[data-highlight-input]').first()).toHaveValue(
      'A newer edit survives the cancelled request'
    );
    await page.locator('[data-action-id="reader:finish"]').click();
    await page.locator('[data-export-recovery="confirm-saved"]').click();
    await expect(page.locator('[data-session-export-notice="reader"]')).toContainText('changed');
    await expect(page.locator('[data-highlight-input]').first()).toHaveValue(
      'A newer edit survives the cancelled request'
    );
    expect(received).toHaveLength(1);
    expect(JSON.stringify(await recoveryDrafts(extensionPage, url))).toContain(
      'A newer edit survives the cancelled request'
    );
    const identity = await extensionPage.evaluate(() => {
      const manifest = chrome.runtime.getManifest();
      return {
        id: chrome.runtime.id,
        version: manifest.version,
        background:
          manifest.background && 'service_worker' in manifest.background
            ? manifest.background.service_worker
            : undefined
      };
    });
    if (!identity.background) throw new Error('Loaded background identity missing');
    const evidencePath = testInfo.outputPath('rest-deadline-evidence.json');
    await writeFile(
      evidencePath,
      JSON.stringify(
        {
          ...identity,
          backgroundSha256: createHash('sha256')
            .update(await readFile(path.join(EXTENSION_PATH, identity.background)))
            .digest('hex'),
          injectedDeadlineDelaysMs: delays,
          receivedRequests: received.length,
          disconnected,
          fixture: 'self-owned loopback; production deadline callback injected after actual PUT',
          draftAfterReload: await recoveryDrafts(extensionPage, url)
        },
        null,
        2
      )
    );
    await testInfo.attach('rest-deadline-evidence', {
      contentType: 'application/json',
      path: evidencePath
    });
    const screenshotPath = testInfo.outputPath('unknown-draft-newer-edit.png');
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach('unknown-draft-newer-edit', {
      contentType: 'image/png',
      path: screenshotPath
    });
  } finally {
    await worker.evaluate(() => globalThis.__restDeadlineProbe?.restore()).catch(() => undefined);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
