import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const extensionPath = path.resolve(process.env.PLAYWRIGHT_DIST_DIR ?? 'build/dist');
const sharedPageUrl = 'https://session-draft.test/shared-owner';
const draftPrefix = 'aiob.sessionDraft';
const indexKey = `${draftPrefix}.index.v1`;

type StoredDraft = {
  status?: string;
  lease?: {
    leaseId?: string;
    owner?: { tabId?: number };
    renewedAt?: number;
    leaseExpiresAt?: number;
  };
  payload?: { commentDrafts?: Record<string, string> };
};

type SessionDraftIndex = {
  receipts?: Array<{ requestId?: string }>;
};

type StoredSnapshot = {
  draft: StoredDraft;
  index: SessionDraftIndex;
};

type ClaimResult = {
  outcome?: string;
  code?: string;
  selectionReason?: string;
  envelope?: StoredDraft;
};
type UntrustedValue = unknown;

async function closeReader(page: Page): Promise<void> {
  await page.locator('[data-role="close-btn"]').click();
  await expect(page.locator('[data-stitch-surface="reader"]')).toHaveCount(0);
}

async function startContentReader(
  page: Page,
  extensionPage: Page,
  context: BrowserContext,
  pageUrl: string
): Promise<number> {
  await context.route(pageUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<main><p id="content">Mounted owner liveness fixture text.</p></main>'
    })
  );
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
  const tabTitle = `Session draft owner ${crypto.randomUUID()}`;
  await page.evaluate((title) => {
    document.title = title;
  }, tabTitle);
  const tabId = await extensionPage.evaluate(async (title) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.title === title)?.id ?? null;
  }, tabTitle);
  if (typeof tabId !== 'number') throw new Error('Unable to resolve mounted owner tab.');
  await extensionPage.evaluate(async (targetTabId) => {
    await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      files: ['content/index.js']
    });
  }, tabId);
  await page.evaluate(() => {
    const node = document.getElementById('content')?.firstChild;
    if (!(node instanceof Text)) throw new Error('Missing mounted owner selection text.');
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await extensionPage.evaluate(
        async (targetTabId) => chrome.tabs.sendMessage(targetTabId, { action: 'clipSelection' }),
        tabId
      );
      break;
    } catch (error) {
      if (attempt === 4) throw error;
      await extensionPage.waitForTimeout(200);
    }
  }
  const readerAction = page.locator(
    '[data-stitch-surface="clipper"] button[data-action-id="reader"]'
  );
  await expect(readerAction).toBeVisible({ timeout: 10_000 });
  await readerAction.click();
  await expect(page.locator('[data-stitch-surface="reader"]')).toHaveCount(1, {
    timeout: 10_000
  });
  return tabId;
}

async function activeDrafts(page: Page): Promise<Array<{ key: string; draft: StoredDraft }>> {
  return page.evaluate(
    async ({ prefix, index }) => {
      const storage = await chrome.storage.local.get(null);
      return Object.entries(storage)
        .filter(([key]) => key.startsWith(`${prefix}.v1.`) && key !== index)
        .filter((entry): entry is [string, StoredDraft] => {
          const value = entry[1];
          return (
            typeof value === 'object' &&
            value !== null &&
            ('status' in value || 'payload' in value || 'lease' in value)
          );
        })
        .map(([key, draft]) => ({ key, draft }))
        .filter(({ draft }) => draft.status === 'active');
    },
    { prefix: draftPrefix, index: indexKey }
  );
}

async function captureAndExpireLease(page: Page, key: string): Promise<StoredSnapshot> {
  return page.evaluate(
    async ({ key: draftKey, index }) => {
      const values = await chrome.storage.local.get([draftKey, index]);
      const draft = values[draftKey];
      const storedIndex = values[index];
      const isDraft = (value: UntrustedValue): value is StoredDraft =>
        typeof value === 'object' && value !== null;
      const isIndex = (value: UntrustedValue): value is SessionDraftIndex =>
        typeof value === 'object' &&
        value !== null &&
        (!('receipts' in value) || Array.isArray(value.receipts));
      if (
        !isDraft(draft) ||
        !draft.lease ||
        typeof draft.lease.leaseId !== 'string' ||
        !isIndex(storedIndex)
      ) {
        throw new Error('Expected an active v2 draft with an index.');
      }
      const now = Date.now();
      const expired = {
        ...draft,
        lease: {
          ...draft.lease,
          renewedAt: now - 60_000,
          leaseExpiresAt: now - 30_000
        }
      };
      await chrome.storage.local.set({ [draftKey]: expired });
      return { draft, index: storedIndex };
    },
    { key, index: indexKey }
  );
}

async function restoreStoredSnapshot(
  page: Page,
  key: string,
  snapshot: StoredSnapshot
): Promise<void> {
  await page.evaluate(
    async ({ key: draftKey, index, snapshot: value }) => {
      await chrome.storage.local.set({ [draftKey]: value.draft, [index]: value.index });
    },
    { key, index: indexKey, snapshot }
  );
}

async function claimExpiredReaderDraft(
  extensionPage: Page,
  tabId: number,
  pageUrl: string
): Promise<ClaimResult> {
  return extensionPage.evaluate(
    async ({ targetTabId, url, requestId }) => {
      const [execution] = await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        world: 'ISOLATED',
        func: async (pageUrl, id): Promise<ClaimResult> =>
          chrome.runtime.sendMessage({
            type: 'AIIOB_SESSION_DRAFT_V2',
            request: { operation: 'selectAndClaim', requestId: id, mode: 'reader', pageUrl }
          }),
        args: [url, requestId]
      });
      if (!execution?.result) throw new Error('Missing native content claim result.');
      return execution.result;
    },
    { targetTabId: tabId, url: pageUrl, requestId: `browser-claim-${crypto.randomUUID()}` }
  );
}

test.describe('session draft browser concurrency', () => {
  let context: BrowserContext;
  let first: Page;
  let second: Page;
  let extensionPage: Page;
  let secondTabId: number;
  let userDataDir: string;

  test.beforeEach(async () => {
    userDataDir = await mkdtemp(path.join(tmpdir(), 'aiiob-s02-concurrency-'));
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });
    let background = context.serviceWorkers()[0];
    background ??= await context.waitForEvent('serviceworker', { timeout: 15_000 });
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');
    extensionPage = await context.newPage();
    await extensionPage.goto(`chrome-extension://${extensionId}/options/index.html`, {
      waitUntil: 'domcontentloaded'
    });
    first = await context.newPage();
    second = await context.newPage();
    await extensionPage.evaluate(async (prefix) => {
      const values = await chrome.storage.local.get(null);
      const keys = Object.keys(values).filter((key) => key.startsWith(prefix));
      if (keys.length > 0) await chrome.storage.local.remove(keys);
    }, draftPrefix);
    await startContentReader(first, extensionPage, context, sharedPageUrl);
    await expect.poll(async () => (await activeDrafts(extensionPage)).length).toBe(1);
    secondTabId = await startContentReader(second, extensionPage, context, sharedPageUrl);
  });

  test.afterEach(async () => {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  });

  test('keeps concurrent owners isolated and terminal cleanup exact', async () => {
    const firstInput = first.locator('[data-highlight-input]').first();
    const secondInput = second.locator('[data-highlight-input]').first();
    await Promise.all([
      firstInput.fill('concurrent note A'),
      secondInput.fill('concurrent note B')
    ]);

    await expect
      .poll(
        async () => {
          const drafts = await activeDrafts(extensionPage);
          const serialized = JSON.stringify(drafts);
          return {
            count: drafts.length,
            hasFirstComment: serialized.includes('concurrent note A'),
            hasSecondComment: serialized.includes('concurrent note B')
          };
        },
        { timeout: 10_000 }
      )
      .toEqual({ count: 2, hasFirstComment: true, hasSecondComment: true });
    const before = await activeDrafts(extensionPage);
    expect(new Set(before.map(({ key }) => key)).size).toBe(2);
    expect(new Set(before.map(({ draft }) => draft.lease?.owner?.tabId)).size).toBe(2);

    const requestIds = await extensionPage.evaluate(async (key) => {
      const value = await chrome.storage.local.get(key);
      const candidate = value[key];
      const isIndex = (entry: UntrustedValue): entry is SessionDraftIndex =>
        typeof entry === 'object' &&
        entry !== null &&
        (!('receipts' in entry) || Array.isArray(entry.receipts));
      const index = isIndex(candidate) ? candidate : undefined;
      return (index?.receipts ?? [])
        .map((receipt) => receipt.requestId)
        .filter((id): id is string => typeof id === 'string');
    }, indexKey);
    expect(requestIds.length).toBeGreaterThanOrEqual(2);
    expect(new Set(requestIds).size).toBe(requestIds.length);

    await closeReader(first);
    await expect
      .poll(async () => (await activeDrafts(extensionPage)).length, { timeout: 10_000 })
      .toBe(1);
    await expect(secondInput).toHaveValue('concurrent note B');
    expect(JSON.stringify(await activeDrafts(extensionPage))).toContain('concurrent note B');

    await closeReader(second);
    await expect
      .poll(async () => (await activeDrafts(extensionPage)).length, { timeout: 10_000 })
      .toBe(0);
  });

  test('reclaims an expired owner after its tab navigates while remaining open', async () => {
    await closeReader(second);
    await expect
      .poll(async () => (await activeDrafts(extensionPage)).length, { timeout: 10_000 })
      .toBe(1);
    const firstInput = first.locator('[data-highlight-input]').first();
    await firstInput.fill('navigation reclaim note');
    await expect
      .poll(async () => (await activeDrafts(extensionPage)).length, { timeout: 10_000 })
      .toBe(1);

    const [{ key, draft }] = await activeDrafts(extensionPage);
    expect(draft.lease?.owner?.tabId).toBeDefined();
    const snapshot = await captureAndExpireLease(extensionPage, key);

    await first.goto('about:blank', { waitUntil: 'domcontentloaded' });
    expect(first.isClosed()).toBe(false);
    await restoreStoredSnapshot(extensionPage, key, snapshot);
    await captureAndExpireLease(extensionPage, key);

    const result = await claimExpiredReaderDraft(extensionPage, secondTabId, second.url());
    expect(result).toMatchObject({
      outcome: 'claimed',
      selectionReason: 'expired_owner_inactive'
    });
    expect(result.envelope?.lease?.leaseId).toBeDefined();
    expect(result.envelope?.lease?.owner?.tabId).not.toBe(draft.lease?.owner?.tabId);
  });

  test('does not reclaim a throttled-but-mounted exact lease', async () => {
    await closeReader(second);
    await closeReader(first);
    await expect
      .poll(async () => (await activeDrafts(extensionPage)).length, { timeout: 10_000 })
      .toBe(0);
    const pageUrl = 'https://session-draft.test/mounted-owner';
    await startContentReader(first, extensionPage, context, pageUrl);
    const firstInput = first.locator('[data-highlight-input]').first();
    await firstInput.fill('mounted lease note');
    await expect
      .poll(async () => (await activeDrafts(extensionPage)).length, { timeout: 10_000 })
      .toBe(1);

    const [{ key, draft }] = await activeDrafts(extensionPage);
    await captureAndExpireLease(extensionPage, key);

    const result = await claimExpiredReaderDraft(extensionPage, secondTabId, pageUrl);
    expect(result).toEqual({ outcome: 'conflict', code: 'OWNER_ACTIVE' });

    const [persisted] = await activeDrafts(extensionPage);
    expect(persisted.key).toBe(key);
    expect(persisted.draft.lease?.leaseId).toBe(draft.lease?.leaseId);
    expect(persisted.draft.lease?.owner?.tabId).toBe(draft.lease?.owner?.tabId);
  });
});
