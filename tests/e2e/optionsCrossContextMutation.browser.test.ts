import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type Worker
} from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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

type ForwardPhase =
  | 'prepared'
  | 'forward-inflight'
  | 'forward-committed'
  | 'local-commit-inflight'
  | 'local-committed'
  | 'cleanup-complete';

type ForwardPrivacy = { analytics: boolean; errorReporting: boolean; debugMode: boolean };
const privacyRestore: ForwardPrivacy = {
  analytics: false,
  errorReporting: false,
  debugMode: false
};
const privacyForward: ForwardPrivacy = {
  analytics: true,
  errorReporting: false,
  debugMode: false
};
const forwardPreviousBindings = {
  version: 1,
  bindings: {
    primary: { folderId: cleanupFolderId, folderName: 'Cleanup Journal Vault' }
  }
} as const;
const forwardProposedBindings = { version: 1, bindings: {} } as const;
const forwardPortablePreimage: JsonRecord = {
  interfaceTheme: 'system',
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
  }
};
const forwardPortableProposal: JsonRecord = {
  interfaceTheme: 'dark',
  vaultRouter: { defaultVaultId: 'default', vaults: [] }
};

function canonicalForwardJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalForwardJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalForwardJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function forwardIdentity(value: JsonRecord): string {
  return createHash('sha256').update(canonicalForwardJson(value)).digest('hex');
}

function createForwardJournal(
  id: string,
  phase: ForwardPhase,
  options: {
    portablePreimage?: JsonRecord;
    portableProposal?: JsonRecord;
    portableWriteRequired?: boolean;
    privacyRestoreTarget?: ForwardPrivacy;
    privacyForwardTarget?: ForwardPrivacy;
    privacyWriteRequired?: boolean;
    remaining?: string[];
  } = {}
) {
  const preimage = options.portablePreimage ?? forwardPortablePreimage;
  const proposal = options.portableProposal ?? forwardPortableProposal;
  const restoreTarget = options.privacyRestoreTarget ?? privacyRestore;
  const forwardTarget = options.privacyForwardTarget ?? privacyForward;
  const hasForwardProof = [
    'forward-committed',
    'local-commit-inflight',
    'local-committed',
    'cleanup-complete'
  ].includes(phase);
  return {
    version: 3,
    protocol: 'forward-privacy-v1',
    transactionId: `m05-${id}`,
    phase,
    previousBindings: forwardPreviousBindings,
    proposedBindings: forwardProposedBindings,
    cleanupCandidates: [cleanupFolderId],
    remainingCleanupCandidates: options.remaining ?? [cleanupFolderId],
    portable: {
      identityAlgorithm: 'sha256-canonical-plain-json-v1',
      preimage,
      preimageIdentity: forwardIdentity(preimage),
      proposedIdentity: forwardIdentity(proposal),
      ...(hasForwardProof ? { observedCommittedIdentity: forwardIdentity(proposal) } : {}),
      writeRequired: options.portableWriteRequired ?? true
    },
    privacy: {
      restoreTarget,
      forwardTarget,
      writeRequired: options.privacyWriteRequired ?? true,
      ...(hasForwardProof ? { observedForward: 'exact-target-readback' } : {})
    }
  };
}

async function seedForwardPhysicalState(
  page: Page,
  input: {
    portable: JsonRecord;
    privacy: ForwardPrivacy;
    bindings: unknown;
    journal: unknown;
    privacyMarker?: 'prepared' | 'commit-ready';
  }
): Promise<void> {
  await page.evaluate(
    async ({ state, journalKey }) => {
      const local: Record<string, unknown> = {
        analytics_user_consent: {
          analytics: state.privacy.analytics,
          errorReporting: state.privacy.errorReporting,
          timestamp: 1,
          version: '1.0'
        },
        analytics_config: { debugMode: state.privacy.debugMode },
        deviceLocalVaultBindings: state.bindings,
        [journalKey]: state.journal
      };
      if (state.privacyMarker) {
        local.zendio_device_local_privacy_transaction = {
          version: 1,
          phase: state.privacyMarker,
          previousConsentPresent: true,
          previousConsent: {
            analytics: false,
            errorReporting: false,
            timestamp: 1,
            version: '1.0'
          },
          previousConfigPresent: true,
          previousConfig: { debugMode: false }
        };
      }
      await Promise.all([
        chrome.storage.sync.set({ options: state.portable }),
        chrome.storage.local.set(local)
      ]);
    },
    { state: input, journalKey: cleanupJournalKey }
  );
}

async function readForwardState(page: Page) {
  return page.evaluate(async (journalKey) => {
    const [sync, local] = await Promise.all([
      chrome.storage.sync.get('options'),
      chrome.storage.local.get([
        'analytics_user_consent',
        'analytics_config',
        'zendio_device_local_privacy_transaction',
        'deviceLocalVaultBindings',
        journalKey
      ])
    ]);
    return { portable: sync.options, local };
  }, cleanupJournalKey);
}

async function readForwardSemanticState(page: Page) {
  const state = await readForwardState(page);
  const consent = isJsonRecord(state.local.analytics_user_consent)
    ? state.local.analytics_user_consent
    : {};
  const config = isJsonRecord(state.local.analytics_config) ? state.local.analytics_config : {};
  return {
    portable: state.portable,
    privacy: {
      analytics: consent.analytics === true,
      errorReporting: consent.errorReporting === true,
      debugMode: config.debugMode === true
    },
    bindings: state.local.deviceLocalVaultBindings,
    journalPresent: state.local[cleanupJournalKey] !== undefined
  };
}

type MountedMutationProbe = {
  held: boolean;
  released: boolean;
  failNext: boolean;
  holdNextTrue: boolean;
  failedResponses: number;
  paths: string[][];
  captureValues: boolean[];
  release(): void;
};

type DelayedOptionsEventProbe = {
  held: number;
  released: number;
  release(): void;
};

async function installDelayedOptionsEventProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const event = chrome.storage.onChanged;
    const originalAdd = event.addListener.bind(event);
    const originalRemove = event.removeListener.bind(event);
    type Listener = Parameters<typeof event.addListener>[0];
    const wrappers = new Map<Listener, Listener>();
    let pending: { listener: Listener; args: Parameters<Listener> } | null = null;
    const probe: DelayedOptionsEventProbe = {
      held: 0,
      released: 0,
      release() {
        if (!pending) throw new Error('No delayed Options storage event is pending.');
        const delayed = pending;
        pending = null;
        probe.released += 1;
        delayed.listener(...delayed.args);
      }
    };
    Object.defineProperty(event, 'addListener', {
      configurable: true,
      value: (listener: Listener) => {
        const wrapper: Listener = (changes, area) => {
          if (area === 'sync' && changes.options && !pending) {
            pending = { listener, args: [changes, area] };
            probe.held += 1;
            return;
          }
          listener(changes, area);
        };
        wrappers.set(listener, wrapper);
        originalAdd(wrapper);
      }
    });
    Object.defineProperty(event, 'removeListener', {
      configurable: true,
      value: (listener: Listener) => {
        const wrapper = wrappers.get(listener);
        if (wrapper) {
          wrappers.delete(listener);
          originalRemove(wrapper);
        } else {
          originalRemove(listener);
        }
      }
    });
    Object.defineProperty(globalThis, '__m05DelayedOptionsEventProbe', {
      configurable: true,
      value: probe
    });
  });
}

async function installMountedMutationProbe(page: Page, holdFirstTrue = true): Promise<void> {
  await page.addInitScript((shouldHoldFirstTrue) => {
    const runtime = chrome.runtime;
    const original = runtime.sendMessage.bind(runtime);
    type SendArgs = Parameters<typeof runtime.sendMessage>;
    let pending: SendArgs | null = null;
    const probe: MountedMutationProbe = {
      held: false,
      released: false,
      failNext: false,
      holdNextTrue: shouldHoldFirstTrue,
      failedResponses: 0,
      paths: [],
      captureValues: [],
      release() {
        if (!pending) throw new Error('No mounted Options mutation is pending.');
        const args = pending;
        pending = null;
        probe.released = true;
        Reflect.apply(original, runtime, args);
      }
    };
    const wrapped = (...args: SendArgs) => {
      const message = args[0];
      if (typeof message !== 'object' || message === null || Array.isArray(message)) {
        return Reflect.apply(original, runtime, args);
      }
      const record = message as Record<string, unknown>;
      if (record.type !== 'ZENDIO_OPTIONS_MUTATION') {
        return Reflect.apply(original, runtime, args);
      }
      const command = record.command;
      const patches =
        typeof command === 'object' && command !== null && 'patches' in command
          ? (command as { patches?: unknown }).patches
          : undefined;
      if (!Array.isArray(patches)) return Reflect.apply(original, runtime, args);
      const captureValues: boolean[] = [];
      for (const patch of patches) {
        if (typeof patch !== 'object' || patch === null || !('path' in patch)) continue;
        const path = (patch as { path?: unknown }).path;
        if (!Array.isArray(path) || !path.every((part) => typeof part === 'string')) continue;
        probe.paths.push(path);
        if (
          path.join('.') === 'fragmentClipper.captureContext' &&
          typeof (patch as { value?: unknown }).value === 'boolean'
        ) {
          captureValues.push((patch as { value: boolean }).value);
        }
      }
      probe.captureValues.push(...captureValues);
      const callback = args.at(-1);
      if (probe.failNext && typeof callback === 'function') {
        probe.failNext = false;
        probe.failedResponses += 1;
        queueMicrotask(() =>
          callback({
            type: 'ZENDIO_OPTIONS_MUTATION_RESULT',
            requestId: record.requestId,
            success: false,
            errorCode: 'EXTERNAL_SYNC_CONFLICT'
          })
        );
        return undefined;
      }
      if (
        captureValues.includes(true) &&
        probe.holdNextTrue &&
        !probe.held &&
        typeof callback === 'function'
      ) {
        probe.held = true;
        probe.holdNextTrue = false;
        pending = args;
        return undefined;
      }
      return Reflect.apply(original, runtime, args);
    };
    Object.defineProperty(runtime, 'sendMessage', { configurable: true, value: wrapped });
    Object.defineProperty(globalThis, '__m05MountedMutationProbe', {
      configurable: true,
      value: probe
    });
  }, holdFirstTrue);
}

async function openCaptureBehavior(page: Page) {
  const nav = page.locator('[data-nav-panel="capture-behavior"]');
  await nav.click();
  await expect(nav).toHaveClass(/is-active/u);
  const row = page
    .locator('[data-panel-id="capture-behavior"] .row')
    .filter({ has: page.getByText('Capture Context', { exact: true }) });
  const toggle = row.locator('label.switch');
  const input = toggle.locator('input[type="checkbox"]');
  await expect(toggle).toBeVisible();
  return { nav, row, toggle, input };
}

async function clickTheme(page: Page, theme: 'dark' | 'light' | 'system'): Promise<void> {
  await page.locator(`[data-panel-id="overview"] .chips button[data-value="${theme}"]`).click();
}

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

async function expectPublishedPreimage(page: Page): Promise<void> {
  await expect(page.locator('[data-panel-id]')).toHaveCount(6);
  await expect(
    page.locator('[data-panel-id="overview"] .chips button[data-value="system"]')
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page
      .locator('.consent-inline-item:visible')
      .filter({ hasText: 'Usage analytics' })
      .locator('input[type="checkbox"]')
  ).not.toBeChecked();
  const storageNav = page.locator('[data-nav-panel="storage"]');
  await storageNav.click();
  await expect(
    page.locator('.local-folder-trigger').filter({ hasText: 'Cleanup Journal Vault' })
  ).toHaveCount(1);
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

  test('rebases two mounted Options pages without reverse patches or interaction loss', async () => {
    await Promise.all([first.close(), second.close()]);
    first = await context.newPage();
    await installMountedMutationProbe(first);
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');
    const optionsUrl = `chrome-extension://${extensionId}/options/index.html`;
    await background.evaluate(() =>
      chrome.storage.sync.set({
        options: {
          interfaceTheme: 'system',
          fragmentClipper: { captureContext: false, contextLength: 200 }
        }
      })
    );
    second = await context.newPage();
    await Promise.all([
      first.goto(optionsUrl, { waitUntil: 'domcontentloaded' }),
      second.goto(optionsUrl, { waitUntil: 'domcontentloaded' })
    ]);

    const firstCapture = await openCaptureBehavior(first);
    const outputText = first
      .locator('[data-panel-id="output"] input[type="text"]')
      .filter({ visible: true })
      .first();
    await expect(outputText).toBeVisible();
    await outputText.focus();
    const originalText = await outputText.inputValue();
    await outputText.fill(`${originalText} m05`);
    await outputText.evaluate((input) => {
      if (!(input instanceof HTMLInputElement)) throw new Error('Expected text input.');
      input.focus();
      input.setSelectionRange(1, Math.min(4, input.value.length), 'forward');
      const main = document.querySelector<HTMLElement>('.main');
      const root = document.querySelector<HTMLElement>('#optionsShellRoot');
      const overview = document.querySelector<HTMLElement>('[data-panel-id="overview"]');
      const output = document.querySelector<HTMLElement>('[data-panel-id="output"]');
      const capture = document.querySelector<HTMLElement>('[data-panel-id="capture-behavior"]');
      if (!main || !root || !overview || !output || !capture) {
        throw new Error('Mounted Options identity fixture missing.');
      }
      Object.defineProperty(globalThis, '__m05OptionsIdentity', {
        configurable: true,
        value: {
          input,
          main,
          root,
          overview,
          output,
          capture,
          expectedMainScroll: 0,
          expectedWindowScroll: 0
        }
      });
    });

    await firstCapture.toggle.click();
    await expect
      .poll(() =>
        first.evaluate(
          () =>
            (
              globalThis as typeof globalThis & {
                __m05MountedMutationProbe?: MountedMutationProbe;
              }
            ).__m05MountedMutationProbe?.held ?? false
        )
      )
      .toBe(true);
    await outputText.evaluate((input) => {
      if (!(input instanceof HTMLInputElement)) throw new Error('Expected text input.');
      const identity = (
        globalThis as typeof globalThis & {
          __m05OptionsIdentity?: {
            main: HTMLElement;
            expectedMainScroll: number;
            expectedWindowScroll: number;
          };
        }
      ).__m05OptionsIdentity;
      if (!identity) throw new Error('Mounted Options identity probe missing.');
      input.focus();
      input.setSelectionRange(1, Math.min(4, input.value.length), 'forward');
    });
    await first.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        })
    );
    const frozenScroll = await first.evaluate(() => {
      const identity = (
        globalThis as typeof globalThis & {
          __m05OptionsIdentity?: {
            main: HTMLElement;
            expectedMainScroll: number;
            expectedWindowScroll: number;
          };
        }
      ).__m05OptionsIdentity;
      if (!identity) throw new Error('Mounted Options identity probe missing.');
      identity.main.scrollTop = 180;
      window.scrollTo(0, 24);
      identity.expectedMainScroll = identity.main.scrollTop;
      identity.expectedWindowScroll = window.scrollY;
      return {
        mainScroll: identity.main.scrollTop,
        windowScroll: window.scrollY
      };
    });
    expect(frozenScroll.mainScroll).toBe(180);
    await clickTheme(second, 'dark');
    await expect.poll(async () => (await readRaw(first)).interfaceTheme).toBe('dark');
    await expect(
      first.locator('[data-panel-id="overview"] .chips button[data-value="dark"]')
    ).toHaveClass(/is-active/u);

    const retained = await first.evaluate(() => {
      const identity = (
        globalThis as typeof globalThis & {
          __m05OptionsIdentity?: {
            input: HTMLInputElement;
            main: HTMLElement;
            root: HTMLElement;
            overview: HTMLElement;
            output: HTMLElement;
            capture: HTMLElement;
            expectedMainScroll: number;
            expectedWindowScroll: number;
          };
        }
      ).__m05OptionsIdentity;
      if (!identity) throw new Error('Mounted Options identity probe missing.');
      return {
        focus: document.activeElement === identity.input,
        selection: [
          identity.input.selectionStart,
          identity.input.selectionEnd,
          identity.input.selectionDirection
        ],
        mainScroll: identity.main.scrollTop,
        expectedMainScroll: identity.expectedMainScroll,
        windowScroll: window.scrollY,
        expectedWindowScroll: identity.expectedWindowScroll,
        root: document.querySelector('#optionsShellRoot') === identity.root,
        overview: document.querySelector('[data-panel-id="overview"]') === identity.overview,
        output: document.querySelector('[data-panel-id="output"]') === identity.output,
        capture: document.querySelector('[data-panel-id="capture-behavior"]') === identity.capture,
        value: identity.input.value
      };
    });
    expect(retained.focus).toBe(true);
    expect(retained.selection).toEqual([1, Math.min(4, `${originalText} m05`.length), 'forward']);
    expect(retained.mainScroll).toBe(retained.expectedMainScroll);
    expect(retained.windowScroll).toBe(retained.expectedWindowScroll);
    expect(retained).toMatchObject({
      root: true,
      overview: true,
      output: true,
      capture: true,
      value: `${originalText} m05`
    });

    await firstCapture.toggle.click();
    await first.evaluate(() => {
      const probe = (
        globalThis as typeof globalThis & { __m05MountedMutationProbe?: MountedMutationProbe }
      ).__m05MountedMutationProbe;
      if (!probe) throw new Error('Mounted mutation probe missing.');
      probe.release();
    });
    await expect
      .poll(() => readRaw(first))
      .toMatchObject({
        interfaceTheme: 'dark',
        fragmentClipper: { captureContext: false }
      });
    await expect
      .poll(() =>
        first.evaluate(() => {
          const probe = (
            globalThis as typeof globalThis & {
              __m05MountedMutationProbe?: MountedMutationProbe;
            }
          ).__m05MountedMutationProbe;
          return probe ? { paths: probe.paths, values: probe.captureValues } : null;
        })
      )
      .toMatchObject({ values: [true, false] });
    const paths = await first.evaluate(
      () =>
        (globalThis as typeof globalThis & { __m05MountedMutationProbe?: MountedMutationProbe })
          .__m05MountedMutationProbe?.paths ?? []
    );
    expect(paths).not.toContainEqual(['interfaceTheme']);

    await background.evaluate(() =>
      chrome.storage.sync.set({
        options: {
          interfaceTheme: 'system',
          fragmentClipper: { captureContext: false, contextLength: 200 }
        }
      })
    );
    await Promise.all([
      first.reload({ waitUntil: 'domcontentloaded' }),
      second.reload({ waitUntil: 'domcontentloaded' })
    ]);
    const secondCapture = await openCaptureBehavior(second);
    await secondCapture.toggle.click();
    await expect
      .poll(async () => (await readRaw(second)).fragmentClipper)
      .toMatchObject({
        captureContext: true
      });
    await clickTheme(first, 'light');
    await expect
      .poll(() => readRaw(first))
      .toMatchObject({
        interfaceTheme: 'light',
        fragmentClipper: { captureContext: true }
      });
    await expect(secondCapture.input).toBeChecked();
    await expect(
      second.locator('[data-panel-id="overview"] .chips button[data-value="light"]')
    ).toHaveClass(/is-active/u);
  });

  test('retains a mounted dirty edit after a bounded mutation failure and page exit', async () => {
    await Promise.all([first.close(), second.close()]);
    first = await context.newPage();
    await installMountedMutationProbe(first, false);
    const autoSaveErrors: string[] = [];
    first.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('Auto-save failed')) {
        autoSaveErrors.push(message.text());
      }
    });
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');
    const optionsUrl = `chrome-extension://${extensionId}/options/index.html`;
    await background.evaluate(() =>
      chrome.storage.sync.set({
        options: { interfaceTheme: 'system', fragmentClipper: { captureContext: false } }
      })
    );
    await first.goto(optionsUrl, { waitUntil: 'domcontentloaded' });
    const capture = await openCaptureBehavior(first);
    await first.evaluate(() => {
      const probe = (
        globalThis as typeof globalThis & { __m05MountedMutationProbe?: MountedMutationProbe }
      ).__m05MountedMutationProbe;
      if (!probe) throw new Error('Mounted mutation probe missing.');
      probe.failNext = true;
    });
    await capture.toggle.click();
    await expect(capture.input).toBeChecked();
    await expect
      .poll(() =>
        first.evaluate(
          () =>
            (
              globalThis as typeof globalThis & {
                __m05MountedMutationProbe?: MountedMutationProbe;
              }
            ).__m05MountedMutationProbe?.failedResponses ?? 0
        )
      )
      .toBe(1);
    await expect.poll(() => autoSaveErrors.length).toBe(1);
    await expect
      .poll(async () => (await readRaw(first)).fragmentClipper)
      .toMatchObject({
        captureContext: false
      });
    await capture.toggle.click();
    await expect(capture.input).not.toBeChecked();
    await capture.toggle.click();
    await expect(capture.input).toBeChecked();
    await expect
      .poll(async () => (await readRaw(first)).fragmentClipper)
      .toMatchObject({
        captureContext: true
      });
    await expect
      .poll(() =>
        first.evaluate(
          () =>
            (
              globalThis as typeof globalThis & {
                __m05MountedMutationProbe?: MountedMutationProbe;
              }
            ).__m05MountedMutationProbe?.captureValues ?? []
        )
      )
      .toEqual([true, true]);
    await clickTheme(first, 'dark');
    await expect.poll(async () => (await readRaw(first)).interfaceTheme).toBe('dark');
    expect(
      await first.evaluate(
        () =>
          (
            globalThis as typeof globalThis & {
              __m05MountedMutationProbe?: MountedMutationProbe;
            }
          ).__m05MountedMutationProbe?.captureValues ?? []
      )
    ).toEqual([true, true]);
    await first.reload({ waitUntil: 'domcontentloaded' });
    const reloaded = await openCaptureBehavior(first);
    await expect(reloaded.input).toBeChecked();
    await expect
      .poll(() => readRaw(first))
      .toMatchObject({
        interfaceTheme: 'dark',
        fragmentClipper: { captureContext: true }
      });
    await reloaded.toggle.click();
    await first.close();
    first = await context.newPage();
    await first.goto(optionsUrl, { waitUntil: 'domcontentloaded' });
    const reopened = await openCaptureBehavior(first);
    await expect(reopened.input).not.toBeChecked();
    await expect
      .poll(() => readRaw(first))
      .toMatchObject({
        interfaceTheme: 'dark',
        fragmentClipper: { captureContext: false }
      });
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
    const cleanupPortablePreimage: JsonRecord = {
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
    };
    await first.evaluate(
      ({ cleanupKey, folderId, portable }) =>
        Promise.all([
          chrome.storage.sync.set({ options: portable }),
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
      {
        cleanupKey: cleanupJournalKey,
        folderId: cleanupFolderId,
        portable: cleanupPortablePreimage
      }
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

    const readCleanupState = () =>
      first.evaluate(
        async ({ cleanupKey }) => {
          const local = await chrome.storage.local.get(['deviceLocalVaultBindings', cleanupKey]);
          return {
            bindings: local.deviceLocalVaultBindings,
            journal: local[cleanupKey]
          };
        },
        { cleanupKey: cleanupJournalKey }
      );
    await expect
      .poll(async () => {
        const state = await readCleanupState();
        return isJsonRecord(state.journal) ? state.journal.phase : undefined;
      })
      .toBe('local-committed');
    const cleanupState = await readCleanupState();
    if (!isJsonRecord(cleanupState.journal)) throw new Error('Expected v3 cleanup journal.');
    const transactionId = cleanupState.journal.transactionId;
    expect(transactionId).toEqual(expect.any(String));
    expect(String(transactionId)).toMatch(
      /^options-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    );
    const identity = forwardIdentity(cleanupPortablePreimage);
    expect(cleanupState).toEqual({
      bindings: { version: 1, bindings: {} },
      journal: {
        version: 3,
        protocol: 'forward-privacy-v1',
        transactionId,
        phase: 'local-committed',
        previousBindings: forwardPreviousBindings,
        proposedBindings: forwardProposedBindings,
        cleanupCandidates: [cleanupFolderId],
        remainingCleanupCandidates: [cleanupFolderId],
        portable: {
          identityAlgorithm: 'sha256-canonical-plain-json-v1',
          preimage: cleanupPortablePreimage,
          preimageIdentity: identity,
          proposedIdentity: identity,
          observedCommittedIdentity: identity,
          writeRequired: false
        },
        privacy: {
          restoreTarget: privacyRestore,
          forwardTarget: privacyRestore,
          writeRequired: false,
          observedForward: 'exact-target-readback'
        }
      }
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

const forwardRows = [
  {
    id: 'F1 prepared only',
    phase: 'prepared' as const,
    portable: forwardPortablePreimage,
    privacy: privacyRestore,
    bindings: forwardPreviousBindings,
    expectedPortable: forwardPortablePreimage,
    expectedPrivacy: privacyRestore,
    expectedBindings: forwardPreviousBindings,
    expectedHandle: true,
    success: true
  },
  {
    id: 'F2 privacy prepared',
    phase: 'forward-inflight' as const,
    portable: forwardPortableProposal,
    privacy: privacyRestore,
    privacyMarker: 'prepared' as const,
    bindings: forwardProposedBindings,
    expectedPortable: forwardPortablePreimage,
    expectedPrivacy: privacyRestore,
    expectedBindings: forwardPreviousBindings,
    expectedHandle: true,
    success: false
  },
  {
    id: 'F3 privacy commit-ready before values',
    phase: 'forward-inflight' as const,
    portable: forwardPortableProposal,
    privacy: privacyRestore,
    privacyMarker: 'commit-ready' as const,
    bindings: forwardProposedBindings,
    expectedPortable: forwardPortablePreimage,
    expectedPrivacy: privacyRestore,
    expectedBindings: forwardPreviousBindings,
    expectedHandle: true,
    success: false
  },
  {
    id: 'F4 exact forward privacy',
    phase: 'forward-inflight' as const,
    portable: forwardPortableProposal,
    privacy: privacyForward,
    privacyMarker: 'commit-ready' as const,
    bindings: forwardProposedBindings,
    expectedPortable: forwardPortableProposal,
    expectedPrivacy: privacyForward,
    expectedBindings: forwardProposedBindings,
    expectedHandle: false,
    success: true
  },
  {
    id: 'F5 portable preimage with forward privacy',
    phase: 'forward-inflight' as const,
    portable: forwardPortablePreimage,
    privacy: privacyForward,
    bindings: forwardProposedBindings,
    expectedPortable: forwardPortablePreimage,
    expectedPrivacy: privacyRestore,
    expectedBindings: forwardPreviousBindings,
    expectedHandle: true,
    success: false
  },
  {
    id: 'F6 preserves third portable with exact forward privacy',
    phase: 'forward-inflight' as const,
    portable: { ...forwardPortablePreimage, interfaceTheme: 'dark', opaqueRoot: { third: true } },
    privacy: privacyForward,
    bindings: forwardProposedBindings,
    expectedPortable: {
      ...forwardPortablePreimage,
      interfaceTheme: 'dark',
      opaqueRoot: { third: true }
    },
    expectedPrivacy: privacyRestore,
    expectedBindings: forwardPreviousBindings,
    expectedHandle: true,
    success: false,
    errorCode: 'EXTERNAL_SYNC_CONFLICT'
  },
  {
    id: 'F6 preserves third privacy with exact portable proposal',
    phase: 'forward-inflight' as const,
    portable: forwardPortableProposal,
    privacy: { analytics: false, errorReporting: true, debugMode: true },
    bindings: forwardProposedBindings,
    expectedPortable: forwardPortablePreimage,
    expectedPrivacy: { analytics: false, errorReporting: true, debugMode: true },
    expectedBindings: forwardPreviousBindings,
    expectedHandle: true,
    success: false,
    errorCode: 'EXTERNAL_SYNC_CONFLICT'
  },
  {
    id: 'F7 local inflight B0 compensates',
    phase: 'local-commit-inflight' as const,
    portable: forwardPortableProposal,
    privacy: privacyForward,
    bindings: forwardPreviousBindings,
    expectedPortable: forwardPortablePreimage,
    expectedPrivacy: privacyRestore,
    expectedBindings: forwardPreviousBindings,
    expectedHandle: true,
    success: false
  },
  {
    id: 'F7 local inflight B1 advances',
    phase: 'local-commit-inflight' as const,
    portable: forwardPortableProposal,
    privacy: privacyForward,
    bindings: forwardProposedBindings,
    expectedPortable: forwardPortableProposal,
    expectedPrivacy: privacyForward,
    expectedBindings: forwardProposedBindings,
    expectedHandle: false,
    success: true
  },
  {
    id: 'F7 local inflight Bx preserves third binding',
    phase: 'local-commit-inflight' as const,
    portable: forwardPortableProposal,
    privacy: privacyForward,
    bindings: {
      version: 1,
      bindings: { primary: { folderId: 'third-folder', folderName: 'Third Folder' } }
    },
    expectedPortable: forwardPortablePreimage,
    expectedPrivacy: privacyRestore,
    expectedBindings: {
      version: 1,
      bindings: { primary: { folderId: 'third-folder', folderName: 'Third Folder' } }
    },
    expectedHandle: true,
    success: false,
    errorCode: 'EXTERNAL_SYNC_CONFLICT'
  }
] as const;

for (const row of forwardRows) {
  test(`recovers corrected-v3 ${row.id} through a persistent installed extension`, async () => {
    const userDataDir = await mkdtemp(path.join(tmpdir(), 'zendio-m05-forward-'));
    let context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });
    try {
      let worker = context.serviceWorkers()[0];
      worker ??= await context.waitForEvent('serviceworker', { timeout: 15_000 });
      const extensionId = worker.url().split('/')[2];
      if (!extensionId) throw new Error('Unable to resolve forward recovery extension id.');
      const seedPage = await context.newPage();
      await seedPage.goto(`chrome-extension://${extensionId}/options/index.html`, {
        waitUntil: 'domcontentloaded'
      });
      await seedCleanupDirectoryHandle(worker);
      await seedForwardPhysicalState(seedPage, {
        portable: row.portable,
        privacy: row.privacy,
        bindings: row.bindings,
        journal: createForwardJournal(row.id, row.phase),
        ...('privacyMarker' in row ? { privacyMarker: row.privacyMarker } : {})
      });

      const newOptionsPage = await context.newPage();
      await newOptionsPage.goto(`chrome-extension://${extensionId}/options/index.html`, {
        waitUntil: 'domcontentloaded'
      });
      await expectPublishedPreimage(newOptionsPage);
      expect((await readForwardState(seedPage)).local[cleanupJournalKey]).toEqual(
        createForwardJournal(row.id, row.phase)
      );

      const expectedPortable = row.expectedPortable as JsonRecord;
      const recoveryResponse = await sendPatch(
        seedPage,
        ['interfaceTheme'],
        expectedPortable.interfaceTheme
      );
      expect(recoveryResponse.success, `${row.id} recovery command success`).toBe(row.success);
      if (row.success) {
        expect(recoveryResponse.errorCode, `${row.id} recovery command error`).toBeUndefined();
      } else {
        expect(recoveryResponse.errorCode, `${row.id} recovery command error`).toBe(
          'errorCode' in row ? row.errorCode : 'OPTIONS_STORAGE_FAILURE'
        );
      }
      await expect
        .poll(() => readForwardSemanticState(seedPage))
        .toEqual({
          portable: row.expectedPortable,
          privacy: row.expectedPrivacy,
          bindings: row.expectedBindings,
          journalPresent: false
        });
      expect(await hasCleanupDirectoryHandle(worker), `${row.id} pre-relaunch handle`).toBe(
        row.expectedHandle
      );

      await context.close();
      context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
          '--headless=new',
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`
        ]
      });
      worker = context.serviceWorkers()[0];
      worker ??= await context.waitForEvent('serviceworker', { timeout: 15_000 });
      const restartedId = worker.url().split('/')[2];
      if (!restartedId) throw new Error('Unable to resolve restarted forward extension id.');
      const restarted = await context.newPage();
      await restarted.goto(`chrome-extension://${restartedId}/options/index.html`, {
        waitUntil: 'domcontentloaded'
      });
      const response = await sendPatch(
        restarted,
        ['interfaceTheme'],
        expectedPortable.interfaceTheme
      );
      expect(response.success, `${row.id} post-relaunch command`).toBe(true);
      expect(response.errorCode, `${row.id} post-relaunch command error`).toBeUndefined();
      await expect
        .poll(() => readForwardSemanticState(restarted))
        .toEqual({
          portable: row.expectedPortable,
          privacy: row.expectedPrivacy,
          bindings: row.expectedBindings,
          journalPresent: false
        });
      expect(await hasCleanupDirectoryHandle(worker), `${row.id} post-relaunch handle`).toBe(
        row.expectedHandle
      );
    } finally {
      await context.close().catch(() => undefined);
      await rm(userDataDir, { recursive: true, force: true });
    }
  });
}

test('publishes current state once when a delayed native Options event crosses the v3 barrier', async () => {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'zendio-m05-delayed-publication-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
    const extensionId = worker.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve delayed publication extension id.');
    const control = await context.newPage();
    await control.goto(`chrome-extension://${extensionId}/options/index.html`, {
      waitUntil: 'domcontentloaded'
    });
    await seedForwardPhysicalState(control, {
      portable: forwardPortablePreimage,
      privacy: privacyRestore,
      bindings: forwardPreviousBindings,
      journal: undefined
    });
    const observer = await context.newPage();
    await installDelayedOptionsEventProbe(observer);
    await observer.goto(`chrome-extension://${extensionId}/options/index.html`, {
      waitUntil: 'domcontentloaded'
    });
    await expectPublishedPreimage(observer);
    await observer.evaluate(() => {
      const dark = document.querySelector<HTMLButtonElement>(
        '[data-panel-id="overview"] .chips button[data-value="dark"]'
      );
      if (!dark) throw new Error('Delayed publication theme control missing.');
      const state = { darkTransitions: 0, lastPressed: dark.getAttribute('aria-pressed') };
      const observer = new MutationObserver(() => {
        const pressed = dark.getAttribute('aria-pressed');
        if (pressed !== state.lastPressed) {
          state.lastPressed = pressed;
          if (pressed === 'true') state.darkTransitions += 1;
        }
      });
      observer.observe(dark, { attributes: true, attributeFilter: ['aria-pressed'] });
      Object.defineProperty(globalThis, '__m05DelayedThemeState', {
        configurable: true,
        value: state
      });
    });

    await seedForwardPhysicalState(control, {
      portable: forwardPortableProposal,
      privacy: privacyForward,
      bindings: forwardProposedBindings,
      journal: createForwardJournal('delayed-rollback', 'forward-inflight')
    });
    await expect
      .poll(() =>
        observer.evaluate(
          () =>
            (
              globalThis as typeof globalThis & {
                __m05DelayedOptionsEventProbe?: DelayedOptionsEventProbe;
              }
            ).__m05DelayedOptionsEventProbe?.held ?? 0
        )
      )
      .toBe(1);
    await control.evaluate(
      async ({ portable, bindings, journalKey }) => {
        await Promise.all([
          chrome.storage.sync.set({ options: portable }),
          chrome.storage.local.set({
            analytics_user_consent: {
              analytics: false,
              errorReporting: false,
              timestamp: 2,
              version: '1.0'
            },
            analytics_config: { debugMode: false },
            deviceLocalVaultBindings: bindings
          })
        ]);
        await chrome.storage.local.remove(journalKey);
      },
      {
        portable: forwardPortablePreimage,
        bindings: forwardPreviousBindings,
        journalKey: cleanupJournalKey
      }
    );
    await observer.evaluate(() => {
      const probe = (
        globalThis as typeof globalThis & {
          __m05DelayedOptionsEventProbe?: DelayedOptionsEventProbe;
        }
      ).__m05DelayedOptionsEventProbe;
      if (!probe) throw new Error('Delayed Options event probe missing.');
      probe.release();
    });
    await expect
      .poll(() =>
        observer.evaluate(
          () =>
            (
              globalThis as typeof globalThis & {
                __m05DelayedThemeState?: { darkTransitions: number };
              }
            ).__m05DelayedThemeState?.darkTransitions ?? -1
        )
      )
      .toBe(0);

    await seedForwardPhysicalState(control, {
      portable: forwardPortableProposal,
      privacy: privacyForward,
      bindings: forwardProposedBindings,
      journal: createForwardJournal('delayed-success', 'forward-inflight')
    });
    await expect
      .poll(() =>
        observer.evaluate(
          () =>
            (
              globalThis as typeof globalThis & {
                __m05DelayedOptionsEventProbe?: DelayedOptionsEventProbe;
              }
            ).__m05DelayedOptionsEventProbe?.held ?? 0
        )
      )
      .toBe(2);
    await control.evaluate(
      async ({ journalKey, committed }) => {
        await chrome.storage.local.set({ [journalKey]: committed });
        await chrome.storage.local.remove(journalKey);
      },
      {
        journalKey: cleanupJournalKey,
        committed: createForwardJournal('delayed-success', 'local-committed')
      }
    );
    await expect(
      observer.locator('[data-panel-id="overview"] .chips button[data-value="dark"]')
    ).toHaveAttribute('aria-pressed', 'true');
    await observer.evaluate(() => {
      const probe = (
        globalThis as typeof globalThis & {
          __m05DelayedOptionsEventProbe?: DelayedOptionsEventProbe;
        }
      ).__m05DelayedOptionsEventProbe;
      if (!probe) throw new Error('Delayed Options event probe missing.');
      probe.release();
    });
    await expect
      .poll(() =>
        observer.evaluate(() => {
          const runtime = globalThis as typeof globalThis & {
            __m05DelayedOptionsEventProbe?: DelayedOptionsEventProbe;
            __m05DelayedThemeState?: { darkTransitions: number };
          };
          return {
            transitions: runtime.__m05DelayedThemeState?.darkTransitions ?? -1,
            released: runtime.__m05DelayedOptionsEventProbe?.released ?? -1
          };
        })
      )
      .toEqual({ transitions: 1, released: 2 });
  } finally {
    await context.close().catch(() => undefined);
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('recovers corrected-v3 F8 post-delete progress and F9 no-write barriers', async () => {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'zendio-m05-forward-tail-'));
  let context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });
  try {
    let worker = context.serviceWorkers()[0];
    worker ??= await context.waitForEvent('serviceworker', { timeout: 15_000 });
    const extensionId = worker.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve F8/F9 extension id.');
    let page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options/index.html`, {
      waitUntil: 'domcontentloaded'
    });
    await seedCleanupDirectoryHandle(worker);
    await seedForwardPhysicalState(page, {
      portable: forwardPortableProposal,
      privacy: privacyForward,
      bindings: forwardProposedBindings,
      journal: createForwardJournal('f8', 'local-committed')
    });
    const progressFault = await worker.evaluateHandle((journalKey) => {
      const storage = chrome.storage.local;
      const originalSet = storage.set.bind(storage);
      const state = {
        failed: false,
        failures: 0,
        transactionIds: [] as string[],
        originalSet
      };
      const gatedSet = (items: JsonRecord, callback?: () => void) => {
        const candidate = items[journalKey];
        const candidateRecord =
          typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
            ? (candidate as JsonRecord)
            : null;
        const isProgressWrite =
          !state.failed &&
          candidateRecord?.version === 3 &&
          candidateRecord.protocol === 'forward-privacy-v1' &&
          candidateRecord.transactionId === 'm05-f8' &&
          candidateRecord.phase === 'local-committed' &&
          Array.isArray(candidateRecord.remainingCleanupCandidates) &&
          candidateRecord.remainingCleanupCandidates.length === 0;
        if (isProgressWrite) {
          state.failed = true;
          state.failures += 1;
          state.transactionIds.push(String(candidateRecord.transactionId));
          throw new Error('M05_FORCED_CLEANUP_PROGRESS_WRITE_FAILURE');
        }
        return callback ? originalSet(items, callback) : originalSet(items);
      };
      Object.defineProperty(storage, 'set', { configurable: true, value: gatedSet });
      return state;
    }, cleanupJournalKey);
    const deferred = await sendPatch(page, ['interfaceTheme'], 'dark');
    expect(deferred.success).toBe(false);
    expect(deferred.errorCode).toBe('OPTIONS_STORAGE_FAILURE');
    await expect.poll(() => progressFault.evaluate((state) => state.failed)).toBe(true);
    const faultEvidence = await progressFault.evaluate((state) => {
      Object.defineProperty(chrome.storage.local, 'set', {
        configurable: true,
        value: state.originalSet
      });
      return {
        failed: state.failed,
        failures: state.failures,
        transactionIds: state.transactionIds
      };
    });
    await progressFault.dispose();
    expect(faultEvidence).toEqual({
      failed: true,
      failures: 1,
      transactionIds: ['m05-f8']
    });
    expect(await hasCleanupDirectoryHandle(worker)).toBe(false);
    const deferredState = await readForwardState(page);
    expect(deferredState).toEqual({
      portable: forwardPortableProposal,
      local: {
        analytics_user_consent: {
          analytics: true,
          errorReporting: false,
          timestamp: 1,
          version: '1.0'
        },
        analytics_config: { debugMode: false },
        deviceLocalVaultBindings: forwardProposedBindings,
        [cleanupJournalKey]: createForwardJournal('f8', 'local-committed')
      }
    });

    await context.close();
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });
    worker = context.serviceWorkers()[0];
    worker ??= await context.waitForEvent('serviceworker', { timeout: 15_000 });
    const restartedId = worker.url().split('/')[2];
    if (!restartedId) throw new Error('Unable to resolve F8 relaunch extension id.');
    page = await context.newPage();
    await page.goto(`chrome-extension://${restartedId}/options/index.html`, {
      waitUntil: 'domcontentloaded'
    });
    await expect.poll(() => hasCleanupDirectoryHandle(worker)).toBe(false);
    await expect
      .poll(async () => (await readForwardState(page)).local[cleanupJournalKey])
      .toBeUndefined();
    const completion = await sendPatch(page, ['interfaceTheme'], 'dark');
    expect(completion.success).toBe(true);
    expect(completion.errorCode).toBeUndefined();
    await expect
      .poll(() => readForwardSemanticState(page))
      .toEqual({
        portable: forwardPortableProposal,
        privacy: privacyForward,
        bindings: forwardProposedBindings,
        journalPresent: false
      });
    expect(await hasCleanupDirectoryHandle(worker)).toBe(false);

    const noWriteJournal = createForwardJournal('f9-prepared', 'prepared', {
      portableProposal: forwardPortablePreimage,
      portableWriteRequired: false,
      privacyForwardTarget: privacyRestore,
      privacyWriteRequired: false
    });
    await seedCleanupDirectoryHandle(worker);
    await seedForwardPhysicalState(page, {
      portable: forwardPortablePreimage,
      privacy: privacyRestore,
      bindings: forwardPreviousBindings,
      journal: noWriteJournal
    });
    expect((await sendPatch(page, ['interfaceTheme'], 'system')).success).toBe(true);
    expect(await hasCleanupDirectoryHandle(worker)).toBe(true);

    for (const combination of [
      { portableWrite: false, privacyWrite: false },
      { portableWrite: true, privacyWrite: false },
      { portableWrite: false, privacyWrite: true },
      { portableWrite: true, privacyWrite: true }
    ]) {
      const portable = combination.portableWrite
        ? forwardPortableProposal
        : forwardPortablePreimage;
      const privacy = combination.privacyWrite ? privacyForward : privacyRestore;
      const journal = createForwardJournal(
        `f9-${Number(combination.portableWrite)}-${Number(combination.privacyWrite)}`,
        'forward-inflight',
        {
          portableProposal: portable,
          portableWriteRequired: combination.portableWrite,
          privacyForwardTarget: privacy,
          privacyWriteRequired: combination.privacyWrite
        }
      );
      await seedCleanupDirectoryHandle(worker);
      await seedForwardPhysicalState(page, {
        portable,
        privacy,
        bindings: forwardProposedBindings,
        journal
      });
      expect((await sendPatch(page, ['interfaceTheme'], portable.interfaceTheme)).success).toBe(
        true
      );
      await expect.poll(() => hasCleanupDirectoryHandle(worker)).toBe(false);
      await expect
        .poll(() => readForwardState(page))
        .toMatchObject({
          portable,
          local: {
            analytics_user_consent: {
              analytics: privacy.analytics,
              errorReporting: privacy.errorReporting
            },
            analytics_config: { debugMode: privacy.debugMode },
            deviceLocalVaultBindings: forwardProposedBindings
          }
        });
      await expect
        .poll(async () => (await readForwardState(page)).local[cleanupJournalKey])
        .toBeUndefined();
    }
  } finally {
    await context.close().catch(() => undefined);
    await rm(userDataDir, { recursive: true, force: true });
  }
});
