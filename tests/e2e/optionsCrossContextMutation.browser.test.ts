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

type JsonValue = string | number | boolean | null | undefined | JsonValue[] | JsonRecord;
type JsonRecord = { [key: string]: JsonValue };
type StorageValue = JsonValue;

function isJsonRecord(value: JsonValue): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type MutationResponse = {
  success?: boolean;
  errorCode?: string;
  result?: { snapshot?: JsonRecord; rawSignature?: string; didWrite?: boolean };
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
  | 'compensating'
  | 'portable-privacy-restored'
  | 'local-committed'
  | 'cleanup-complete'
  | 'aborted';

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
type ForwardBindings = {
  version: 1;
  bindings: Record<string, { folderId: string; folderName: string }>;
};
type ForwardPrivacyMarker = 'prepared' | 'commit-ready';
const forwardPreviousBindings: ForwardBindings = {
  version: 1,
  bindings: {
    primary: { folderId: cleanupFolderId, folderName: 'Cleanup Journal Vault' }
  }
};
const forwardProposedBindings: ForwardBindings = { version: 1, bindings: {} };
type ForwardPortable = {
  interfaceTheme: string;
  vaultRouter: {
    defaultVaultId: string;
    vaults: {
      id: string;
      name: string;
      vault: string;
      httpsUrl: string;
      httpUrl: string;
      apiKey: string;
    }[];
  };
  opaqueRoot?: { third: boolean };
};
const forwardPortablePreimage: ForwardPortable = {
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
const forwardPortableProposal: ForwardPortable = {
  interfaceTheme: 'dark',
  vaultRouter: {
    defaultVaultId: 'default',
    vaults: [
      {
        id: 'default',
        name: 'Default',
        vault: 'Default',
        httpsUrl: '',
        httpUrl: '',
        apiKey: ''
      }
    ]
  }
};

function canonicalForwardJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalForwardJson).join(',')}]`;
  if (isJsonRecord(value)) {
    const record = value;
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
    portablePreimage?: ForwardPortable;
    portableProposal?: ForwardPortable;
    portableWriteRequired?: boolean;
    privacyRestoreTarget?: ForwardPrivacy;
    privacyForwardTarget?: ForwardPrivacy;
    privacyWriteRequired?: boolean;
    remaining?: string[];
    recovery?: {
      outcomeCode: 'OPTIONS_STORAGE_FAILURE' | 'EXTERNAL_SYNC_CONFLICT';
      bindingWriteMayHaveOccurred: boolean;
      portableRestoreEvidence?: 'preimage' | 'third-preserved';
      privacyRestoreEvidence?: 'restore-target' | 'third-preserved';
    };
    abortReason?: 'forward-not-started' | 'local-commit-failed' | 'external-sync-conflict';
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
    ...(options.recovery ? { recovery: options.recovery } : {}),
    ...(options.abortReason ? { abortReason: options.abortReason } : {}),
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

type ForwardPhysicalState = {
  portable: ForwardPortable;
  privacy: ForwardPrivacy;
  bindings: ForwardBindings;
  journal: ReturnType<typeof createForwardJournal> | undefined;
  privacyMarker?: ForwardPrivacyMarker;
};
async function seedForwardPhysicalState(page: Page, input: ForwardPhysicalState): Promise<void> {
  await page.evaluate<void, { state: ForwardPhysicalState; journalKey: string }>(
    async ({ state, journalKey }) => {
      const local: JsonRecord = {
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
    const [sync, local]: [JsonRecord, JsonRecord] = await Promise.all([
      chrome.storage.sync.get<JsonRecord>('options'),
      chrome.storage.local.get<JsonRecord>([
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
  falseHeld: boolean;
  held: boolean;
  released: boolean;
  failNext: boolean;
  holdNextFalse: boolean;
  holdNextTrue: boolean;
  failedResponses: number;
  paths: string[][];
  captureValues: boolean[];
  response: MutationResponse | undefined;
  release(): void;
};

type DelayedOptionsEventProbe = {
  armed: boolean;
  held: number;
  pending: number;
  released: number;
  arm(): void;
  release(): void;
  releaseNext(): void;
};

type NativeStorageRetryProbe = {
  calls: number;
  failures: number;
  held: boolean;
  releases: number;
  release(): void;
};

type MountedOptionsIdentity = {
  input: HTMLInputElement;
  main: HTMLElement;
  root: HTMLElement;
  overview: HTMLElement;
  output: HTMLElement;
  capture: HTMLElement;
  expectedMainScroll: number;
  expectedWindowScroll: number;
};

declare global {
  // eslint-disable-next-line no-var -- Ambient global properties require var declarations.
  var __m05MountedMutationProbe: MountedMutationProbe | undefined;
  // eslint-disable-next-line no-var -- Ambient global properties require var declarations.
  var __m05OptionsIdentity: MountedOptionsIdentity | undefined;
  // eslint-disable-next-line no-var -- Ambient global properties require var declarations.
  var __m05DelayedOptionsEventProbe: DelayedOptionsEventProbe | undefined;
  // eslint-disable-next-line no-var -- Ambient global properties require var declarations.
  var __m05DelayedThemeState: { darkTransitions: number } | undefined;
  // eslint-disable-next-line no-var -- Ambient global properties require var declarations.
  var __milestoneANativeStorageRetryProbe: NativeStorageRetryProbe | undefined;
}

async function installDelayedOptionsEventProbe(page: Page, queueAll = false): Promise<void> {
  await page.addInitScript(
    ({ queueAllEvents }) => {
      const event = chrome.storage.onChanged;
      const originalAdd = event.addListener.bind(event);
      const originalRemove = event.removeListener.bind(event);
      type Listener = Parameters<typeof event.addListener>[0];
      const wrappers = new Map<Listener, Listener>();
      const pending: Array<{ listener: Listener; args: Parameters<Listener> }> = [];
      const maxPending = 64;
      const releaseNext = (): void => {
        const delayed = pending.shift();
        if (!delayed) throw new Error('No delayed Options storage event is pending.');
        probe.pending = pending.length;
        probe.released += 1;
        delayed.listener(...delayed.args);
      };
      const probe: DelayedOptionsEventProbe = {
        armed: !queueAllEvents,
        held: 0,
        pending: 0,
        released: 0,
        arm() {
          if (pending.length > 0) throw new Error('Delayed Options event queue is not empty.');
          probe.armed = true;
          probe.held = 0;
          probe.released = 0;
        },
        release: releaseNext,
        releaseNext
      };
      Object.defineProperty(event, 'addListener', {
        configurable: true,
        value: (listener: Listener) => {
          const wrapper: Listener = (changes, area) => {
            if (
              probe.armed &&
              area === 'sync' &&
              changes.options &&
              (queueAllEvents || pending.length === 0)
            ) {
              if (pending.length >= maxPending)
                throw new Error('Delayed Options event queue overflow.');
              pending.push({ listener, args: [changes, area] });
              probe.held += 1;
              probe.pending = pending.length;
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
    },
    { queueAllEvents: queueAll }
  );
}

async function installMountedMutationProbe(
  page: Page,
  holdFirstTrue = true,
  delayNativeAck = false
): Promise<void> {
  await page.addInitScript(
    ({ shouldHoldFirstTrue, shouldDelayNativeAck }) => {
      const runtime = chrome.runtime;
      const original: (...args: never[]) => unknown = runtime.sendMessage.bind(runtime);
      type SendArgs = unknown[];
      const forward = (args: SendArgs): unknown => {
        const result: unknown = Reflect.apply(original, runtime, args);
        return result;
      };
      let pending: (() => void) | null = null;
      const probe: MountedMutationProbe = {
        falseHeld: false,
        held: false,
        released: false,
        failNext: false,
        holdNextFalse: false,
        holdNextTrue: shouldHoldFirstTrue,
        failedResponses: 0,
        paths: [],
        captureValues: [],
        response: undefined,
        release() {
          if (!pending) throw new Error('No mounted Options mutation is pending.');
          const release = pending;
          pending = null;
          probe.released = true;
          release();
        }
      };
      type MutationMessage = {
        requestId: unknown;
        patches: { path: string[]; value: boolean | undefined }[];
      };
      const record = (value: unknown): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null && !Array.isArray(value);
      const decodeMutation = (value: unknown): MutationMessage | null => {
        if (!record(value) || value.type !== 'ZENDIO_OPTIONS_MUTATION') return null;
        const command = value.command;
        if (!record(command) || !Array.isArray(command.patches)) return null;
        const patches: MutationMessage['patches'] = [];
        for (const patch of command.patches) {
          if (!record(patch) || !Array.isArray(patch.path)) continue;
          const path = patch.path;
          if (!path.every((part): part is string => typeof part === 'string')) continue;
          patches.push({ path, value: typeof patch.value === 'boolean' ? patch.value : undefined });
        }
        return { requestId: value.requestId, patches };
      };
      const wrapped = (...args: SendArgs) => {
        const mutation = decodeMutation(args[0]);
        if (!mutation) return forward(args);
        const captureValues: boolean[] = [];
        for (const patch of mutation.patches) {
          probe.paths.push(patch.path);
          if (
            patch.path.join('.') === 'fragmentClipper.captureContext' &&
            typeof patch.value === 'boolean'
          ) {
            captureValues.push(patch.value);
          }
        }
        probe.captureValues.push(...captureValues);
        const callback = args.at(-1);
        if (probe.failNext && typeof callback === 'function') {
          probe.failNext = false;
          probe.failedResponses += 1;
          queueMicrotask(() => {
            Reflect.apply(callback, undefined, [
              {
                type: 'ZENDIO_OPTIONS_MUTATION_RESULT',
                requestId: mutation.requestId,
                success: false,
                errorCode: 'EXTERNAL_SYNC_CONFLICT'
              }
            ]);
          });
          return undefined;
        }
        if (captureValues.includes(false) && probe.holdNextFalse && !probe.falseHeld) {
          probe.falseHeld = true;
          probe.holdNextFalse = false;
          pending = () => {
            void forward(args);
          };
          return undefined;
        }
        if (
          captureValues.includes(true) &&
          shouldDelayNativeAck &&
          probe.holdNextTrue &&
          !probe.held &&
          typeof callback === 'function'
        ) {
          probe.held = true;
          probe.holdNextTrue = false;
          args[args.length - 1] = (response: MutationResponse) => {
            probe.response = response;
            pending = () => {
              Reflect.apply(callback, undefined, [response]);
            };
          };
          return forward(args);
        }
        if (
          captureValues.includes(true) &&
          probe.holdNextTrue &&
          !probe.held &&
          typeof callback === 'function'
        ) {
          probe.held = true;
          probe.holdNextTrue = false;
          pending = () => {
            void forward(args);
          };
          return undefined;
        }
        return forward(args);
      };
      Object.defineProperty(runtime, 'sendMessage', { configurable: true, value: wrapped });
      Object.defineProperty(globalThis, '__m05MountedMutationProbe', {
        configurable: true,
        value: probe
      });
    },
    { shouldHoldFirstTrue: holdFirstTrue, shouldDelayNativeAck: delayNativeAck }
  );
}

async function armNativeStorageFailureThenHoldRetry(worker: Worker): Promise<void> {
  await worker.evaluate(() => {
    const area = chrome.storage.sync;
    const original = area.set.bind(area);
    let pending: { items: Record<string, unknown>; callback?: () => void } | null = null;
    const probe: NativeStorageRetryProbe = {
      calls: 0,
      failures: 0,
      held: false,
      releases: 0,
      release() {
        if (!pending) throw new Error('No native retry write is pending.');
        const current = pending;
        pending = null;
        probe.releases += 1;
        if (current.callback) original(current.items, current.callback);
        else void original(current.items);
      }
    };
    const wrapped = (items: Record<string, unknown>, callback?: () => void) => {
      if (!Object.prototype.hasOwnProperty.call(items, 'options')) {
        return callback ? original(items, callback) : original(items);
      }
      probe.calls += 1;
      if (probe.failures === 0) {
        probe.failures += 1;
        throw new Error('MILESTONE_A_NATIVE_OPTIONS_WRITE_FAILURE');
      }
      if (!probe.held) {
        probe.held = true;
        pending = { items, ...(callback ? { callback } : {}) };
        return undefined;
      }
      return callback ? original(items, callback) : original(items);
    };
    Object.defineProperty(area, 'set', { configurable: true, value: wrapped });
    Object.defineProperty(globalThis, '__milestoneANativeStorageRetryProbe', {
      configurable: true,
      value: probe
    });
  });
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

type MutationFixtureValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | {
      defaultVaultId: string;
      vaults: {
        id: string;
        name: string;
        vault: string;
        httpsUrl: string;
        httpUrl: string;
        apiKey: string;
        localFolderId?: string;
        localFolderName?: string;
      }[];
    };
async function sendPatch(
  page: Page,
  pathParts: string[],
  value: MutationFixtureValue
): Promise<MutationResponse> {
  return sendPatches(page, [{ path: pathParts, value }]);
}

async function sendPatches(
  page: Page,
  patches: Array<{ path: string[]; value: MutationFixtureValue }>
): Promise<MutationResponse> {
  return page.evaluate<
    MutationResponse,
    { patches: Array<{ path: string[]; value: MutationFixtureValue }>; requestId: string }
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

type ReplacementFixture = { interfaceTheme: string; templates: { article: string } };
async function sendReplacement(
  page: Page,
  replacement: ReplacementFixture
): Promise<MutationResponse> {
  return page.evaluate<MutationResponse, { replacement: ReplacementFixture; requestId: string }>(
    async ({ replacement: next, requestId }) =>
      chrome.runtime.sendMessage({
        type: 'ZENDIO_OPTIONS_MUTATION',
        requestId,
        command: { kind: 'replace', replacement: next }
      }),
    { replacement, requestId: `replace-${crypto.randomUUID()}` }
  );
}

async function openF04Messenger(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/manifest.json`, {
    waitUntil: 'domcontentloaded'
  });
  return page;
}

async function sendF04Migration(page: Page): Promise<MutationResponse> {
  return page.evaluate<MutationResponse, string>(
    async (requestId) =>
      chrome.runtime.sendMessage({
        type: 'ZENDIO_OPTIONS_MUTATION',
        requestId,
        command: { kind: 'migrate' }
      }),
    `f04-migrate-${crypto.randomUUID()}`
  );
}

const f04DuplicatePortable = {
  interfaceTheme: 'light',
  vaultRouter: {
    defaultVaultId: 'shared',
    vaults: [
      {
        id: 'shared',
        name: 'Canonical',
        vault: 'Canonical',
        httpsUrl: 'https://canonical.example.com/',
        httpUrl: 'http://canonical.example.com/',
        apiKey: '',
        rules: [
          {
            id: 'same-rule',
            vaultId: 'shared',
            type: 'domain',
            pattern: 'nested-ignored.example.com',
            enabled: true,
            priority: 5
          }
        ]
      },
      {
        id: 'shared',
        name: 'Requires reauthorization',
        vault: 'Duplicate',
        httpsUrl: 'https://duplicate.example.com/',
        httpUrl: 'http://duplicate.example.com/',
        apiKey: '',
        rules: [
          {
            id: 'nested-duplicate',
            vaultId: 'shared',
            type: 'domain',
            pattern: 'nested.example.com',
            enabled: true,
            priority: 10
          }
        ]
      },
      {
        id: 'shared~legacy-duplicate-2',
        name: 'Existing compatibility collision',
        vault: 'Collision',
        httpsUrl: 'https://collision.example.com/',
        httpUrl: 'http://collision.example.com/',
        apiKey: '',
        rules: []
      },
      {
        id: 'unique',
        name: 'Unique',
        vault: 'Unique',
        httpsUrl: 'https://unique.example.com/',
        httpUrl: 'http://unique.example.com/',
        apiKey: '',
        rules: []
      }
    ],
    rules: [
      {
        id: 'same-rule',
        vaultId: 'shared',
        type: 'domain',
        pattern: 'legacy-first.example.com',
        enabled: true,
        priority: 100
      },
      {
        id: 'legacy-ambiguous',
        vaultId: 'shared',
        type: 'keyword',
        pattern: 'canonical',
        enabled: true,
        priority: 20
      },
      {
        id: 'legacy-unique',
        vaultId: 'unique',
        type: 'keyword',
        pattern: 'unique',
        enabled: true,
        priority: 5
      }
    ]
  }
};

const f04DuplicateBindings = {
  version: 1,
  bindings: {
    shared: { folderId: 'folder-canonical', folderName: 'Canonical Folder' },
    unique: { folderId: 'folder-unique', folderName: 'Unique Folder' },
    orphan: { folderId: 'folder-orphan', folderName: 'Orphan Folder' }
  }
};

async function seedF04DuplicateState(worker: Worker): Promise<void> {
  await worker.evaluate(
    async ({ options, bindings }) => {
      const localWrite = chrome.storage.local.set({ deviceLocalVaultBindings: bindings });
      const portableWrite = chrome.storage.sync.set({ options });
      await Promise.all([localWrite, portableWrite]);
    },
    { options: f04DuplicatePortable, bindings: f04DuplicateBindings }
  );
}

async function readF04IdentityState(worker: Worker) {
  return worker.evaluate(async (journalKey) => {
    const [sync, local] = await Promise.all([
      chrome.storage.sync.get<{ options?: JsonValue }>('options'),
      chrome.storage.local.get<Record<string, JsonValue>>(['deviceLocalVaultBindings', journalKey])
    ]);
    return {
      options: sync.options,
      bindings: local.deviceLocalVaultBindings,
      journal: local[journalKey]
    };
  }, cleanupJournalKey);
}

async function armF04PortableWriteFailure(worker: Worker) {
  return worker.evaluateHandle(() => {
    const storage = chrome.storage.sync;
    const originalSet = storage.set.bind(storage);
    const state = { failures: 0 };
    const record = (value: JsonValue): value is JsonRecord =>
      typeof value === 'object' && value !== null && !Array.isArray(value);
    const gatedSet = (items: JsonRecord, callback?: () => void) => {
      const options = items.options;
      const router = record(options) ? options.vaultRouter : undefined;
      const vaults = record(router) && Array.isArray(router.vaults) ? router.vaults : [];
      const isProposal = vaults.some(
        (vault) => record(vault) && vault.id === 'shared~legacy-duplicate-2-2'
      );
      if (state.failures === 0 && isProposal) {
        state.failures += 1;
        throw new Error('F04_PORTABLE_WRITE_FAILURE');
      }
      return callback ? originalSet(items, callback) : originalSet(items);
    };
    Object.defineProperty(storage, 'set', { configurable: true, value: gatedSet });
    return state;
  });
}

async function armF04BindingWriteFailure(worker: Worker) {
  return worker.evaluateHandle(() => {
    const storage = chrome.storage.local;
    const originalSet = storage.set.bind(storage);
    const state = { failures: 0 };
    const record = (value: JsonValue): value is JsonRecord =>
      typeof value === 'object' && value !== null && !Array.isArray(value);
    const gatedSet = (items: JsonRecord, callback?: () => void) => {
      const snapshot = items.deviceLocalVaultBindings;
      const bindings = record(snapshot) ? snapshot.bindings : undefined;
      const isProposal = record(bindings) && bindings.orphan === undefined;
      if (isProposal) {
        state.failures += 1;
        throw new Error('F04_BINDING_WRITE_FAILURE');
      }
      return callback ? originalSet(items, callback) : originalSet(items);
    };
    Object.defineProperty(storage, 'set', { configurable: true, value: gatedSet });
    return state;
  });
}

async function readRaw(page: Page): Promise<JsonRecord> {
  return page.evaluate<JsonRecord>(async () => {
    const result = await chrome.storage.sync.get<JsonRecord>('options');
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

// These restart fixtures use real, structured-cloned native handles. OPFS keeps
// all test files inside the private profile; this is not a folder-picker test.
async function seedNativeCleanupDirectory(worker: Worker): Promise<void> {
  await worker.evaluate(
    async ({ databaseName, storeName, folderId }) => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getDirectoryHandle(folderId, { create: true });
      const file = await handle.getFileHandle('preserve.md', { create: true });
      const writer = await file.createWritable();
      await writer.write('Vault contents survive registry cleanup.');
      await writer.close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(storeName))
            request.result.createObjectStore(storeName, { keyPath: 'id' });
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(storeName, 'readwrite', {
            durability: 'strict'
          });
          transaction.onabort = () => reject(transaction.error);
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.objectStore(storeName).put({
            id: folderId,
            name: 'Cleanup Journal Vault',
            handle
          });
        };
      });
    },
    {
      databaseName: localVaultDatabaseName,
      storeName: localVaultStoreName,
      folderId: cleanupFolderId
    }
  );
}

async function readNativeCleanupDirectory(worker: Worker) {
  return worker.evaluate(
    async ({ databaseName, storeName, folderId }) => {
      const stored = await new Promise<{
        present: boolean;
        handle: FileSystemDirectoryHandle | undefined;
      }>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(storeName, 'readonly');
          const get = transaction.objectStore(storeName).get(folderId);
          get.onerror = () => reject(get.error);
          get.onsuccess = () => {
            const record: unknown = get.result;
            database.close();
            resolve({
              present: record !== undefined,
              handle:
                typeof record === 'object' &&
                record !== null &&
                'handle' in record &&
                record.handle instanceof FileSystemDirectoryHandle
                  ? record.handle
                  : undefined
            });
          };
        };
      });
      const root = await navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle(folderId);
      const file = await directory.getFileHandle('preserve.md');
      return {
        handlePresent: stored.present,
        nativeHandle: stored.handle instanceof FileSystemDirectoryHandle,
        sameDirectory: stored.handle ? await stored.handle.isSameEntry(directory) : false,
        contents: await (await file.getFile()).text()
      };
    },
    {
      databaseName: localVaultDatabaseName,
      storeName: localVaultStoreName,
      folderId: cleanupFolderId
    }
  );
}

async function crashInstalledBrowser(context: BrowserContext, page: Page, worker: Worker) {
  const browser = context.browser();
  if (!browser) throw new Error('Installed extension must have an owning browser.');
  const session = await context.newCDPSession(page);
  const disconnected = new Promise<void>((resolve) =>
    browser.once('disconnected', () => resolve())
  );
  const closed = context.waitForEvent('close');
  const workerClosed = new Promise<void>((resolve) => worker.once('close', () => resolve()));
  // Public CDP Browser.crash kills the browser main thread; Browser.close and
  // context.close would flush a graceful shutdown and cannot prove this boundary.
  const result = await session.send('Browser.crash').then(
    () => 'unexpected acknowledgement',
    (error: Error) => error.message
  );
  await Promise.all([disconnected, closed, workerClosed]);
  expect(result).toMatch(/closed|crash/i);
  expect(browser.isConnected()).toBe(false);
  expect(page.isClosed()).toBe(true);
}

async function launchRestartProfile(userDataDir: string) {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
  const extensionId = worker.url().split('/')[2];
  if (!extensionId) throw new Error('Unable to resolve abrupt restart extension id.');
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/index.html`, {
    waitUntil: 'domcontentloaded'
  });
  return { context, worker, page, extensionId };
}

async function armDurableJournalPhase(worker: Worker, phase: ForwardPhase, failPrivacy: boolean) {
  return worker.evaluateHandle(
    ({ journalKey, phase, failPrivacy }) => {
      const storage = chrome.storage.local;
      const originalSet = storage.set.bind(storage);
      const state: { held: boolean; privacyFailures: number; phases: string[] } = {
        held: false,
        privacyFailures: 0,
        phases: []
      };
      const gatedSet = (items: JsonRecord, callback?: () => void) => {
        const consent = items.analytics_user_consent;
        if (
          failPrivacy &&
          state.privacyFailures === 0 &&
          typeof consent === 'object' &&
          consent !== null &&
          !Array.isArray(consent) &&
          consent.analytics === true
        ) {
          state.privacyFailures += 1;
          throw new Error('NATIVE_RESTART_FORWARD_PRIVACY_WRITE_FAILURE');
        }
        const candidate = items[journalKey];
        const record =
          typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
            ? candidate
            : undefined;
        const completed = originalSet(items).then(() => {
          if (record?.version === 3 && typeof record.phase === 'string') {
            state.phases.push(record.phase);
            if (record.phase === phase) {
              state.held = true;
              // The native write has completed. Withhold its continuation only;
              // no production recovery or subsequent physical write runs here.
              return new Promise<void>(() => undefined);
            }
          }
        });
        if (callback) {
          void completed.then(callback);
          return;
        }
        return completed;
      };
      Object.defineProperty(storage, 'set', { configurable: true, value: gatedSet });
      return state;
    },
    { journalKey: cleanupJournalKey, phase, failPrivacy }
  );
}

async function armNativeCleanupProgressFailure(worker: Worker, transactionId: string) {
  return worker.evaluateHandle(
    ({ journalKey, transactionId }) => {
      const storage = chrome.storage.local;
      const originalSet = storage.set.bind(storage);
      const state = { failures: 0 };
      const gatedSet = (items: JsonRecord, callback?: () => void) => {
        const value = items[journalKey];
        const candidate =
          typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
        if (
          state.failures === 0 &&
          candidate?.transactionId === transactionId &&
          candidate.phase === 'local-committed' &&
          Array.isArray(candidate.remainingCleanupCandidates) &&
          candidate.remainingCleanupCandidates.length === 0
        ) {
          state.failures += 1;
          throw new Error('NATIVE_RESTART_CLEANUP_PROGRESS_WRITE_FAILURE');
        }
        return callback ? originalSet(items, callback) : originalSet(items);
      };
      Object.defineProperty(storage, 'set', { configurable: true, value: gatedSet });
      return state;
    },
    { journalKey: cleanupJournalKey, transactionId }
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

  test('preserves independently mounted screenshot attachment leaves in both page orders', async () => {
    await Promise.all([first.close(), second.close()]);
    first = await context.newPage();
    second = await context.newPage();
    await Promise.all([
      installMountedMutationProbe(first, false),
      installMountedMutationProbe(second, false)
    ]);
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');
    const optionsUrl = `chrome-extension://${extensionId}/options/index.html`;
    const seed = async () => {
      await background.evaluate(() =>
        chrome.storage.sync.set({
          options: {
            interfaceTheme: 'light',
            video: {
              screenshotAttachment: {
                locationTemplate: './assets/base',
                fileNameTemplate: 'base.jpg',
                markdownUrlFormat: ''
              }
            }
          }
        })
      );
      await Promise.all([
        first.goto(optionsUrl, { waitUntil: 'domcontentloaded' }),
        second.goto(optionsUrl, { waitUntil: 'domcontentloaded' })
      ]);
    };
    const selector = '[data-panel-id="capture-sources"] input[type="text"]';
    const expectConverged = async () => {
      await expect
        .poll(() => readRaw(first))
        .toMatchObject({
          video: {
            screenshotAttachment: {
              locationTemplate: './assets/page-a',
              fileNameTemplate: 'page-b.jpg'
            }
          }
        });
      for (const page of [first, second]) {
        await expect(page.locator(selector).nth(0)).toHaveValue('./assets/page-a');
        await expect(page.locator(selector).nth(1)).toHaveValue('page-b.jpg');
      }
    };

    await seed();
    await first.locator(selector).nth(0).fill('./assets/page-a');
    await second.locator(selector).nth(1).fill('page-b.jpg');
    await expectConverged();
    await Promise.all([
      first.reload({ waitUntil: 'domcontentloaded' }),
      second.reload({ waitUntil: 'domcontentloaded' })
    ]);
    await expectConverged();

    await seed();
    await second.locator(selector).nth(1).fill('page-b.jpg');
    await first.locator(selector).nth(0).fill('./assets/page-a');
    await expectConverged();
    await first.locator(selector).nth(2).fill('![shot]({path})');
    await expect
      .poll(() => readRaw(first))
      .toMatchObject({
        video: {
          screenshotAttachment: {
            locationTemplate: './assets/page-a',
            fileNameTemplate: 'page-b.jpg',
            markdownUrlFormat: '![shot]({path})'
          }
        }
      });
    const paths: string[][] = [];
    paths.push(
      ...(await first.evaluate(() => globalThis.__m05MountedMutationProbe?.paths ?? [])),
      ...(await second.evaluate(() => globalThis.__m05MountedMutationProbe?.paths ?? []))
    );
    expect(paths).toContainEqual(['video', 'screenshotAttachment', 'locationTemplate']);
    expect(paths).toContainEqual(['video', 'screenshotAttachment', 'fileNameTemplate']);
    expect(paths).toContainEqual(['video', 'screenshotAttachment', 'markdownUrlFormat']);
    expect(paths).not.toContainEqual(['video', 'screenshotAttachment']);

    await second.close();
    second = await context.newPage();
    await second.goto(optionsUrl, { waitUntil: 'domcontentloaded' });
    await expect(second.locator(selector).nth(0)).toHaveValue('./assets/page-a');
    await expect(second.locator(selector).nth(1)).toHaveValue('page-b.jpg');
    await expect(second.locator(selector).nth(2)).toHaveValue('![shot]({path})');
  });

  test('settles an old native acknowledgement behind later same-field authority', async () => {
    await Promise.all([first.close(), second.close()]);
    first = await context.newPage();
    second = await context.newPage();
    await installMountedMutationProbe(first, true, true);
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');
    const optionsUrl = `chrome-extension://${extensionId}/options/index.html`;
    await background.evaluate(() =>
      chrome.storage.sync.set({
        options: {
          interfaceTheme: 'light',
          fragmentClipper: { captureContext: false, contextLength: 200 }
        }
      })
    );
    await Promise.all([
      first.goto(optionsUrl, { waitUntil: 'domcontentloaded' }),
      second.goto(optionsUrl, { waitUntil: 'domcontentloaded' })
    ]);
    const firstCapture = await openCaptureBehavior(first);
    const secondCapture = await openCaptureBehavior(second);

    await firstCapture.toggle.click();
    await expect
      .poll(() => first.evaluate(() => globalThis.__m05MountedMutationProbe?.held))
      .toBe(true);
    await expect(secondCapture.input).toBeChecked();
    await secondCapture.toggle.click();
    await expect
      .poll(async () => (await readRaw(second)).fragmentClipper)
      .toMatchObject({
        captureContext: false
      });
    await expect(firstCapture.input).not.toBeChecked();

    await first.evaluate(() => globalThis.__m05MountedMutationProbe?.release());
    await expect(firstCapture.input).not.toBeChecked();
    await expect(secondCapture.input).not.toBeChecked();
    await expect
      .poll(async () => (await readRaw(first)).fragmentClipper)
      .toMatchObject({
        captureContext: false,
        contextLength: 200
      });
    const probe = await first.evaluate(() => {
      const current = globalThis.__m05MountedMutationProbe;
      return current
        ? { held: current.held, released: current.released, response: current.response }
        : null;
    });
    expect(probe).toMatchObject({ held: true, released: true });
    expect(probe?.response).toMatchObject({ success: true });
  });

  test('settles a queued later local intent before delayed repository invalidations', async () => {
    await Promise.all([first.close(), second.close()]);
    first = await context.newPage();
    await Promise.all([
      installMountedMutationProbe(first, true, true),
      installDelayedOptionsEventProbe(first, true)
    ]);
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');
    const optionsUrl = `chrome-extension://${extensionId}/options/index.html`;
    await background.evaluate(() =>
      chrome.storage.sync.set({
        options: {
          interfaceTheme: 'light',
          fragmentClipper: { captureContext: false, contextLength: 200 },
          vaultRouter: {
            defaultVaultId: 'default',
            vaults: [
              {
                apiKey: '',
                enabled: true,
                httpUrl: 'http://127.0.0.1:27123/',
                httpsUrl: 'https://127.0.0.1:27124/',
                id: 'default',
                isDefault: true,
                name: 'Zendio',
                vault: 'Zendio'
              }
            ]
          }
        }
      })
    );
    await first.goto(optionsUrl, { waitUntil: 'domcontentloaded' });
    const capture = await openCaptureBehavior(first);
    await first.waitForTimeout(500);
    await first.evaluate(() => {
      const probe = globalThis.__m05DelayedOptionsEventProbe;
      if (!probe) throw new Error('Delayed Options event probe missing.');
      probe.arm();
    });

    await capture.toggle.click();
    await expect(capture.input).toBeChecked();
    await expect
      .poll(() => first.evaluate(() => globalThis.__m05MountedMutationProbe?.held ?? false))
      .toBe(true);
    await expect
      .poll(() => first.evaluate(() => globalThis.__m05DelayedOptionsEventProbe?.held ?? 0))
      .toBeGreaterThan(0);
    await capture.toggle.click();
    await expect(capture.input).not.toBeChecked();
    await first.waitForTimeout(650);
    expect(
      await first.evaluate(() => globalThis.__m05MountedMutationProbe?.captureValues ?? [])
    ).toEqual([true]);

    await first.evaluate(() => {
      const probe = globalThis.__m05MountedMutationProbe;
      if (!probe) throw new Error('Mounted mutation probe missing.');
      probe.holdNextFalse = true;
      probe.release();
    });
    await expect
      .poll(() => first.evaluate(() => globalThis.__m05MountedMutationProbe?.falseHeld ?? false))
      .toBe(true);
    const heldAfterFirst = await first.evaluate(
      () => globalThis.__m05DelayedOptionsEventProbe?.held ?? 0
    );
    await background.evaluate(async () => {
      const stored = await chrome.storage.sync.get<{ options?: Record<string, unknown> }>(
        'options'
      );
      await chrome.storage.sync.set({
        options: { ...(stored.options ?? {}), interfaceTheme: 'dark' }
      });
    });
    await first.evaluate(() => {
      const probe = globalThis.__m05DelayedOptionsEventProbe;
      if (!probe) throw new Error('Delayed Options event probe missing.');
      while (probe.pending > 0) probe.releaseNext();
    });
    await expect
      .poll(() => first.evaluate(() => globalThis.__m05DelayedOptionsEventProbe?.pending ?? -1))
      .toBe(0);
    await expect(
      first.locator('[data-panel-id="overview"] .chips button[data-value="dark"]')
    ).toHaveClass(/is-active/u);

    await first.evaluate(() => globalThis.__m05MountedMutationProbe?.release());
    await expect
      .poll(() => first.evaluate(() => globalThis.__m05MountedMutationProbe?.captureValues ?? []))
      .toEqual([true, false]);
    await expect
      .poll(() =>
        first.evaluate(
          (previous) => (globalThis.__m05DelayedOptionsEventProbe?.held ?? 0) > previous,
          heldAfterFirst
        )
      )
      .toBe(true);
    await expect
      .poll(() => readRaw(first))
      .toMatchObject({
        interfaceTheme: 'dark',
        fragmentClipper: { captureContext: false, contextLength: 200 }
      });

    await first.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await first.waitForTimeout(1000);
    expect(
      await first.evaluate(() => globalThis.__m05MountedMutationProbe?.captureValues ?? [])
    ).toEqual([true, false]);
    await expect(capture.input).not.toBeChecked();

    const heldAfterSecond = await first.evaluate(
      () => globalThis.__m05DelayedOptionsEventProbe?.held ?? 0
    );
    await first.evaluate(() => {
      const probe = globalThis.__m05DelayedOptionsEventProbe;
      if (!probe) throw new Error('Delayed Options event probe missing.');
      while (probe.pending > 0) probe.releaseNext();
    });
    await expect
      .poll(() =>
        first.evaluate(() => {
          const probe = globalThis.__m05DelayedOptionsEventProbe;
          return probe ? { pending: probe.pending, released: probe.released } : null;
        })
      )
      .toEqual({
        pending: 0,
        released: heldAfterSecond
      });
    await expect(capture.input).not.toBeChecked();

    await first.reload({ waitUntil: 'domcontentloaded' });
    const reloaded = await openCaptureBehavior(first);
    await expect(reloaded.input).not.toBeChecked();

    await first.close();
    first = await context.newPage();
    await first.goto(optionsUrl, { waitUntil: 'domcontentloaded' });
    const reopened = await openCaptureBehavior(first);
    await expect(reopened.input).not.toBeChecked();
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
      .poll(() => first.evaluate(() => globalThis.__m05MountedMutationProbe?.held ?? false))
      .toBe(true);
    await outputText.evaluate((input) => {
      if (!(input instanceof HTMLInputElement)) throw new Error('Expected text input.');
      const identity = globalThis.__m05OptionsIdentity;
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
      const identity = globalThis.__m05OptionsIdentity;
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
      const identity = globalThis.__m05OptionsIdentity;
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
      const probe = globalThis.__m05MountedMutationProbe;
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
          const probe = globalThis.__m05MountedMutationProbe;
          return probe ? { paths: probe.paths, values: probe.captureValues } : null;
        })
      )
      .toMatchObject({ values: [true, false] });
    const paths = await first.evaluate(() => globalThis.__m05MountedMutationProbe?.paths ?? []);
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
        options: {
          interfaceTheme: 'system',
          fragmentClipper: { captureContext: false },
          vaultRouter: {
            defaultVaultId: 'default',
            vaults: [
              {
                apiKey: '',
                enabled: true,
                httpUrl: 'http://127.0.0.1:27123/',
                httpsUrl: 'https://127.0.0.1:27124/',
                id: 'default',
                isDefault: true,
                name: 'Zendio',
                vault: 'Zendio'
              }
            ]
          }
        }
      })
    );
    await first.goto(optionsUrl, { waitUntil: 'domcontentloaded' });
    const capture = await openCaptureBehavior(first);
    await armNativeStorageFailureThenHoldRetry(background);
    await capture.toggle.click();
    await expect(capture.input).toBeChecked();
    await expect.poll(() => autoSaveErrors.length).toBe(1);
    await expect
      .poll(async () => (await readRaw(first)).fragmentClipper)
      .toMatchObject({
        captureContext: false
      });
    const alert = first.locator('[data-message-lane="autosave"]');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute('role', 'alert');
    await expect(alert).toHaveAttribute('aria-live', 'assertive');
    await expect(alert).toContainText(/save failed/i);
    const retry = alert.locator('button');
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(retry).toBeDisabled();
    await expect(retry).toHaveAttribute('aria-busy', 'true');
    await retry.click({ force: true });
    await expect
      .poll(() =>
        background.evaluate(() => globalThis.__milestoneANativeStorageRetryProbe?.calls ?? 0)
      )
      .toBe(2);
    await background.evaluate(() => globalThis.__milestoneANativeStorageRetryProbe?.release());
    await expect
      .poll(async () => (await readRaw(first)).fragmentClipper)
      .toMatchObject({ captureContext: true });
    await expect(alert).toBeHidden();
    await clickTheme(first, 'dark');
    await expect.poll(async () => (await readRaw(first)).interfaceTheme).toBe('dark');
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

  test('clears a failed alert when the mounted edit reverses without another write', async () => {
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
        options: {
          interfaceTheme: 'light',
          templates: { article: 'Original/{title}.md' },
          vaultRouter: {
            defaultVaultId: 'default',
            vaults: [
              {
                apiKey: '',
                enabled: true,
                httpUrl: 'http://127.0.0.1:27123/',
                httpsUrl: 'https://127.0.0.1:27124/',
                id: 'default',
                isDefault: true,
                name: 'Zendio',
                vault: 'Zendio'
              }
            ]
          }
        }
      })
    );
    await first.goto(optionsUrl, { waitUntil: 'domcontentloaded' });
    const template = first.locator('[data-template-field="articleVideo"]');
    await expect(template).toHaveValue('Original/{title}.md');
    await armNativeStorageFailureThenHoldRetry(background);
    await template.fill('Failed/{title}.md');

    const alert = first.locator('[data-message-lane="autosave"]');
    await expect(alert).toBeVisible();
    await expect(template).toHaveValue('Failed/{title}.md');
    await expect
      .poll(() =>
        background.evaluate(() => globalThis.__milestoneANativeStorageRetryProbe?.calls ?? 0)
      )
      .toBe(1);
    await expect
      .poll(async () => {
        const raw = await readRaw(first);
        return isJsonRecord(raw.templates) ? raw.templates.article : undefined;
      })
      .toBe('Original/{title}.md');

    await template.fill('Original/{title}.md');
    await expect(template).toHaveValue('Original/{title}.md');
    await expect
      .poll(() =>
        background.evaluate(() => globalThis.__milestoneANativeStorageRetryProbe?.calls ?? 0)
      )
      .toBe(1);
    await expect
      .poll(() => first.evaluate(() => globalThis.__m05MountedMutationProbe?.paths ?? []))
      .toEqual([['templates', 'article']]);
    expect(autoSaveErrors).toHaveLength(1);
    await expect(alert).toBeHidden();

    await first.evaluate(async () => {
      const oldShell = document.querySelector<HTMLElement>('#optionsShellRoot > *');
      const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
      if (!oldShell || !entry) throw new Error('Options rebootstrap fixture missing.');
      oldShell.dataset.milestoneAOldShell = 'true';
      await import(`${entry.src}?milestone-a-reentry=${Date.now()}`);
    });
    await expect.poll(() => first.locator('[data-milestone-a-old-shell]').count()).toBe(0);
    await expect(first.locator('[data-message-lane="autosave"]')).toBeHidden();
    await expect(first.locator('[data-template-field="articleVideo"]')).toHaveValue(
      'Original/{title}.md'
    );
    await expect
      .poll(() =>
        background.evaluate(() => globalThis.__milestoneANativeStorageRetryProbe?.calls ?? 0)
      )
      .toBe(1);

    await first.close();
    first = await context.newPage();
    await first.goto(optionsUrl, { waitUntil: 'domcontentloaded' });
    await expect(first.locator('[data-template-field="articleVideo"]')).toHaveValue(
      'Original/{title}.md'
    );
    await expect(first.locator('[data-message-lane="autosave"]')).toBeHidden();
  });

  test('retains a quota-rejected template until a corrected field edit succeeds', async () => {
    await Promise.all([first.close(), second.close()]);
    first = await context.newPage();
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');
    const optionsUrl = `chrome-extension://${extensionId}/options/index.html`;
    await background.evaluate(() =>
      chrome.storage.sync.set({
        options: {
          interfaceTheme: 'light',
          vaultRouter: {
            defaultVaultId: 'default',
            vaults: [
              {
                apiKey: '',
                enabled: true,
                httpUrl: 'http://127.0.0.1:27123/',
                httpsUrl: 'https://127.0.0.1:27124/',
                id: 'default',
                isDefault: true,
                name: 'Zendio',
                vault: 'Zendio'
              }
            ]
          }
        }
      })
    );
    await first.goto(optionsUrl, { waitUntil: 'domcontentloaded' });
    const template = first.locator('[data-template-field="articleVideo"]');
    const overQuota = `Audit/${'x'.repeat(8500)}.md`;
    await template.fill(overQuota);

    const alert = first.locator('[data-message-lane="autosave"]');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/save failed/i);
    await expect(alert).toContainText(/shorten|correct/i);
    await expect(alert.locator('button')).toBeVisible();
    const rawAfterFailure = await readRaw(first);
    expect(
      isJsonRecord(rawAfterFailure.templates) ? rawAfterFailure.templates.article : undefined
    ).not.toBe(overQuota);
    await expect(template).toHaveValue(overQuota);

    const corrected = 'Video/{title}.md';
    await template.fill(corrected);
    await expect
      .poll(async () => {
        const raw = await readRaw(first);
        return isJsonRecord(raw.templates) ? raw.templates.article : undefined;
      })
      .toBe(corrected);
    await expect(alert).toBeHidden();
    await first.reload({ waitUntil: 'domcontentloaded' });
    await expect(first.locator('[data-template-field="articleVideo"]')).toHaveValue(corrected);
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
      await freshPage.evaluate<void, object>(
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

  test('F04 migrates duplicate Vault identity and canonical bindings across restart', async () => {
    await Promise.all([first.close(), second.close()]);
    await seedF04DuplicateState(background);

    const expectedIds = [
      'shared',
      'shared~legacy-duplicate-2-2',
      'shared~legacy-duplicate-2',
      'unique'
    ];
    const assertMigrated = async (worker: Worker) => {
      await expect
        .poll(async () => {
          const state = await readF04IdentityState(worker);
          return { bindings: state.bindings, journal: state.journal };
        })
        .toEqual({
          bindings: {
            version: 1,
            bindings: {
              shared: { folderId: 'folder-canonical', folderName: 'Canonical Folder' },
              unique: { folderId: 'folder-unique', folderName: 'Unique Folder' }
            }
          },
          journal: undefined
        });
      const state = await readF04IdentityState(worker);
      expect(state.options).toMatchObject({
        interfaceTheme: 'light',
        vaultRouter: { defaultVaultId: 'shared' }
      });
      if (!isJsonRecord(state.options) || !isJsonRecord(state.options.vaultRouter)) {
        throw new Error('F04 migrated router missing.');
      }
      const vaults = state.options.vaultRouter.vaults;
      if (!Array.isArray(vaults)) throw new Error('F04 migrated Vault rows missing.');
      expect(vaults).toHaveLength(4);
      expect(vaults.map((vault) => (isJsonRecord(vault) ? vault.id : undefined))).toEqual(
        expectedIds
      );
      const canonical = vaults[0];
      const renamed = vaults[1];
      const unique = vaults[3];
      if (!isJsonRecord(canonical) || !isJsonRecord(renamed) || !isJsonRecord(unique)) {
        throw new Error('F04 migrated Vault row malformed.');
      }
      expect(canonical.rules).toMatchObject([
        {
          id: 'same-rule',
          vaultId: 'shared',
          pattern: 'nested-ignored.example.com',
          priority: 5
        }
      ]);
      expect(renamed.rules).toMatchObject([
        { id: 'nested-duplicate', vaultId: 'shared~legacy-duplicate-2-2' }
      ]);
      expect(unique.rules).toEqual([]);
      expect(state.options.vaultRouter.rules).toMatchObject([
        {
          id: 'same-rule',
          vaultId: 'shared',
          pattern: 'legacy-first.example.com',
          priority: 100
        },
        { id: 'legacy-ambiguous', vaultId: 'shared' },
        { id: 'legacy-unique', vaultId: 'unique' }
      ]);
    };

    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve F04 extension id.');
    first = await openF04Messenger(context, extensionId);
    const migrated = await sendF04Migration(first);
    expect(migrated.success).toBe(true);
    expect(migrated.result?.snapshot).toMatchObject({
      vaultRouter: {
        defaultVaultId: 'shared',
        rules: [
          {
            id: 'same-rule',
            vaultId: 'shared',
            pattern: 'legacy-first.example.com',
            priority: 100
          },
          { id: 'legacy-ambiguous', vaultId: 'shared' },
          { id: 'legacy-unique', vaultId: 'unique' }
        ],
        vaults: [
          {
            id: 'shared',
            localFolderId: 'folder-canonical',
            localFolderName: 'Canonical Folder'
          },
          { id: 'shared~legacy-duplicate-2-2' },
          { id: 'shared~legacy-duplicate-2' },
          {
            id: 'unique',
            localFolderId: 'folder-unique',
            localFolderName: 'Unique Folder'
          }
        ]
      }
    });
    const snapshotVaults = migrated.result?.snapshot?.vaultRouter;
    if (!isJsonRecord(snapshotVaults) || !Array.isArray(snapshotVaults.vaults)) {
      throw new Error('F04 migration snapshot missing.');
    }
    expect(snapshotVaults.vaults[1]).not.toHaveProperty('localFolderId');
    expect(snapshotVaults.vaults[2]).not.toHaveProperty('localFolderId');

    await assertMigrated(background);
    const repeated = await sendF04Migration(first);
    expect(repeated.success).toBe(true);
    expect(repeated.result?.didWrite).toBe(false);

    await context.close();
    const restarted = await launchRestartProfile(userDataDir);
    context = restarted.context;
    background = restarted.worker;
    first = restarted.page;
    await assertMigrated(background);
    const storageNav = first.locator('[data-nav-panel="storage"]');
    await storageNav.click();
    await expect(storageNav).toHaveClass(/is-active/u);
    await expect(
      first.locator('.local-folder-trigger').filter({ hasText: 'Canonical Folder' })
    ).toHaveCount(1);
    await expect(
      first.locator('.local-folder-trigger').filter({ hasText: 'Unique Folder' })
    ).toHaveCount(1);
    await expect(first.getByText('Orphan Folder', { exact: true })).toHaveCount(0);
    await expect(first.locator('.storage-vault-table-scroll tbody tr')).toHaveCount(4);
    const routingRows = first.locator('.routing-rules-table-scroll tbody tr');
    await expect(routingRows).toHaveCount(4);
    const routingPatterns = first.locator('.routing-rules-table-scroll tbody input[type="text"]');
    await expect(routingPatterns).toHaveCount(4);
    const expectedPatterns = [
      'legacy-first.example.com',
      'canonical',
      'unique',
      'nested.example.com'
    ];
    for (const [index, pattern] of expectedPatterns.entries()) {
      await expect(routingPatterns.nth(index)).toHaveValue(pattern);
    }
  });

  test('F04 recovers portable and binding migration failures without copied authority', async () => {
    await Promise.all([first.close(), second.close()]);
    first = await context.newPage();
    const portableProbe = await armF04PortableWriteFailure(background);
    await seedF04DuplicateState(background);
    await expect.poll(() => portableProbe.evaluate(({ failures }) => failures)).toBe(1);
    await expect
      .poll(async () => {
        const state = await readF04IdentityState(background);
        const router = isJsonRecord(state.options) ? state.options.vaultRouter : undefined;
        const vaults = isJsonRecord(router) && Array.isArray(router.vaults) ? router.vaults : [];
        return {
          ids: vaults.map((vault) => (isJsonRecord(vault) ? vault.id : undefined)),
          bindings: state.bindings,
          journal: state.journal
        };
      })
      .toEqual({
        ids: ['shared', 'shared~legacy-duplicate-2-2', 'shared~legacy-duplicate-2', 'unique'],
        bindings: {
          version: 1,
          bindings: {
            shared: { folderId: 'folder-canonical', folderName: 'Canonical Folder' },
            unique: { folderId: 'folder-unique', folderName: 'Unique Folder' }
          }
        },
        journal: undefined
      });

    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve F04 extension id.');
    await first.close();
    first = await openF04Messenger(context, extensionId);
    const portableRetry = await sendF04Migration(first);
    expect(portableRetry.success).toBe(true);
    expect(portableRetry.result?.didWrite).toBe(false);
    const afterPortableRetry = await readF04IdentityState(background);
    expect(afterPortableRetry.journal).toBeUndefined();
    expect(afterPortableRetry.bindings).toEqual({
      version: 1,
      bindings: {
        shared: { folderId: 'folder-canonical', folderName: 'Canonical Folder' },
        unique: { folderId: 'folder-unique', folderName: 'Unique Folder' }
      }
    });
    expect(afterPortableRetry.options).toMatchObject({
      vaultRouter: {
        defaultVaultId: 'shared',
        rules: [
          { id: 'same-rule', pattern: 'legacy-first.example.com', priority: 100 },
          { id: 'legacy-ambiguous', vaultId: 'shared' },
          { id: 'legacy-unique', vaultId: 'unique' }
        ],
        vaults: [
          {
            id: 'shared',
            rules: [{ id: 'same-rule', pattern: 'nested-ignored.example.com', priority: 5 }]
          },
          {
            id: 'shared~legacy-duplicate-2-2',
            rules: [{ id: 'nested-duplicate', vaultId: 'shared~legacy-duplicate-2-2' }]
          },
          { id: 'shared~legacy-duplicate-2' },
          { id: 'unique' }
        ]
      }
    });

    const bindingProbe = await armF04BindingWriteFailure(background);
    await background.evaluate(
      (bindings) => chrome.storage.local.set({ deviceLocalVaultBindings: bindings }),
      f04DuplicateBindings
    );
    const bindingFailure = await sendF04Migration(first);
    expect(bindingFailure).toMatchObject({
      success: false,
      errorCode: 'OPTIONS_STORAGE_FAILURE'
    });
    await expect.poll(() => bindingProbe.evaluate(({ failures }) => failures)).toBeGreaterThan(0);
    const interrupted = await readF04IdentityState(background);
    expect(interrupted.bindings).toEqual(f04DuplicateBindings);

    await first.close();
    first = await context.newPage();
    await crashInstalledBrowser(context, first, background);
    const restarted = await launchRestartProfile(userDataDir);
    context = restarted.context;
    background = restarted.worker;
    first = restarted.page;
    await expect
      .poll(() => readF04IdentityState(background))
      .toMatchObject({
        bindings: {
          version: 1,
          bindings: {
            shared: { folderId: 'folder-canonical', folderName: 'Canonical Folder' },
            unique: { folderId: 'folder-unique', folderName: 'Unique Folder' }
          }
        },
        journal: undefined
      });
    const recovered = await readF04IdentityState(background);
    if (!isJsonRecord(recovered.options) || !isJsonRecord(recovered.options.vaultRouter)) {
      throw new Error('F04 recovered router missing.');
    }
    const vaults = recovered.options.vaultRouter.vaults;
    if (!Array.isArray(vaults)) throw new Error('F04 recovered Vault rows missing.');
    expect(vaults.map((vault) => (isJsonRecord(vault) ? vault.id : undefined))).toEqual([
      'shared',
      'shared~legacy-duplicate-2-2',
      'shared~legacy-duplicate-2',
      'unique'
    ]);
    expect(recovered.options.vaultRouter).toMatchObject({
      defaultVaultId: 'shared',
      rules: [
        { id: 'same-rule', pattern: 'legacy-first.example.com', priority: 100 },
        { id: 'legacy-ambiguous', vaultId: 'shared' },
        { id: 'legacy-unique', vaultId: 'unique' }
      ],
      vaults: [
        {
          id: 'shared',
          rules: [{ id: 'same-rule', pattern: 'nested-ignored.example.com', priority: 5 }]
        },
        {
          id: 'shared~legacy-duplicate-2-2',
          rules: [{ id: 'nested-duplicate', vaultId: 'shared~legacy-duplicate-2-2' }]
        },
        { id: 'shared~legacy-duplicate-2' },
        { id: 'unique' }
      ]
    });
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
      const gatedSet = (items: JsonRecord, callback?: () => void) => {
        const candidate = items.options;
        const options =
          typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
            ? candidate
            : null;
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
        const next = changes.options?.newValue;
        const pending = state.pending[0];
        if (
          area !== 'sync' ||
          typeof next !== 'object' ||
          next === null ||
          Array.isArray(next) ||
          !('interfaceTheme' in next) ||
          next.interfaceTheme !== 'light' ||
          !pending
        )
          return;
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
      const state: DriftState = {
        count: 0,
        writes: [],
        listener: () => undefined
      };
      state.listener = (changes, area) => {
        const next = changes.options?.newValue;
        if (
          area !== 'sync' ||
          typeof next !== 'object' ||
          next === null ||
          Array.isArray(next) ||
          !('interfaceTheme' in next) ||
          next.interfaceTheme !== 'dark' ||
          state.count >= 3
        )
          return;
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
    const cleanupPortablePreimage = {
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
    } satisfies JsonRecord;
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
          const local = await chrome.storage.local.get<JsonRecord>([
            'deviceLocalVaultBindings',
            cleanupKey
          ]);
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

type ForwardRecoveryRow = {
  id: string;
  phase: ForwardPhase;
  portable: ForwardPortable;
  privacy: ForwardPrivacy;
  privacyMarker?: ForwardPrivacyMarker;
  bindings: ForwardBindings;
  expectedPortable: ForwardPortable;
  expectedPrivacy: ForwardPrivacy;
  expectedBindings: ForwardBindings;
  expectedHandle: boolean;
  success: boolean;
  errorCode?: 'EXTERNAL_SYNC_CONFLICT';
};
const forwardRows: ForwardRecoveryRow[] = [
  {
    id: 'F1 prepared only',
    phase: 'prepared',
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
    phase: 'forward-inflight',
    portable: forwardPortableProposal,
    privacy: privacyRestore,
    privacyMarker: 'prepared',
    bindings: forwardProposedBindings,
    expectedPortable: forwardPortablePreimage,
    expectedPrivacy: privacyRestore,
    expectedBindings: forwardPreviousBindings,
    expectedHandle: true,
    success: false
  },
  {
    id: 'F3 privacy commit-ready before values',
    phase: 'forward-inflight',
    portable: forwardPortableProposal,
    privacy: privacyRestore,
    privacyMarker: 'commit-ready',
    bindings: forwardProposedBindings,
    expectedPortable: forwardPortablePreimage,
    expectedPrivacy: privacyRestore,
    expectedBindings: forwardPreviousBindings,
    expectedHandle: true,
    success: false
  },
  {
    id: 'F4 exact forward privacy',
    phase: 'forward-inflight',
    portable: forwardPortableProposal,
    privacy: privacyForward,
    privacyMarker: 'commit-ready',
    bindings: forwardProposedBindings,
    expectedPortable: forwardPortableProposal,
    expectedPrivacy: privacyForward,
    expectedBindings: forwardProposedBindings,
    expectedHandle: false,
    success: true
  },
  {
    id: 'F5 portable preimage with forward privacy',
    phase: 'forward-inflight',
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
    phase: 'forward-inflight',
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
    phase: 'forward-inflight',
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
    phase: 'local-commit-inflight',
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
    phase: 'local-commit-inflight',
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
    phase: 'local-commit-inflight',
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
];

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

      const expectedPortable = row.expectedPortable;
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

type RestartRow = ForwardRecoveryRow & {
  journalOptions?: Parameters<typeof createForwardJournal>[2];
  handleBeforeCrash?: boolean;
  journalRemains?: boolean;
  progressFault?: boolean;
};
const committedRestartState = {
  portable: forwardPortableProposal,
  privacy: privacyForward,
  bindings: forwardProposedBindings,
  expectedPortable: forwardPortableProposal,
  expectedPrivacy: privacyForward,
  expectedBindings: forwardProposedBindings,
  expectedHandle: false,
  success: true
};
const compensationRestartState = {
  portable: forwardPortableProposal,
  privacy: privacyForward,
  bindings: forwardProposedBindings,
  expectedPortable: forwardPortablePreimage,
  expectedPrivacy: privacyRestore,
  expectedBindings: forwardPreviousBindings,
  expectedHandle: true,
  success: false
};
const restartRows: RestartRow[] = [
  ...forwardRows,
  { id: 'forward committed', phase: 'forward-committed', ...committedRestartState },
  {
    id: 'compensating before portable restore',
    phase: 'compensating',
    ...compensationRestartState,
    journalOptions: {
      recovery: { outcomeCode: 'OPTIONS_STORAGE_FAILURE', bindingWriteMayHaveOccurred: true }
    }
  },
  {
    id: 'compensating between portable and privacy restore',
    phase: 'compensating',
    ...compensationRestartState,
    portable: forwardPortablePreimage,
    journalOptions: {
      recovery: { outcomeCode: 'OPTIONS_STORAGE_FAILURE', bindingWriteMayHaveOccurred: true }
    }
  },
  {
    id: 'restored before binding restore',
    phase: 'portable-privacy-restored',
    ...compensationRestartState,
    portable: forwardPortablePreimage,
    privacy: privacyRestore,
    journalOptions: {
      recovery: {
        outcomeCode: 'OPTIONS_STORAGE_FAILURE',
        bindingWriteMayHaveOccurred: true,
        portableRestoreEvidence: 'preimage',
        privacyRestoreEvidence: 'restore-target'
      }
    }
  },
  {
    id: 'restored preserves third binding',
    phase: 'portable-privacy-restored',
    ...compensationRestartState,
    portable: forwardPortablePreimage,
    privacy: privacyRestore,
    bindings: {
      version: 1,
      bindings: { primary: { folderId: 'third-folder', folderName: 'Third Folder' } }
    },
    expectedBindings: {
      version: 1,
      bindings: { primary: { folderId: 'third-folder', folderName: 'Third Folder' } }
    },
    journalOptions: {
      recovery: {
        outcomeCode: 'EXTERNAL_SYNC_CONFLICT',
        bindingWriteMayHaveOccurred: true,
        portableRestoreEvidence: 'preimage',
        privacyRestoreEvidence: 'restore-target'
      }
    }
  },
  { id: 'local committed pending cleanup', phase: 'local-committed', ...committedRestartState },
  {
    id: 'local committed authority conflict preserves journal and handle',
    phase: 'local-committed',
    ...committedRestartState,
    portable: { ...forwardPortableProposal, opaqueRoot: { third: true } },
    expectedPortable: { ...forwardPortableProposal, opaqueRoot: { third: true } },
    expectedHandle: true,
    journalRemains: true
  },
  {
    id: 'local committed after delete before progress',
    phase: 'local-committed',
    ...committedRestartState,
    handleBeforeCrash: false
  },
  {
    id: 'F8 actual post-delete progress failure',
    phase: 'local-committed',
    ...committedRestartState,
    handleBeforeCrash: false,
    progressFault: true
  },
  {
    id: 'cleanup complete pending journal removal',
    phase: 'cleanup-complete',
    ...committedRestartState,
    handleBeforeCrash: false,
    journalOptions: { remaining: [] }
  },
  {
    id: 'cleanup complete never deletes a subsequently stored handle',
    phase: 'cleanup-complete',
    ...committedRestartState,
    expectedHandle: true,
    journalOptions: { remaining: [] }
  },
  {
    id: 'aborted pending journal removal',
    phase: 'aborted',
    ...compensationRestartState,
    portable: forwardPortablePreimage,
    privacy: privacyRestore,
    bindings: forwardPreviousBindings,
    journalOptions: { abortReason: 'local-commit-failed' }
  },
  {
    id: 'F9 prepared no writes never advances',
    phase: 'prepared',
    ...compensationRestartState,
    portable: forwardPortablePreimage,
    privacy: privacyRestore,
    bindings: forwardPreviousBindings,
    journalOptions: {
      portableProposal: forwardPortablePreimage,
      portableWriteRequired: false,
      privacyForwardTarget: privacyRestore,
      privacyWriteRequired: false
    }
  },
  ...[false, true].flatMap((portableWrite) =>
    [false, true].map(
      (privacyWrite): RestartRow => ({
        id: `F9 inflight writes ${Number(portableWrite)}-${Number(privacyWrite)}`,
        phase: 'forward-inflight',
        ...committedRestartState,
        portable: portableWrite ? forwardPortableProposal : forwardPortablePreimage,
        privacy: privacyWrite ? privacyForward : privacyRestore,
        expectedPortable: portableWrite ? forwardPortableProposal : forwardPortablePreimage,
        expectedPrivacy: privacyWrite ? privacyForward : privacyRestore,
        journalOptions: {
          portableProposal: portableWrite ? forwardPortableProposal : forwardPortablePreimage,
          portableWriteRequired: portableWrite,
          privacyForwardTarget: privacyWrite ? privacyForward : privacyRestore,
          privacyWriteRequired: privacyWrite
        }
      })
    )
  )
];

async function expectRestartOutcome(
  installed: Awaited<ReturnType<typeof launchRestartProfile>>,
  row: RestartRow
) {
  // Check startup itself before sending another command that could recover a
  // journal left behind by a broken initialization path.
  await expect
    .poll(() => readForwardSemanticState(installed.page))
    .toEqual({
      portable: row.expectedPortable,
      privacy: row.expectedPrivacy,
      bindings: row.expectedBindings,
      journalPresent: row.journalRemains === true
    });
  expect(await readNativeCleanupDirectory(installed.worker)).toEqual({
    handlePresent: row.expectedHandle,
    nativeHandle: row.expectedHandle,
    sameDirectory: row.expectedHandle,
    contents: 'Vault contents survive registry cleanup.'
  });
  await expect(
    installed.page.locator(
      `[data-panel-id="overview"] .chips button[data-value="${row.expectedPortable.interfaceTheme}"]`
    )
  ).toHaveAttribute('aria-pressed', 'true');
  for (const binding of Object.values(row.expectedBindings.bindings)) {
    await expect(
      installed.page.locator('.local-folder-trigger').filter({ hasText: binding.folderName })
    ).toHaveCount(1);
  }
  const response = await sendPatch(
    installed.page,
    ['interfaceTheme'],
    row.expectedPortable.interfaceTheme
  );
  if (row.journalRemains) {
    expect(response.success).toBe(false);
    expect(response.errorCode).toBe('EXTERNAL_SYNC_CONFLICT');
    expect(response.result).toBeUndefined();
    expect((await readForwardState(installed.page)).local[cleanupJournalKey]).toEqual(
      createForwardJournal(`abrupt-${row.id}`, row.phase, row.journalOptions)
    );
  } else {
    expect(response.success).toBe(true);
    expect(response.errorCode).toBeUndefined();
    // Persisted third-party debug intent must survive untouched, while the
    // acknowledgement obeys the deployed build's dev-only debug capability.
    const debugControlAvailable =
      (await installed.page.getByText('Debug mode', { exact: true }).count()) > 0;
    expect(response.result?.snapshot).toMatchObject({
      interfaceTheme: row.expectedPortable.interfaceTheme,
      privacyPreferences: {
        ...row.expectedPrivacy,
        debugMode: row.expectedPrivacy.debugMode && debugControlAvailable
      }
    });
  }
  expect(await readForwardSemanticState(installed.page)).toEqual({
    portable: row.expectedPortable,
    privacy: row.expectedPrivacy,
    bindings: row.expectedBindings,
    journalPresent: row.journalRemains === true
  });
}

// Seeded, codec-valid physical states exercise restart classification branches.
// The F8 fault row then drives actual cleanup through a failed native progress write.
// The separate production-phase barriers below prove actual producer interruption.
for (const row of restartRows) {
  test(`abruptly restarts pending native v3 ${row.id}`, async () => {
    const profile = await mkdtemp(path.join(tmpdir(), 'zendio-abrupt-seeded-'));
    let installed = await launchRestartProfile(profile);
    try {
      await seedNativeCleanupDirectory(installed.worker);
      if (row.handleBeforeCrash === false && !row.progressFault) {
        await installed.worker.evaluate(
          ({ databaseName, storeName, folderId }) =>
            new Promise<void>((resolve, reject) => {
              const request = indexedDB.open(databaseName, 1);
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                const database = request.result;
                const transaction = database.transaction(storeName, 'readwrite', {
                  durability: 'strict'
                });
                transaction.onabort = () => reject(transaction.error);
                transaction.oncomplete = () => {
                  database.close();
                  resolve();
                };
                transaction.objectStore(storeName).delete(folderId);
              };
            }),
          {
            databaseName: localVaultDatabaseName,
            storeName: localVaultStoreName,
            folderId: cleanupFolderId
          }
        );
      }
      const journal = createForwardJournal(`abrupt-${row.id}`, row.phase, row.journalOptions);
      await seedForwardPhysicalState(installed.page, {
        portable: row.portable,
        privacy: row.privacy,
        bindings: row.bindings,
        journal,
        ...(row.privacyMarker ? { privacyMarker: row.privacyMarker } : {})
      });
      if (row.progressFault) {
        expect((await readNativeCleanupDirectory(installed.worker)).handlePresent).toBe(true);
        const fault = await armNativeCleanupProgressFailure(
          installed.worker,
          journal.transactionId
        );
        const response = await sendPatch(
          installed.page,
          ['interfaceTheme'],
          row.portable.interfaceTheme
        );
        expect(response.success).toBe(false);
        expect(response.errorCode).toBe('OPTIONS_STORAGE_FAILURE');
        expect(await fault.evaluate((state) => state.failures)).toBe(1);
      }
      expect(await readForwardSemanticState(installed.page)).toEqual({
        portable: row.portable,
        privacy: row.privacy,
        bindings: row.bindings,
        journalPresent: true
      });
      const pendingState = await readForwardState(installed.page);
      expect(pendingState.local[cleanupJournalKey]).toEqual(journal);
      if (row.privacyMarker)
        expect(pendingState.local.zendio_device_local_privacy_transaction).toEqual({
          version: 1,
          phase: row.privacyMarker,
          previousConsentPresent: true,
          previousConsent: {
            analytics: false,
            errorReporting: false,
            timestamp: 1,
            version: '1.0'
          },
          previousConfigPresent: true,
          previousConfig: { debugMode: false }
        });
      expect(await readNativeCleanupDirectory(installed.worker)).toEqual({
        handlePresent: row.handleBeforeCrash !== false,
        nativeHandle: row.handleBeforeCrash !== false,
        sameDirectory: row.handleBeforeCrash !== false,
        contents: 'Vault contents survive registry cleanup.'
      });
      const originalWorker = installed.worker;
      const originalId = installed.extensionId;
      await crashInstalledBrowser(installed.context, installed.page, originalWorker);
      installed = await launchRestartProfile(profile);
      expect(installed.extensionId).toBe(originalId);
      expect(installed.worker).not.toBe(originalWorker);
      await expectRestartOutcome(installed, row);
    } finally {
      await installed.context.close().catch(() => undefined);
      await rm(profile, { recursive: true, force: true });
    }
  });
}

const durableProductionPhases: ForwardPhase[] = [
  'prepared',
  'forward-inflight',
  'forward-committed',
  'local-commit-inflight',
  'compensating',
  'portable-privacy-restored',
  'local-committed',
  'cleanup-complete',
  'aborted'
];
for (const phase of durableProductionPhases) {
  test(`abruptly interrupts production after durable v3 ${phase}`, async () => {
    const profile = await mkdtemp(path.join(tmpdir(), 'zendio-abrupt-production-'));
    let installed = await launchRestartProfile(profile);
    try {
      await seedNativeCleanupDirectory(installed.worker);
      await seedForwardPhysicalState(installed.page, {
        portable: forwardPortablePreimage,
        privacy: privacyRestore,
        bindings: forwardPreviousBindings,
        journal: undefined
      });
      const compensates = ['compensating', 'portable-privacy-restored', 'aborted'].includes(phase);
      const forward = [
        'forward-committed',
        'local-commit-inflight',
        'local-committed',
        'cleanup-complete'
      ].includes(phase);
      const probe = await armDurableJournalPhase(installed.worker, phase, compensates);
      let acknowledged = false;
      const pending = sendPatches(installed.page, [
        { path: ['interfaceTheme'], value: 'dark' },
        { path: ['vaultRouter'], value: forwardPortableProposal.vaultRouter },
        { path: ['privacyPreferences', 'analytics'], value: true }
      ]).then(
        () => {
          acknowledged = true;
        },
        () => undefined
      );
      await expect.poll(() => probe.evaluate((state) => state.held)).toBe(true);
      const probeEvidence = await probe.evaluate((state) => ({
        held: state.held,
        privacyFailures: state.privacyFailures,
        phases: state.phases
      }));
      expect(probeEvidence.phases.at(-1)).toBe(phase);
      expect(probeEvidence.privacyFailures).toBe(Number(compensates));
      expect(acknowledged).toBe(false);
      const physical = await readForwardState(installed.page);
      expect(physical.local[cleanupJournalKey]).toMatchObject({
        version: 3,
        protocol: 'forward-privacy-v1',
        phase,
        previousBindings: forwardPreviousBindings,
        proposedBindings: forwardProposedBindings,
        cleanupCandidates: [cleanupFolderId],
        portable: {
          identityAlgorithm: 'sha256-canonical-plain-json-v1',
          preimage: forwardPortablePreimage,
          preimageIdentity: forwardIdentity(forwardPortablePreimage),
          proposedIdentity: forwardIdentity(forwardPortableProposal),
          writeRequired: true
        },
        privacy: {
          restoreTarget: privacyRestore,
          forwardTarget: privacyForward,
          writeRequired: true
        }
      });
      if (forward)
        expect(physical.local[cleanupJournalKey]).toMatchObject({
          portable: { observedCommittedIdentity: forwardIdentity(forwardPortableProposal) },
          privacy: { observedForward: 'exact-target-readback' }
        });
      expect(await readForwardSemanticState(installed.page)).toEqual({
        portable:
          forward || phase === 'compensating' ? forwardPortableProposal : forwardPortablePreimage,
        privacy: forward ? privacyForward : privacyRestore,
        bindings:
          forward || ['compensating', 'portable-privacy-restored'].includes(phase)
            ? forwardProposedBindings
            : forwardPreviousBindings,
        journalPresent: true
      });
      expect(await readNativeCleanupDirectory(installed.worker)).toEqual({
        handlePresent: phase !== 'cleanup-complete',
        nativeHandle: phase !== 'cleanup-complete',
        sameDirectory: phase !== 'cleanup-complete',
        contents: 'Vault contents survive registry cleanup.'
      });
      if (compensates)
        expect(physical.local[cleanupJournalKey]).toMatchObject({
          recovery: { outcomeCode: 'OPTIONS_STORAGE_FAILURE', bindingWriteMayHaveOccurred: true }
        });
      if (phase === 'portable-privacy-restored')
        expect(physical.local[cleanupJournalKey]).toMatchObject({
          recovery: {
            portableRestoreEvidence: 'preimage',
            privacyRestoreEvidence: 'restore-target'
          }
        });
      if (phase === 'cleanup-complete')
        expect(physical.local[cleanupJournalKey]).toMatchObject({ remainingCleanupCandidates: [] });
      if (phase === 'aborted')
        expect(physical.local[cleanupJournalKey]).toMatchObject({
          abortReason: 'local-commit-failed'
        });
      const originalWorker = installed.worker;
      const originalId = installed.extensionId;
      await crashInstalledBrowser(installed.context, installed.page, originalWorker);
      await pending;
      expect(acknowledged).toBe(false);
      installed = await launchRestartProfile(profile);
      expect(installed.extensionId).toBe(originalId);
      expect(installed.worker).not.toBe(originalWorker);
      await expectRestartOutcome(installed, {
        id: phase,
        phase,
        ...(forward ? committedRestartState : compensationRestartState)
      });
    } finally {
      await installed.context.close().catch(() => undefined);
      await rm(profile, { recursive: true, force: true });
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
      .poll(() => observer.evaluate(() => globalThis.__m05DelayedOptionsEventProbe?.held ?? 0))
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
      const probe = globalThis.__m05DelayedOptionsEventProbe;
      if (!probe) throw new Error('Delayed Options event probe missing.');
      probe.release();
    });
    await expect
      .poll(() => observer.evaluate(() => globalThis.__m05DelayedThemeState?.darkTransitions ?? -1))
      .toBe(0);

    await seedForwardPhysicalState(control, {
      portable: forwardPortableProposal,
      privacy: privacyForward,
      bindings: forwardProposedBindings,
      journal: createForwardJournal('delayed-success', 'forward-inflight')
    });
    await expect
      .poll(() => observer.evaluate(() => globalThis.__m05DelayedOptionsEventProbe?.held ?? 0))
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
      const probe = globalThis.__m05DelayedOptionsEventProbe;
      if (!probe) throw new Error('Delayed Options event probe missing.');
      probe.release();
    });
    await expect
      .poll(() =>
        observer.evaluate(() => {
          const runtime = globalThis;
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
      const state: {
        failed: boolean;
        failures: number;
        transactionIds: string[];
        originalSet: typeof originalSet;
      } = {
        failed: false,
        failures: 0,
        transactionIds: [],
        originalSet
      };
      const gatedSet = (items: JsonRecord, callback?: () => void) => {
        const candidate = items[journalKey];
        const candidateRecord =
          typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
            ? candidate
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
