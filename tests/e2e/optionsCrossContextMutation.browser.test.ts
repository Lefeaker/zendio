import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type Worker
} from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const extensionPath = path.resolve(process.env.PLAYWRIGHT_DIST_DIR ?? 'build/dist');
const localVaultDatabaseName = 'ai2ob-local-vault-folders';
const localVaultStoreName = 'folders';
const cleanupFolderId = 'folder-cleanup-journal';
const cleanupJournalKey = 'deviceLocalVaultCleanupJournal';

type StorageValue = chrome.storage.StorageChange['newValue'];
type JsonValue = StorageValue;
type JsonRecord = Record<string, StorageValue>;

function isJsonRecord(value: JsonValue): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type MutationResponse = {
  success?: boolean;
  errorCode?: string;
  result?: { snapshot?: JsonRecord; rawSignature?: string };
};

type PendingWrite = {
  armed: boolean;
  released: boolean;
  finished: boolean;
  callback: () => void;
};

type StorageChangeListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string
) => void;

type WriteGateState = {
  remaining: number;
  released: number;
  pending: PendingWrite[];
  listener: StorageChangeListener;
  originalSet: typeof chrome.storage.sync.set;
};

type DriftState = {
  count: number;
  writes: Promise<void>[];
  listener: StorageChangeListener;
};

async function sendPatch(
  page: Page,
  pathParts: string[],
  value: JsonValue
): Promise<MutationResponse> {
  return sendPatches(page, [{ path: pathParts, value }]);
}

async function sendPatches(
  page: Page,
  patches: Array<{ path: string[]; value: JsonValue }>
): Promise<MutationResponse> {
  return page.evaluate<
    MutationResponse,
    { patches: Array<{ path: string[]; value: JsonValue }>; requestId: string }
  >(
    async ({ patches: mutationPatches, requestId }) =>
      chrome.runtime.sendMessage({
        type: 'ZENDIO_OPTIONS_MUTATION',
        requestId,
        command: {
          kind: 'patch',
          patches: mutationPatches
        }
      }),
    { patches, requestId: `patch-${crypto.randomUUID()}` }
  );
}

async function sendReplacement(page: Page, replacement: JsonRecord): Promise<MutationResponse> {
  return page.evaluate<MutationResponse, { replacement: JsonRecord; requestId: string }>(
    async ({ replacement: next, requestId }) =>
      chrome.runtime.sendMessage({
        type: 'ZENDIO_OPTIONS_MUTATION',
        requestId,
        command: { kind: 'replace', replacement: next }
      }),
    { replacement, requestId: `replace-${crypto.randomUUID()}` }
  );
}

async function readRaw(page: Page): Promise<JsonRecord> {
  return page.evaluate<JsonRecord>(async () => {
    const result = await chrome.storage.sync.get('options');
    const value: StorageValue = result.options;
    const isRecord = (candidate: StorageValue): candidate is JsonRecord =>
      typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
    return isRecord(value) ? value : {};
  });
}

async function readPrivacyStorage(page: Page) {
  return page.evaluate(async () => {
    const [local, sync] = await Promise.all([
      chrome.storage.local.get([
        'analytics_user_consent',
        'analytics_config',
        'zendio_device_local_privacy_transaction'
      ]),
      chrome.storage.sync.get('options')
    ]);
    const consent = local.analytics_user_consent;
    const options = sync.options;
    return {
      consentAnalytics:
        typeof consent === 'object' && consent !== null && 'analytics' in consent
          ? consent.analytics === true
          : false,
      syncHasPrivacy:
        typeof options === 'object' &&
        options !== null &&
        Object.prototype.hasOwnProperty.call(options, 'privacyPreferences'),
      opaqueKeep:
        typeof options === 'object' &&
        options !== null &&
        'opaqueRoot' in options &&
        typeof options.opaqueRoot === 'object' &&
        options.opaqueRoot !== null &&
        'keep' in options.opaqueRoot &&
        options.opaqueRoot.keep === true,
      transactionPresent: local.zendio_device_local_privacy_transaction !== undefined
    };
  });
}

async function seedCleanupDirectoryHandle(worker: Worker): Promise<void> {
  await worker.evaluate(
    ({ databaseName, storeName, folderId }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(storeName)) {
            request.result.createObjectStore(storeName, { keyPath: 'id' });
          }
        };
        request.onerror = () =>
          reject(request.error ?? new Error('Failed to open Local Vault DB.'));
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(storeName, 'readwrite');
          transaction.onabort = () => reject(transaction.error ?? new Error('Seed aborted.'));
          transaction.onerror = () => reject(transaction.error ?? new Error('Seed failed.'));
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.objectStore(storeName).put({
            id: folderId,
            name: 'Cleanup Journal Vault',
            handle: {}
          });
        };
      }),
    {
      databaseName: localVaultDatabaseName,
      storeName: localVaultStoreName,
      folderId: cleanupFolderId
    }
  );
}

async function hasCleanupDirectoryHandle(worker: Worker): Promise<boolean> {
  return worker.evaluate(
    ({ databaseName, storeName, folderId }) =>
      new Promise<boolean>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onerror = () =>
          reject(request.error ?? new Error('Failed to open Local Vault DB.'));
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(storeName, 'readonly');
          const getRequest = transaction.objectStore(storeName).get(folderId);
          getRequest.onerror = () => reject(getRequest.error ?? new Error('Read failed.'));
          getRequest.onsuccess = () => {
            database.close();
            resolve(getRequest.result !== undefined);
          };
        };
      }),
    {
      databaseName: localVaultDatabaseName,
      storeName: localVaultStoreName,
      folderId: cleanupFolderId
    }
  );
}

async function armNextCleanupAbort(target: Page | Worker): Promise<void> {
  await target.evaluate(
    ({ storeName }) => {
      const prototype = IDBDatabase.prototype;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- The wrapper restores the live database receiver with call(this, ...).
      const original = prototype.transaction;
      let armed = true;
      Object.defineProperty(prototype, 'transaction', {
        configurable: true,
        value: function transaction(
          this: IDBDatabase,
          storeNames: string | string[],
          mode?: IDBTransactionMode,
          options?: IDBTransactionOptions
        ) {
          const created = original.call(this, storeNames, mode, options);
          const names = typeof storeNames === 'string' ? [storeNames] : [...storeNames];
          if (armed && mode === 'readwrite' && names.includes(storeName)) {
            armed = false;
            queueMicrotask(() => {
              try {
                created.abort();
              } catch {
                // Ignore a transaction that completed before the deterministic abort microtask.
              }
            });
          }
          return created;
        }
      });
    },
    { storeName: localVaultStoreName }
  );
}

test.describe('Options cross-context mutation authority', () => {
  let context: BrowserContext;
  let background: Worker;
  let first: Page;
  let second: Page;
  let userDataDir: string;

  test.beforeEach(async () => {
    userDataDir = await mkdtemp(path.join(tmpdir(), 'zendio-o02-options-'));
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });
    background = context.serviceWorkers()[0];
    background ??= await context.waitForEvent('serviceworker', { timeout: 15_000 });
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');
    const optionsUrl = `chrome-extension://${extensionId}/options/index.html`;
    first = await context.newPage();
    second = await context.newPage();
    await Promise.all([
      first.goto(optionsUrl, { waitUntil: 'domcontentloaded' }),
      second.goto(optionsUrl, { waitUntil: 'domcontentloaded' })
    ]);
    await first.evaluate(() =>
      Promise.all([
        chrome.storage.sync.remove('options'),
        chrome.storage.local.remove([
          'analytics_user_consent',
          'analytics_config',
          'deviceLocalVaultBindings'
        ])
      ])
    );
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('converges disjoint patches, preserves opaque data, and strictly replaces imports', async () => {
    await first.evaluate(() =>
      chrome.storage.sync.set({
        options: {
          templates: { article: 'Before' },
          fragmentClipper: { captureContext: false },
          opaqueRoot: { keep: ['opaque', 1] },
          rest: { apiKey: { malformed: true } }
        }
      })
    );

    const [templateResult, fragmentResult] = await Promise.all([
      sendPatch(first, ['templates', 'article'], 'After'),
      sendPatch(second, ['fragmentClipper', 'captureContext'], true)
    ]);
    expect(templateResult.success).toBe(true);
    expect(fragmentResult.success).toBe(true);

    await expect
      .poll(() => readRaw(first))
      .toMatchObject({
        templates: { article: 'After' },
        fragmentClipper: { captureContext: true },
        opaqueRoot: { keep: ['opaque', 1] },
        rest: { apiKey: { malformed: true } }
      });
    await expect.poll(() => readRaw(second)).toEqual(await readRaw(first));

    const replacement = await sendReplacement(first, {
      interfaceTheme: 'dark',
      templates: { article: 'Imported' }
    });
    expect(replacement.success).toBe(true);
    expect(await readRaw(second)).toEqual({
      interfaceTheme: 'dark',
      templates: { article: 'Imported' }
    });
  });

  test('keeps privacy consent device-local across a fresh Options context', async () => {
    await first.evaluate(() =>
      chrome.storage.sync.set({
        options: {
          privacyPreferences: {
            analytics: false,
            errorReporting: false,
            debugMode: false
          },
          opaqueRoot: { keep: true }
        }
      })
    );
    await first.reload({ waitUntil: 'domcontentloaded' });

    const analyticsItem = first
      .locator('.consent-inline-item:visible')
      .filter({ hasText: 'Usage analytics' });
    const analyticsControl = analyticsItem.locator('input[type="checkbox"]');
    await expect(analyticsControl).toHaveCount(1);
    await analyticsItem.locator('label').click();

    await expect.poll(async () => (await readPrivacyStorage(first)).consentAnalytics).toBe(true);
    await expect.poll(async () => (await readPrivacyStorage(first)).syncHasPrivacy).toBe(false);
    await expect.poll(async () => (await readPrivacyStorage(first)).opaqueKeep).toBe(true);

    await second.reload({ waitUntil: 'domcontentloaded' });
    const reloadedAnalyticsControl = second
      .locator('.consent-inline-item:visible')
      .filter({ hasText: 'Usage analytics' })
      .locator('input[type="checkbox"]');
    await expect(reloadedAnalyticsControl).toBeChecked();
  });

  test('keeps vault bindings device-local while composing them across Options contexts', async () => {
    await first.evaluate(() =>
      chrome.storage.sync.set({
        options: {
          rest: {
            vault: 'Primary',
            localFolderId: 'foreign-rest-folder',
            localFolderName: 'Foreign Rest Folder'
          },
          vaultRouter: {
            defaultVaultId: 'primary',
            vaults: [
              {
                id: 'primary',
                name: 'Primary',
                vault: 'Primary',
                httpsUrl: '',
                httpUrl: '',
                apiKey: '',
                localFolderId: 'foreign-routed-folder',
                localFolderName: 'Foreign Routed Folder'
              }
            ]
          },
          opaqueRoot: { keep: ['b06', 1] }
        }
      })
    );

    const mutation = await sendPatch(first, ['vaultRouter'], {
      defaultVaultId: 'primary',
      vaults: [
        {
          id: 'primary',
          name: 'Primary',
          vault: 'Primary',
          httpsUrl: '',
          httpUrl: '',
          apiKey: '',
          localFolderId: 'folder-primary',
          localFolderName: 'Primary Folder'
        }
      ]
    });

    expect(mutation.success).toBe(true);
    expect(mutation.result?.snapshot).toMatchObject({
      rest: {
        localFolderId: 'folder-primary',
        localFolderName: 'Primary Folder'
      },
      vaultRouter: {
        vaults: [
          {
            id: 'primary',
            localFolderId: 'folder-primary',
            localFolderName: 'Primary Folder'
          }
        ]
      }
    });

    const localBindings = await first.evaluate(async () => {
      const stored = await chrome.storage.local.get('deviceLocalVaultBindings');
      return stored.deviceLocalVaultBindings;
    });
    expect(localBindings).toEqual({
      version: 1,
      bindings: {
        primary: { folderId: 'folder-primary', folderName: 'Primary Folder' }
      }
    });

    const portable = await readRaw(first);
    expect(portable).toMatchObject({ opaqueRoot: { keep: ['b06', 1] } });
    expect(portable.rest).not.toHaveProperty('localFolderId');
    expect(portable.rest).not.toHaveProperty('localFolderName');
    const portableRouter = isJsonRecord(portable.vaultRouter) ? portable.vaultRouter : {};
    const portableVaults = Array.isArray(portableRouter.vaults) ? portableRouter.vaults : [];
    for (const vault of portableVaults) {
      if (!isJsonRecord(vault)) continue;
      expect(vault).not.toHaveProperty('localFolderId');
      expect(vault).not.toHaveProperty('localFolderName');
    }

    await second.reload({ waitUntil: 'domcontentloaded' });
    const storageNav = second.locator('[data-nav-panel="storage"]');
    await storageNav.click();
    await expect(storageNav).toHaveClass(/is-active/u);
    await expect(
      second.locator('.local-folder-trigger').filter({ hasText: 'Primary Folder' })
    ).toHaveCount(1);

    const freshUserDataDir = await mkdtemp(path.join(tmpdir(), 'zendio-b06-fresh-profile-'));
    const freshContext = await chromium.launchPersistentContext(freshUserDataDir, {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });
    try {
      let freshBackground = freshContext.serviceWorkers()[0];
      freshBackground ??= await freshContext.waitForEvent('serviceworker', { timeout: 15_000 });
      const freshExtensionId = freshBackground.url().split('/')[2];
      if (!freshExtensionId) throw new Error('Unable to resolve fresh extension id.');
      const freshPage = await freshContext.newPage();
      await freshPage.goto(`chrome-extension://${freshExtensionId}/options/index.html`, {
        waitUntil: 'domcontentloaded'
      });
      await freshPage.evaluate(
        (scrubbed) => chrome.storage.sync.set({ options: scrubbed }),
        portable
      );
      await freshPage.reload({ waitUntil: 'domcontentloaded' });

      const freshLocalBindings = await freshPage.evaluate(async () => {
        const stored = await chrome.storage.local.get('deviceLocalVaultBindings');
        return stored.deviceLocalVaultBindings;
      });
      expect(freshLocalBindings).toBeUndefined();
      const freshStorageNav = freshPage.locator('[data-nav-panel="storage"]');
      await freshStorageNav.click();
      await expect(freshStorageNav).toHaveClass(/is-active/u);
      await expect(
        freshPage.locator('.local-folder-trigger').filter({ hasText: 'Primary Folder' })
      ).toHaveCount(0);
    } finally {
      await freshContext.close();
    }
  });

  test('keeps mixed privacy and vault state atomic when the binding write fails', async () => {
    const portablePrestate = {
      rest: { vault: 'Primary' },
      vaultRouter: {
        defaultVaultId: 'primary',
        vaults: [
          {
            id: 'primary',
            name: 'Primary',
            vault: 'Primary',
            httpsUrl: '',
            httpUrl: '',
            apiKey: ''
          }
        ]
      },
      opaqueRoot: { keep: ['failure-atomic', 1] }
    };
    await first.evaluate(
      ({ options }) =>
        Promise.all([
          chrome.storage.sync.set({ options }),
          chrome.storage.local.set({
            analytics_user_consent: {
              analytics: false,
              errorReporting: false,
              timestamp: 1,
              version: '1.0'
            },
            analytics_config: { debugMode: false },
            deviceLocalVaultBindings: {
              version: 1,
              bindings: {
                primary: { folderId: 'folder-old', folderName: 'Old Folder' }
              }
            }
          })
        ]),
      { options: portablePrestate }
    );
    await Promise.all([
      first.reload({ waitUntil: 'domcontentloaded' }),
      second.reload({ waitUntil: 'domcontentloaded' })
    ]);

    const observation = await second.evaluateHandle(() => {
      const state = { changes: 0 };
      const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
        if (
          changes.options ||
          changes.analytics_user_consent ||
          changes.analytics_config ||
          changes.deviceLocalVaultBindings
        ) {
          state.changes += 1;
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return { state, listener };
    });
    const gateHandle = await background.evaluateHandle(() => {
      const storage = chrome.storage.local;
      const originalSet = storage.set.bind(storage);
      const state = { failed: false, originalSet };
      const gatedSet = (items: JsonRecord, callback?: () => void) => {
        if (
          !state.failed &&
          Object.prototype.hasOwnProperty.call(items, 'deviceLocalVaultBindings')
        ) {
          state.failed = true;
          throw new Error('B06_FORCED_BINDING_WRITE_FAILURE');
        }
        return callback ? originalSet(items, callback) : originalSet(items);
      };
      Object.defineProperty(storage, 'set', { configurable: true, value: gatedSet });
      return state;
    });

    const response = await sendPatches(first, [
      { path: ['privacyPreferences', 'analytics'], value: true },
      {
        path: ['vaultRouter'],
        value: {
          ...portablePrestate.vaultRouter,
          vaults: [
            {
              ...portablePrestate.vaultRouter.vaults[0],
              localFolderId: 'folder-new',
              localFolderName: 'New Folder'
            }
          ]
        }
      }
    ]);
    await expect.poll(() => gateHandle.evaluate((state) => state.failed)).toBe(true);
    await gateHandle.evaluate((state) => {
      Object.defineProperty(chrome.storage.local, 'set', {
        configurable: true,
        value: state.originalSet
      });
    });
    await gateHandle.dispose();

    expect(response.success).toBe(false);
    expect(response.errorCode).toBe('OPTIONS_STORAGE_FAILURE');
    const stateAfterFailure = await first.evaluate(async () => {
      const [sync, local] = await Promise.all([
        chrome.storage.sync.get('options'),
        chrome.storage.local.get([
          'analytics_user_consent',
          'analytics_config',
          'deviceLocalVaultBindings'
        ])
      ]);
      return { sync: sync.options, local };
    });
    expect(stateAfterFailure.sync).toEqual(portablePrestate);
    expect(stateAfterFailure.local.analytics_user_consent).toMatchObject({ analytics: false });
    expect(stateAfterFailure.local.analytics_config).toMatchObject({ debugMode: false });
    expect(stateAfterFailure.local.deviceLocalVaultBindings).toEqual({
      version: 1,
      bindings: { primary: { folderId: 'folder-old', folderName: 'Old Folder' } }
    });
    const publishedChanges = await observation.evaluate(({ state, listener }) => {
      chrome.storage.onChanged.removeListener(listener);
      return state.changes;
    });
    await observation.dispose();
    expect(publishedChanges).toBe(0);

    await second.reload({ waitUntil: 'domcontentloaded' });
    const secondStorageNav = second.locator('[data-nav-panel="storage"]');
    await secondStorageNav.click();
    await expect(secondStorageNav).toHaveClass(/is-active/u);
    await expect(
      second.locator('.local-folder-trigger').filter({ hasText: 'Old Folder' })
    ).toHaveCount(1);
    await expect(
      second
        .locator('.consent-inline-item:visible')
        .filter({ hasText: 'Usage analytics' })
        .locator('input[type="checkbox"]')
    ).not.toBeChecked();

    const freshUserDataDir = await mkdtemp(path.join(tmpdir(), 'zendio-b06-failed-profile-'));
    const freshContext = await chromium.launchPersistentContext(freshUserDataDir, {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });
    try {
      let freshBackground = freshContext.serviceWorkers()[0];
      freshBackground ??= await freshContext.waitForEvent('serviceworker', { timeout: 15_000 });
      const freshExtensionId = freshBackground.url().split('/')[2];
      if (!freshExtensionId) throw new Error('Unable to resolve failed-profile extension id.');
      const freshPage = await freshContext.newPage();
      await freshPage.goto(`chrome-extension://${freshExtensionId}/options/index.html`, {
        waitUntil: 'domcontentloaded'
      });
      await freshPage.evaluate((options) => chrome.storage.sync.set({ options }), portablePrestate);
      await freshPage.reload({ waitUntil: 'domcontentloaded' });
      const freshStorageNav = freshPage.locator('[data-nav-panel="storage"]');
      await freshStorageNav.click();
      await expect(freshStorageNav).toHaveClass(/is-active/u);
      await expect(
        freshPage.locator('.local-folder-trigger').filter({ hasText: 'New Folder' })
      ).toHaveCount(0);
      expect(
        await freshPage.evaluate(async () => {
          const stored = await chrome.storage.local.get('deviceLocalVaultBindings');
          return stored.deviceLocalVaultBindings;
        })
      ).toBeUndefined();
    } finally {
      await freshContext.close();
    }
  });

  test('does not publish staged privacy when the synchronized scrub fails', async () => {
    const analyticsItem = first
      .locator('.consent-inline-item:visible')
      .filter({ hasText: 'Usage analytics' });
    const firstAnalyticsControl = analyticsItem.locator('input[type="checkbox"]');
    const secondAnalyticsControl = second
      .locator('.consent-inline-item:visible')
      .filter({ hasText: 'Usage analytics' })
      .locator('input[type="checkbox"]');
    await expect(firstAnalyticsControl).not.toBeChecked();
    await expect(secondAnalyticsControl).not.toBeChecked();
    await first.evaluate(() =>
      Promise.all([
        chrome.storage.local.set({
          analytics_user_consent: {
            analytics: false,
            errorReporting: false,
            timestamp: 1,
            version: '1.0'
          },
          analytics_config: { debugMode: false }
        }),
        chrome.storage.sync.set({
          options: {
            privacyPreferences: {
              analytics: false,
              errorReporting: false,
              debugMode: false
            },
            opaqueRoot: { keep: true }
          }
        })
      ])
    );
    expect(await readPrivacyStorage(first)).toEqual({
      consentAnalytics: false,
      syncHasPrivacy: true,
      opaqueKeep: true,
      transactionPresent: false
    });
    await expect(firstAnalyticsControl).not.toBeChecked();
    await expect(secondAnalyticsControl).not.toBeChecked();
    const gateHandle = await background.evaluateHandle(() => {
      const storage = chrome.storage.sync;
      const originalSet = storage.set.bind(storage);
      const state = { failed: false, originalSet };
      const readRecord = (value: StorageValue): JsonRecord | null => {
        const isRecord = (candidate: StorageValue): candidate is JsonRecord =>
          typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
        return isRecord(value) ? value : null;
      };
      const gatedSet = (items: JsonRecord, callback?: () => void) => {
        const options = readRecord(items.options);
        if (
          !state.failed &&
          options &&
          !Object.prototype.hasOwnProperty.call(options, 'privacyPreferences')
        ) {
          state.failed = true;
          throw new Error('B05_FORCED_SYNC_FAILURE');
        }
        return callback ? originalSet(items, callback) : originalSet(items);
      };
      Object.defineProperty(storage, 'set', { configurable: true, value: gatedSet });
      return state;
    });

    await analyticsItem.locator('label').click();
    await expect.poll(() => gateHandle.evaluate((state) => state.failed)).toBe(true);
    const gateFailed = await gateHandle.evaluate((state) => {
      Object.defineProperty(chrome.storage.sync, 'set', {
        configurable: true,
        value: state.originalSet
      });
      return state.failed;
    });
    await gateHandle.dispose();

    expect(gateFailed).toBe(true);
    await expect.poll(async () => (await readPrivacyStorage(first)).transactionPresent).toBe(false);
    await expect.poll(async () => (await readPrivacyStorage(first)).consentAnalytics).toBe(false);
    await expect.poll(async () => (await readPrivacyStorage(first)).syncHasPrivacy).toBe(true);
    await expect.poll(async () => (await readPrivacyStorage(first)).opaqueKeep).toBe(true);
    await expect(secondAnalyticsControl).not.toBeChecked();
  });

  test('restores the synchronized mirror when the local privacy commit fails', async () => {
    const analyticsItem = first
      .locator('.consent-inline-item:visible')
      .filter({ hasText: 'Usage analytics' });
    const firstAnalyticsControl = analyticsItem.locator('input[type="checkbox"]');
    const secondAnalyticsControl = second
      .locator('.consent-inline-item:visible')
      .filter({ hasText: 'Usage analytics' })
      .locator('input[type="checkbox"]');
    await expect(firstAnalyticsControl).not.toBeChecked();
    await expect(secondAnalyticsControl).not.toBeChecked();
    await first.evaluate(() =>
      Promise.all([
        chrome.storage.local.set({
          analytics_user_consent: {
            analytics: false,
            errorReporting: false,
            timestamp: 1,
            version: '1.0'
          },
          analytics_config: { debugMode: false }
        }),
        chrome.storage.sync.set({
          options: {
            privacyPreferences: {
              analytics: false,
              errorReporting: false,
              debugMode: false
            },
            opaqueRoot: { keep: true }
          }
        })
      ])
    );
    expect(await readPrivacyStorage(first)).toEqual({
      consentAnalytics: false,
      syncHasPrivacy: true,
      opaqueKeep: true,
      transactionPresent: false
    });
    await expect(firstAnalyticsControl).not.toBeChecked();
    await expect(secondAnalyticsControl).not.toBeChecked();
    const gateHandle = await background.evaluateHandle(() => {
      const storage = chrome.storage.local;
      const originalSet = storage.set.bind(storage);
      const state = { failed: false, originalSet };
      const gatedSet = (items: JsonRecord, callback?: () => void) => {
        if (
          !state.failed &&
          Object.prototype.hasOwnProperty.call(items, 'analytics_user_consent') &&
          Object.prototype.hasOwnProperty.call(items, 'analytics_config')
        ) {
          state.failed = true;
          throw new Error('B05_FORCED_LOCAL_COMMIT_FAILURE');
        }
        return callback ? originalSet(items, callback) : originalSet(items);
      };
      Object.defineProperty(storage, 'set', { configurable: true, value: gatedSet });
      return state;
    });

    await analyticsItem.locator('label').click();
    await expect.poll(() => gateHandle.evaluate((state) => state.failed)).toBe(true);
    const gateFailed = await gateHandle.evaluate((state) => {
      Object.defineProperty(chrome.storage.local, 'set', {
        configurable: true,
        value: state.originalSet
      });
      return state.failed;
    });
    await gateHandle.dispose();

    expect(gateFailed).toBe(true);
    await expect.poll(async () => (await readPrivacyStorage(first)).transactionPresent).toBe(false);
    await expect.poll(async () => (await readPrivacyStorage(first)).consentAnalytics).toBe(false);
    await expect.poll(async () => (await readPrivacyStorage(first)).syncHasPrivacy).toBe(true);
    await expect.poll(async () => (await readPrivacyStorage(first)).opaqueKeep).toBe(true);
    await expect(secondAnalyticsControl).not.toBeChecked();
  });

  test('surfaces continued same-field external drift as a conflict', async () => {
    await first.evaluate(() => chrome.storage.sync.set({ options: { interfaceTheme: 'system' } }));
    const gateHandle = await background.evaluateHandle(() => {
      const storage = chrome.storage.sync;
      const originalSet = storage.set.bind(storage);
      const readRecord = (value: StorageValue): JsonRecord | null => {
        const isRecord = (candidate: StorageValue): candidate is JsonRecord =>
          typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
        return isRecord(value) ? value : null;
      };
      const state: WriteGateState = {
        remaining: 3,
        released: 0,
        pending: [],
        listener: () => undefined,
        originalSet
      };
      const finish = (pending: PendingWrite): void => {
        if (pending.finished) return;
        pending.finished = true;
        state.pending = state.pending.filter((candidate) => candidate !== pending);
        state.released += 1;
        pending.callback();
      };
      state.listener = (changes, area) => {
        const next = readRecord(changes.options?.newValue);
        const pending = state.pending[0];
        if (area !== 'sync' || next?.interfaceTheme !== 'light' || !pending) return;
        pending.released = true;
        if (pending.armed) finish(pending);
      };
      chrome.storage.onChanged.addListener(state.listener);
      const gatedSet = (items: JsonRecord, callback?: () => void) => {
        const options = readRecord(items.options);
        if (options?.interfaceTheme !== 'dark' || state.remaining === 0 || !callback) {
          return callback ? originalSet(items, callback) : originalSet(items);
        }
        state.remaining -= 1;
        const pending: PendingWrite = {
          armed: false,
          released: false,
          finished: false,
          callback
        };
        state.pending.push(pending);
        return originalSet(items, () => {
          if (chrome.runtime.lastError) {
            finish(pending);
            return;
          }
          pending.armed = true;
          if (pending.released) finish(pending);
        });
      };
      Object.defineProperty(storage, 'set', { configurable: true, value: gatedSet });
      return state;
    });
    expect(
      await gateHandle.evaluate((state) => chrome.storage.sync.set !== state.originalSet)
    ).toBe(true);
    const driftHandle = await second.evaluateHandle(() => {
      const readRecord = (value: StorageValue): JsonRecord | null => {
        const isRecord = (candidate: StorageValue): candidate is JsonRecord =>
          typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
        return isRecord(value) ? value : null;
      };
      const state: DriftState = {
        count: 0,
        writes: [],
        listener: () => undefined
      };
      state.listener = (changes, area) => {
        const next = readRecord(changes.options?.newValue);
        if (area !== 'sync' || next?.interfaceTheme !== 'dark' || state.count >= 3) return;
        state.count += 1;
        state.writes.push(
          chrome.storage.sync.set({ options: { ...next, interfaceTheme: 'light' } })
        );
      };
      chrome.storage.onChanged.addListener(state.listener);
      return state;
    });

    const result = await sendPatch(first, ['interfaceTheme'], 'dark');
    const driftCount = await driftHandle.evaluate(async (state) => {
      await Promise.all(state.writes);
      chrome.storage.onChanged.removeListener(state.listener);
      return state.count;
    });
    const gate = await gateHandle.evaluate((state) => {
      Object.defineProperty(chrome.storage.sync, 'set', {
        configurable: true,
        value: state.originalSet
      });
      chrome.storage.onChanged.removeListener(state.listener);
      return {
        remaining: state.remaining,
        released: state.released,
        pending: state.pending.length
      };
    });
    await Promise.all([gateHandle.dispose(), driftHandle.dispose()]);

    expect(result).toMatchObject({ success: false, errorCode: 'EXTERNAL_SYNC_CONFLICT' });
    expect(driftCount).toBe(3);
    expect(gate).toEqual({ remaining: 0, released: 3, pending: 0 });
  });

  test('retries an aborted Local Vault cleanup after a fresh background restart', async () => {
    await first.evaluate(
      ({ cleanupKey, folderId }) =>
        Promise.all([
          chrome.storage.sync.set({
            options: {
              rest: { vault: 'Primary' },
              vaultRouter: {
                defaultVaultId: 'primary',
                vaults: [
                  {
                    id: 'primary',
                    name: 'Primary',
                    vault: 'Primary',
                    httpsUrl: '',
                    httpUrl: '',
                    apiKey: ''
                  }
                ]
              },
              opaqueRoot: { keep: ['b09', 1] }
            }
          }),
          chrome.storage.local.set({
            deviceLocalVaultBindings: {
              version: 1,
              bindings: {
                primary: { folderId, folderName: 'Cleanup Journal Vault' }
              }
            }
          }),
          chrome.storage.local.remove(cleanupKey)
        ]),
      { cleanupKey: cleanupJournalKey, folderId: cleanupFolderId }
    );
    await seedCleanupDirectoryHandle(background);
    await first.reload({ waitUntil: 'domcontentloaded' });
    await first.locator('[data-nav-panel="storage"]').click();
    const selectedFolder = first
      .locator('.local-folder-trigger')
      .filter({ hasText: 'Cleanup Journal Vault' });
    await expect(selectedFolder).toHaveCount(1);
    await selectedFolder.click();
    const deleteButton = first
      .locator('.local-folder-cell button')
      .filter({ hasText: 'Delete Local Folder' });
    await expect(deleteButton).toHaveCount(1);

    await Promise.all([armNextCleanupAbort(first), armNextCleanupAbort(background)]);
    await deleteButton.click();

    await expect
      .poll(() =>
        first.evaluate(
          async ({ cleanupKey }) => {
            const local = await chrome.storage.local.get(['deviceLocalVaultBindings', cleanupKey]);
            return {
              bindings: local.deviceLocalVaultBindings,
              journal: local[cleanupKey]
            };
          },
          { cleanupKey: cleanupJournalKey }
        )
      )
      .toEqual({
        bindings: { version: 1, bindings: {} },
        journal: { version: 1, folderIds: [cleanupFolderId] }
      });
    expect(await hasCleanupDirectoryHandle(background)).toBe(true);

    await context.close();
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });
    background = context.serviceWorkers()[0];
    background ??= await context.waitForEvent('serviceworker', { timeout: 15_000 });
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve restarted extension id.');
    first = await context.newPage();
    await first.goto(`chrome-extension://${extensionId}/options/index.html`, {
      waitUntil: 'domcontentloaded'
    });

    await expect
      .poll(() =>
        first.evaluate(
          async ({ cleanupKey }) => {
            const local = await chrome.storage.local.get(cleanupKey);
            return local[cleanupKey];
          },
          { cleanupKey: cleanupJournalKey }
        )
      )
      .toBeUndefined();
    await expect.poll(() => hasCleanupDirectoryHandle(background)).toBe(false);
    const portable = await first.evaluate(async () => {
      const stored = await chrome.storage.sync.get('options');
      return stored.options;
    });
    expect(portable).toMatchObject({ opaqueRoot: { keep: ['b09', 1] } });
  });
});
