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
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../../build/dist');

type StorageValue = chrome.storage.StorageChange['newValue'];
type JsonValue = StorageValue;
type JsonRecord = Record<string, StorageValue>;

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
  return page.evaluate<
    MutationResponse,
    { pathParts: string[]; value: JsonValue; requestId: string }
  >(
    async ({ pathParts: patchPath, value: patchValue, requestId }) =>
      chrome.runtime.sendMessage({
        type: 'ZENDIO_OPTIONS_MUTATION',
        requestId,
        command: {
          kind: 'patch',
          patches: [{ path: patchPath, value: patchValue }]
        }
      }),
    { pathParts, value, requestId: `patch-${crypto.randomUUID()}` }
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

test.describe('Options cross-context mutation authority', () => {
  let context: BrowserContext;
  let background: Worker;
  let first: Page;
  let second: Page;

  test.beforeEach(async () => {
    const userDataDir = await mkdtemp(path.join(tmpdir(), 'zendio-o02-options-'));
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      channel: 'chromium',
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
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
    await first.evaluate(() => chrome.storage.sync.remove('options'));
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
});
