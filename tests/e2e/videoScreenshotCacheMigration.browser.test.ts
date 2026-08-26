import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  readVideoScreenshotCacheIndexedDbSnapshot,
  seedVideoScreenshotCacheV1,
  type VideoScreenshotCacheIndexedDbSnapshot,
  type VideoScreenshotCacheV1Seed
} from './utils/videoScreenshotCacheIndexedDb';

const EXTENSION_PATH = path.resolve(process.env.PLAYWRIGHT_DIST_DIR ?? 'build/dist');
const HARNESS_PATH = 'content-orchestrator-harness.html';
const MESSAGE_TYPE = 'AIIOB_VIDEO_SCREENSHOT_CACHE';

type ExtensionHarness = { context: BrowserContext; page: Page; extensionId: string };

async function launchExtension(userDataDir: string): Promise<ExtensionHarness> {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`
    ]
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15_000 });
  const extensionId = worker.url().split('/')[2];
  if (!extensionId) throw new Error(`Unable to resolve extension id from ${worker.url()}.`);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${HARNESS_PATH}`, {
    waitUntil: 'domcontentloaded'
  });
  return { context, page, extensionId };
}

async function sendCacheMessage(page: Page, message: object): Promise<unknown> {
  return page.evaluate((payload) => chrome.runtime.sendMessage(payload), message);
}

function expectedStores(includeMetadata: boolean): VideoScreenshotCacheIndexedDbSnapshot['stores'] {
  const stores: VideoScreenshotCacheIndexedDbSnapshot['stores'] = [
    {
      name: 'entries',
      keyPath: 'key',
      autoIncrement: false,
      indexes: [
        {
          name: 'byExpiresAt',
          keyPath: 'expiresAt',
          unique: false,
          multiEntry: false
        },
        {
          name: 'byPageCapture',
          keyPath: ['pageKey', 'captureId'],
          unique: false,
          multiEntry: false
        },
        { name: 'byPageKey', keyPath: 'pageKey', unique: false, multiEntry: false },
        { name: 'byUpdatedAt', keyPath: 'updatedAt', unique: false, multiEntry: false }
      ]
    }
  ];
  if (includeMetadata) {
    stores.push({
      name: 'metadata',
      keyPath: 'id',
      autoIncrement: false,
      indexes: []
    });
  }
  return stores;
}

function expectedSnapshot(
  fixture: VideoScreenshotCacheV1Seed,
  lastPrunedAt?: number | null
): VideoScreenshotCacheIndexedDbSnapshot {
  const migrated = lastPrunedAt !== undefined;
  return {
    version: migrated ? 2 : 1,
    stores: expectedStores(migrated),
    entry: {
      schemaVersion: fixture.schemaVersion,
      key: fixture.key,
      pageKey: fixture.pageKey,
      captureId: fixture.captureId,
      id: fixture.id,
      fileName: fixture.fileName,
      mimeType: fixture.mimeType,
      byteLength: fixture.blobBytes.length,
      capturedAt: fixture.capturedAt,
      createdAt: fixture.createdAt,
      updatedAt: fixture.updatedAt,
      expiresAt: fixture.expiresAt,
      blob: {
        type: fixture.mimeType,
        size: fixture.blobBytes.length,
        bytes: fixture.blobBytes
      }
    },
    metadataRecords: migrated
      ? [{ id: 'maintenance', schemaVersion: 2, lastPrunedAt: lastPrunedAt ?? null }]
      : []
  };
}

function expectedLoadResponse(fixture: VideoScreenshotCacheV1Seed) {
  return {
    success: true,
    operation: 'load',
    status: 'loaded',
    screenshot: {
      id: fixture.id,
      fileName: fixture.fileName,
      mimeType: fixture.mimeType,
      capturedAt: fixture.capturedAt,
      content: {
        encoding: 'base64',
        data: Buffer.from(fixture.blobBytes).toString('base64'),
        byteLength: fixture.blobBytes.length
      }
    }
  };
}

function createLoadMessage(fixture: VideoScreenshotCacheV1Seed) {
  return {
    type: MESSAGE_TYPE,
    operation: 'load',
    ref: {
      schemaVersion: 1,
      key: fixture.key,
      pageKey: fixture.pageKey,
      captureId: fixture.captureId,
      id: fixture.id,
      fileName: fixture.fileName,
      mimeType: fixture.mimeType,
      byteLength: fixture.blobBytes.length,
      capturedAt: fixture.capturedAt,
      expiresAt: fixture.expiresAt
    }
  };
}

test('upgrades a persistent populated v1 cache to v2 without changing Blob bytes', async () => {
  const userDataDir = await fs.mkdtemp(path.join(tmpdir(), 'zendio-idb-v1-v2-'));
  const now = Date.now();
  const fixture: VideoScreenshotCacheV1Seed = {
    schemaVersion: 1,
    key: 'aiob.videoScreenshotCache.v1.migration-page.migration-capture.migration-shot',
    pageKey: 'migration-page',
    captureId: 'migration-capture',
    id: 'migration-shot',
    fileName: 'migration-shot.jpg',
    mimeType: 'image/jpeg',
    capturedAt: now - 1_000,
    createdAt: now - 900,
    updatedAt: now - 800,
    expiresAt: now + 86_400_000,
    blobBytes: [0, 255, 1, 128, 127, 13, 10, 66]
  };
  let harness: ExtensionHarness | null = null;

  try {
    harness = await launchExtension(userDataDir);
    const initialExtensionId = harness.extensionId;
    await seedVideoScreenshotCacheV1(harness.page, fixture);
    expect(await readVideoScreenshotCacheIndexedDbSnapshot(harness.page, fixture.key)).toEqual(
      expectedSnapshot(fixture)
    );
    await harness.context.close();
    harness = null;

    harness = await launchExtension(userDataDir);
    expect(harness.extensionId).toBe(initialExtensionId);
    const expectedLoad = expectedLoadResponse(fixture);
    expect(await sendCacheMessage(harness.page, createLoadMessage(fixture))).toEqual(expectedLoad);
    expect(await readVideoScreenshotCacheIndexedDbSnapshot(harness.page, fixture.key)).toEqual(
      expectedSnapshot(fixture, null)
    );

    const beforePrune = Date.now();
    expect(
      await sendCacheMessage(harness.page, { type: MESSAGE_TYPE, operation: 'pruneExpired' })
    ).toEqual({ success: true, operation: 'pruneExpired' });
    const afterPrune = Date.now();
    const pruned = await readVideoScreenshotCacheIndexedDbSnapshot(harness.page, fixture.key);
    const persistedTimestamp = pruned.metadataRecords[0]?.lastPrunedAt;
    if (typeof persistedTimestamp !== 'number') {
      throw new Error('Expected prune to persist a maintenance timestamp.');
    }
    expect(persistedTimestamp).toBeGreaterThanOrEqual(beforePrune);
    expect(persistedTimestamp).toBeLessThanOrEqual(afterPrune);
    expect(pruned).toEqual(expectedSnapshot(fixture, persistedTimestamp));

    await harness.context.close();
    harness = null;
    harness = await launchExtension(userDataDir);
    expect(harness.extensionId).toBe(initialExtensionId);
    expect(await sendCacheMessage(harness.page, createLoadMessage(fixture))).toEqual(expectedLoad);
    expect(await readVideoScreenshotCacheIndexedDbSnapshot(harness.page, fixture.key)).toEqual(
      expectedSnapshot(fixture, persistedTimestamp)
    );
  } finally {
    await harness?.context.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});
