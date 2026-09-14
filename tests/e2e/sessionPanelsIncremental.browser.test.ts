import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type Worker
} from '@playwright/test';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createOptionsFixture,
  expandVideoPanel,
  findCurrentTabId,
  openFixtureWithRuntime,
  openVideoPanelFromControlBar,
  selectFixtureText,
  testWithExtension
} from './utils/videoListenerScopeHarness';

type PlainStorageValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | PlainStorageValue[]
  | PlainStorageRecord;
type PlainStorageRecord = { [key: string]: PlainStorageValue };

declare global {
  // eslint-disable-next-line no-var -- Ambient global properties require var declarations.
  var __AIIINOB_CONTENT_RUNTIME_PROMISE__: PromiseLike<object> | undefined;
  // eslint-disable-next-line no-var -- Serialized isolated-world probes use this global.
  var __f07VideoListenerAttachmentCount: number | undefined;
}

interface ExtensionEvaluator {
  evaluate<TArgument, TResult>(
    pageFunction: (argument: TArgument) => TResult | Promise<TResult>,
    argument: TArgument
  ): Promise<TResult>;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../../build/dist');

type ContentOrchestratorHarness = {
  openClipperDialog(): Promise<void>;
  startReaderSession(): Promise<void>;
  startVideoSession(): Promise<void>;
  showVideoFloatingPrompt(): Promise<void>;
  showSupportPrompt(): Promise<void>;
  setReaderHighlightCount(count: number): void;
  addVideoCaptureCount(count: number): Promise<void>;
};

type RuntimeObservabilityHarness = {
  enableReporting(): Promise<void>;
  triggerErrorEvent(): Promise<void>;
  triggerUnhandledRejection(): Promise<void>;
  sendUsageEvent(): Promise<void>;
  clearRequests(): void;
};

type SessionPanelMetrics = {
  inserts: number;
  removes: number;
  listenersAdded: number;
  listenersRemoved: number;
};

type ReaderSessionPanelRefs = {
  shell: Element | null | undefined;
  list: Element | null | undefined;
  first: Element | null | undefined;
  preview: Element | null | undefined;
  lastInput: Element | null | undefined;
  status: Element | null | undefined;
};

declare global {
  interface Window {
    harness?: ContentOrchestratorHarness | RuntimeObservabilityHarness;
    __u04aMetrics: SessionPanelMetrics;
    __u04aReaderRefs: ReaderSessionPanelRefs;
    __u04aVideoPreview: HTMLElement;
    __b10DestinationRows?: Record<string, Element>;
    __contentCorrectionRefs?: Record<string, { row: Element; option: Element; clickCount: number }>;
    __persistedCollapseModal?: HTMLElement;
    __f07DestinationRow?: Element;
    __f07LifecycleRefs?: {
      host: Element;
      surface: Element;
      row: Element;
      details: Element;
      summary: Element;
      options: Element[];
    };
  }
}

test('Reader and Video session panels retain stable incremental shells', async () => {
  const context = await chromium.launchPersistentContext(
    `/tmp/u04a-session-panels-${Date.now()}-${Math.random()}`,
    {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    }
  );
  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker');
    const extensionId = worker.url().split('/')[2];
    if (!extensionId) throw new Error('extension id missing');
    const page = await context.newPage();
    await page.addInitScript(() => {
      const metrics = { inserts: 0, removes: 0, listenersAdded: 0, listenersRemoved: 0 };
      function requireMethod<Method extends CallableFunction>(
        descriptor: PropertyDescriptor | undefined,
        label: string
      ): Method {
        if (typeof descriptor?.value !== 'function') {
          throw new Error(`${label} descriptor missing`);
        }
        return descriptor.value as Method;
      }
      const insideSessionPanel = (target: EventTarget): boolean => {
        if (!(target instanceof Node)) return false;
        const root = target.getRootNode();
        return (
          root instanceof ShadowRoot &&
          root.host instanceof HTMLElement &&
          root.host.dataset.sessionPanelRoot === 'true'
        );
      };
      const insertBefore = requireMethod<typeof Node.prototype.insertBefore>(
        Object.getOwnPropertyDescriptor(Node.prototype, 'insertBefore'),
        'Node.insertBefore'
      );
      Node.prototype.insertBefore = function <T extends Node>(node: T, child: Node | null): T {
        if (insideSessionPanel(this)) metrics.inserts += 1;
        return Reflect.apply(insertBefore, this, [node, child]) as T;
      };
      const removeChild = requireMethod<typeof Node.prototype.removeChild>(
        Object.getOwnPropertyDescriptor(Node.prototype, 'removeChild'),
        'Node.removeChild'
      );
      Node.prototype.removeChild = function <T extends Node>(child: T): T {
        if (insideSessionPanel(this)) metrics.removes += 1;
        return Reflect.apply(removeChild, this, [child]) as T;
      };
      const add = requireMethod<typeof EventTarget.prototype.addEventListener>(
        Object.getOwnPropertyDescriptor(EventTarget.prototype, 'addEventListener'),
        'EventTarget.addEventListener'
      );
      EventTarget.prototype.addEventListener = function (
        ...args: Parameters<EventTarget['addEventListener']>
      ) {
        if (insideSessionPanel(this)) metrics.listenersAdded += 1;
        return Reflect.apply(add, this, args);
      };
      const remove = requireMethod<typeof EventTarget.prototype.removeEventListener>(
        Object.getOwnPropertyDescriptor(EventTarget.prototype, 'removeEventListener'),
        'EventTarget.removeEventListener'
      );
      EventTarget.prototype.removeEventListener = function (
        ...args: Parameters<EventTarget['removeEventListener']>
      ) {
        if (insideSessionPanel(this)) metrics.listenersRemoved += 1;
        return Reflect.apply(remove, this, args);
      };
      window.__u04aMetrics = metrics;
    });
    await page.goto(`chrome-extension://${extensionId}/content-orchestrator-harness.html`);
    await expect(page.locator('#status')).toHaveText('Harness ready');

    await page.evaluate(async () => {
      const harness = window.harness;
      if (!harness || !('startReaderSession' in harness)) {
        throw new Error('content orchestrator Reader harness missing');
      }
      await harness.startReaderSession();
      harness.setReaderHighlightCount(20);
      const host = document.querySelector<HTMLElement>('#aiob-reader-panel');
      const shadow = host?.shadowRoot;
      window.__u04aReaderRefs = {
        shell: shadow?.querySelector('.reader-surface-window'),
        list: shadow?.querySelector('.session-item-list'),
        first: shadow?.querySelector('[data-highlight-id="harness-highlight-1"]'),
        preview: shadow?.querySelector(
          '[data-highlight-id="harness-highlight-1"] .session-item-primary-line'
        ),
        lastInput: shadow?.querySelector('[data-highlight-input="harness-highlight-20"]'),
        status: shadow?.querySelector('[data-session-status]')
      };
      const preview = shadow?.querySelector<HTMLElement>(
        '[data-highlight-id="harness-highlight-1"] .session-item-primary-line'
      );
      preview?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
      for (let index = 0; index < 100; index += 1) harness.setReaderHighlightCount(20);
    });

    const readerState = await page.evaluate(() => {
      const refs = window.__u04aReaderRefs;
      const host = document.querySelector<HTMLElement>('#aiob-reader-panel');
      const shadow = host?.shadowRoot;
      const input = shadow?.querySelector<HTMLInputElement>(
        '[data-highlight-input="harness-highlight-20"]'
      );
      input?.focus();
      input?.setSelectionRange(2, 5);
      return {
        shell: refs.shell === shadow?.querySelector('.reader-surface-window'),
        list: refs.list === shadow?.querySelector('.session-item-list'),
        first: refs.first === shadow?.querySelector('[data-highlight-id="harness-highlight-1"]'),
        preview:
          refs.preview ===
          shadow?.querySelector(
            '[data-highlight-id="harness-highlight-1"] .session-item-primary-line'
          ),
        previewExpanded: refs.preview?.classList.contains('is-expanded'),
        previewRole: refs.preview?.getAttribute('role'),
        previewTabIndex: refs.preview?.getAttribute('tabindex'),
        previewAriaExpanded: refs.preview?.getAttribute('aria-expanded'),
        input: refs.lastInput === input,
        status: refs.status === shadow?.querySelector('[data-session-status]'),
        role: refs.status?.getAttribute('role'),
        live: refs.status?.getAttribute('aria-live'),
        count: shadow?.querySelectorAll('[data-role="highlight-item"]').length
      };
    });
    expect(readerState).toEqual({
      shell: true,
      list: true,
      first: true,
      preview: true,
      previewExpanded: true,
      previewRole: 'button',
      previewTabIndex: '0',
      previewAriaExpanded: 'true',
      input: true,
      status: true,
      role: 'status',
      live: 'polite',
      count: 20
    });

    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('#aiob-reader-panel');
      const header = host?.shadowRoot?.querySelector<HTMLElement>('.resource-modal-header');
      header?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    });
    await expect(page.locator('#aiob-reader-panel')).toHaveCount(1);
    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('#aiob-reader-panel');
      const overlay = host?.shadowRoot?.querySelector<HTMLElement>('.resource-modal-overlay');
      overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    });
    await expect(page.locator('#aiob-reader-panel')).toHaveCount(0);

    await page.evaluate(async () => {
      const harness = window.harness;
      if (!harness || !('startVideoSession' in harness)) {
        throw new Error('content orchestrator Video harness missing');
      }
      await harness.startVideoSession();
      const paragraph = document.querySelector<HTMLElement>('#reader-article p');
      const selection = window.getSelection();
      if (!paragraph || !selection) throw new Error('video fragment selection fixture missing');
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      paragraph.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          composed: true,
          button: 0,
          shiftKey: true
        })
      );
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange', { bubbles: true, composed: true }));
      paragraph.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          composed: true,
          button: 0,
          shiftKey: true
        })
      );
    });
    await expect(page.locator('[data-capture-kind="fragment"]')).toHaveCount(1);
    const fragmentId = await page
      .locator('[data-capture-kind="fragment"]')
      .getAttribute('data-capture-id');
    if (!fragmentId) throw new Error('video fragment id missing');
    await page.evaluate((id) => {
      const host = Array.from(
        document.querySelectorAll<HTMLElement>('[data-session-panel-root="true"]')
      ).find((candidate) => candidate.id !== 'aiob-reader-panel');
      const preview = host?.shadowRoot?.querySelector<HTMLElement>(
        `[data-capture-id="${id}"] .session-item-primary-line`
      );
      if (!preview) throw new Error('video fragment preview missing');
      preview.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
      window.__u04aVideoPreview = preview;
    }, fragmentId);
    await page.evaluate(async () => {
      const harness = window.harness;
      if (!harness || !('addVideoCaptureCount' in harness)) {
        throw new Error('content orchestrator capture harness missing');
      }
      await harness.addVideoCaptureCount(20);
    });
    await expect(page.locator('[data-role="capture-item"]')).toHaveCount(21);
    const videoPreviewState = await page.evaluate((id) => {
      const host = document.querySelector<HTMLElement>('[data-session-panel-root="true"]');
      const preview = host?.shadowRoot?.querySelector<HTMLElement>(
        `[data-capture-id="${id}"] .session-item-primary-line`
      );
      const retained = window.__u04aVideoPreview;
      return {
        retained: preview === retained,
        expanded: preview?.classList.contains('is-expanded'),
        role: preview?.getAttribute('role'),
        tabIndex: preview?.getAttribute('tabindex'),
        ariaExpanded: preview?.getAttribute('aria-expanded')
      };
    }, fragmentId);
    expect(videoPreviewState).toEqual({
      retained: true,
      expanded: true,
      role: 'button',
      tabIndex: '0',
      ariaExpanded: 'true'
    });
    const lastVideoInput = page
      .locator('[data-capture-kind="timestamp"] [data-capture-input]')
      .last();
    await lastVideoInput.fill('stable browser draft');
    const lastCaptureId = await lastVideoInput.getAttribute('data-capture-input');
    await page.locator('[data-action-id="video:toggle-screenshot"]').first().click();
    await expect(page.locator(`[data-capture-input="${lastCaptureId}"]`)).toHaveValue(
      'stable browser draft'
    );
    await expect(page.locator('[data-session-status]').last()).toHaveAttribute(
      'aria-live',
      'polite'
    );
    await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('[data-session-panel-root="true"]');
      const header = host?.shadowRoot?.querySelector<HTMLElement>('.resource-modal-header');
      header?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    });
    await expect(page.locator('[data-session-panel-root="true"]')).toHaveCount(1);
    await page.locator('[data-action-id="video:cancel"]').click();
    await expect(page.locator('[data-session-panel-root="true"]')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

const B10_VAULT_ID = 'live-runtime-vault';
const B10_LIVE_VAULT_NAME = 'Current Live Vault';
const B10_RENAMED_VAULT_NAME = 'Live Renamed Vault';
type B10MutationResponse = { success: boolean };

function b10ArticleFixtureHtml(title: string): string {
  return `<!doctype html>
    <html>
      <head><title>${title}</title></head>
      <body>
        <main>
          <article>
            <h1>${title}</h1>
            <p id="selectable">Selectable article text for the live destination fixture.</p>
          </article>
        </main>
      </body>
    </html>`;
}

function b10VideoFixtureHtml(): string {
  return `<!doctype html>
    <html>
      <head><title>Clipper Video destination fixture</title></head>
      <body>
        <main>
          <h1 class="video-title">Clipper Video destination fixture</h1>
          <p id="selectable">Selected text carried from the production Clipper into Video.</p>
          <div class="bpx-player-container">
            <video></video>
            <div class="bpx-player-control-bottom-right"></div>
            <div class="bpx-player-render-dm-wrap"></div>
          </div>
          <aside class="recommendations"></aside>
          <section id="comment"></section>
        </main>
      </body>
    </html>`;
}

function createB10StoredOptions(vaultName?: string) {
  return {
    ...createOptionsFixture(),
    vaultRouter: {
      defaultVaultId: vaultName ? B10_VAULT_ID : 'default',
      vaults: vaultName
        ? [
            {
              id: B10_VAULT_ID,
              name: vaultName,
              vault: vaultName,
              localFolderId: 'live-runtime-folder',
              localFolderName: vaultName,
              httpsUrl: 'https://127.0.0.1:27124',
              httpUrl: 'http://127.0.0.1:27123',
              apiKey: '',
              enabled: true,
              isDefault: true
            }
          ]
        : [],
      rules: []
    }
  };
}

async function openB10Clipper(page: Page, extensionPage: Page): Promise<void> {
  await selectFixtureText(page);
  const tabId = await findCurrentTabId(extensionPage, page.url());
  const readiness = await extensionPage.evaluate(async (targetTabId) => {
    return chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      world: 'ISOLATED',
      func: async () => {
        const runtimePromise = globalThis.__AIIINOB_CONTENT_RUNTIME_PROMISE__;
        if (!runtimePromise) return false;
        await runtimePromise;
        return document.documentElement.dataset.aiobContentRuntime === 'true';
      }
    });
  }, tabId);
  expect(readiness[0]?.result).toBe(true);
  const result = await extensionPage.evaluate(async (targetTabId) => {
    return chrome.tabs.sendMessage<{ action: string }, B10MutationResponse>(targetTabId, {
      action: 'clipSelection'
    });
  }, tabId);
  expect(result).toMatchObject({ success: true });
  await expect(page.locator('[data-stitch-surface="clipper"]')).toBeVisible();
}

async function updateB10Vault(extensionPage: Page, vaultName: string): Promise<void> {
  const result = await extensionPage.evaluate(
    async ({ vaultId, nextName }) =>
      chrome.runtime.sendMessage<object, B10MutationResponse>({
        type: 'ZENDIO_OPTIONS_MUTATION',
        requestId: `live-runtime-${crypto.randomUUID()}`,
        command: {
          kind: 'patch',
          patches: [
            {
              path: ['vaultRouter'],
              value: {
                defaultVaultId: vaultId,
                vaults: [
                  {
                    id: vaultId,
                    name: nextName,
                    vault: nextName,
                    localFolderId: 'live-runtime-folder',
                    localFolderName: nextName,
                    httpsUrl: 'https://127.0.0.1:27124',
                    httpUrl: 'http://127.0.0.1:27123',
                    apiKey: '',
                    enabled: true,
                    isDefault: true
                  }
                ],
                rules: []
              }
            }
          ]
        }
      }),
    { vaultId: B10_VAULT_ID, nextName: vaultName }
  );
  expect(result).toMatchObject({ success: true });
}

async function clearB10Vaults(extensionPage: ExtensionEvaluator): Promise<void> {
  const emptyOptions = createB10StoredOptions();
  const persistedOptions = await extensionPage.evaluate(async (storedOptions) => {
    await chrome.storage.sync.set({ options: storedOptions });
    const persisted = await chrome.storage.sync.get('options');
    return persisted.options;
  }, emptyOptions);
  expect(persistedOptions).toEqual(emptyOptions);
}

async function markB10DestinationRow(page: Page, marker: string): Promise<void> {
  const row = page.locator('.export-destination-row');
  await expect(row).toBeVisible();
  await row.evaluate((element, value) => {
    if (!(element instanceof HTMLElement)) throw new Error('destination row must be HTML');
    element.dataset.liveRuntimeMarker = value;
    const rows = (window.__b10DestinationRows ??= {});
    rows[value] = element;
  }, marker);
}

async function setB10OtherDefaultKeepingSelectedVault(extensionPage: Page): Promise<void> {
  const result = await extensionPage.evaluate(
    async ({ selectedId, selectedName }) => {
      const vault = (id: string, name: string, isDefault: boolean) => ({
        id,
        name,
        vault: name,
        localFolderId: `folder-${id}`,
        localFolderName: name,
        httpsUrl: 'https://127.0.0.1:27124',
        httpUrl: 'http://127.0.0.1:27123',
        apiKey: '',
        enabled: true,
        isDefault
      });
      return chrome.runtime.sendMessage<object, B10MutationResponse>({
        type: 'ZENDIO_OPTIONS_MUTATION',
        requestId: `two-vault-${crypto.randomUUID()}`,
        command: {
          kind: 'patch',
          patches: [
            {
              path: ['vaultRouter'],
              value: {
                defaultVaultId: 'other-default-vault',
                vaults: [
                  vault(selectedId, selectedName, false),
                  vault('other-default-vault', 'Other Default Vault', true)
                ],
                rules: []
              }
            }
          ]
        }
      });
    },
    { selectedId: B10_VAULT_ID, selectedName: B10_LIVE_VAULT_NAME }
  );
  expect(result).toMatchObject({ success: true });
}

async function expectB10Destination(page: Page, marker: string, label: string): Promise<void> {
  await expect(page.locator('.export-destination-label')).toHaveText(label);
  await expect(page.locator('.export-destination-row')).toHaveAttribute(
    'data-live-runtime-marker',
    marker
  );
  await expect
    .poll(() =>
      page.locator('.export-destination-row').evaluate((element, value) => {
        return window.__b10DestinationRows?.[value] === element;
      }, marker)
    )
    .toBe(true);
  await expect
    .poll(() =>
      page
        .locator('.export-destination-option[data-destination-id]')
        .evaluateAll((buttons) =>
          buttons.map((button) =>
            button instanceof HTMLElement ? button.dataset.destinationId : undefined
          )
        )
    )
    .toEqual([B10_VAULT_ID, 'downloads']);
}

async function readB10VideoDraft(extensionPage: ExtensionEvaluator, pageUrl: string) {
  return extensionPage.evaluate(async (targetUrl) => {
    const record = (value: PlainStorageValue): value is PlainStorageRecord =>
      typeof value === 'object' && value !== null && !Array.isArray(value);
    const storage: PlainStorageRecord = await chrome.storage.local.get(null);
    const candidate = Object.entries(storage).find(
      ([key, value]) =>
        key.startsWith('aiob.sessionDraft.v1.video.') &&
        record(value) &&
        value.pageUrl === targetUrl &&
        record(value.payload)
    );
    if (!candidate || !record(candidate[1]) || !record(candidate[1].payload)) return null;
    const payload = candidate[1].payload;
    return {
      destination: record(payload.destination) ? payload.destination : null,
      captureCount: Array.isArray(payload.captures) ? payload.captures.length : 0,
      captureComments: Array.isArray(payload.captures)
        ? payload.captures.map((capture) => (record(capture) ? capture.comment : undefined))
        : []
    };
  }, pageUrl);
}

async function startB10ClipperVideo(page: Page, extensionPage: Page): Promise<void> {
  await page.locator('[data-stitch-surface="clipper"] [data-action-id="video"]').click();
  await expect(page.locator('[data-stitch-surface="clipper"]')).toHaveCount(0);
  await expect(page.locator('[data-session-panel-root="true"]')).toBeVisible();
  await expect(page.locator('[data-capture-kind="fragment"]')).toHaveCount(1);
  await expect
    .poll(() => readB10VideoDraft(extensionPage, page.url()))
    .toMatchObject({
      captureCount: 1
    });
}

async function selectB10ClipperDestination(page: Page, destinationId: string): Promise<void> {
  const clipper = page.locator('[data-stitch-surface="clipper"]');
  await clipper.locator('.export-destination-summary').click();
  const option = clipper.locator(
    `.export-destination-option[data-destination-id="${destinationId}"]`
  );
  await expect(option).toBeVisible();
  await option.locator('.export-destination-option-label').click();
  const openMenu = clipper.locator('.export-destination-menu[open]');
  await expect(openMenu).toHaveCount(0);
}

testWithExtension(
  'projects inserted and renamed vaults into stable Clipper, Reader, and Video rows',
  async ({ context, extensionPage }) => {
    const initialOptions = createB10StoredOptions();
    const clipper = await openFixtureWithRuntime(
      context,
      extensionPage,
      'https://example.com/b10-live-destination-clipper',
      b10ArticleFixtureHtml('Clipper live destination article'),
      initialOptions
    );
    await openB10Clipper(clipper.page, extensionPage);

    const reader = await openFixtureWithRuntime(
      context,
      extensionPage,
      'https://example.org/b10-live-destination-reader',
      b10ArticleFixtureHtml('Reader live destination article'),
      initialOptions
    );
    await openB10Clipper(reader.page, extensionPage);
    await reader.page.locator('[data-stitch-surface="clipper"] [data-action-id="reader"]').click();
    await expect(reader.page.locator('[data-stitch-surface="reader"]')).toBeVisible();

    const video = await openFixtureWithRuntime(
      context,
      extensionPage,
      'https://www.bilibili.com/video/BV1liveRuntimeProjection/',
      b10VideoFixtureHtml(),
      initialOptions
    );
    await openVideoPanelFromControlBar(video.page, 'Live runtime projection');
    await expandVideoPanel(video.page);

    await markB10DestinationRow(clipper.page, 'clipper-row');
    await markB10DestinationRow(reader.page, 'reader-row');
    await markB10DestinationRow(video.page, 'video-row');

    const clipperMenu = clipper.page.locator(
      '[data-stitch-surface="clipper"] .export-destination-menu'
    );
    const clipperDownloads = clipper.page.locator(
      '[data-stitch-surface="clipper"] [data-destination-id="downloads"]'
    );
    await clipper.page
      .locator('[data-stitch-surface="clipper"] .export-destination-summary')
      .press('Enter');
    await expect(clipperMenu).toHaveAttribute('open', '');
    await clipperDownloads.focus();

    await updateB10Vault(extensionPage, B10_LIVE_VAULT_NAME);
    await Promise.all([
      expectB10Destination(clipper.page, 'clipper-row', B10_LIVE_VAULT_NAME),
      expectB10Destination(reader.page, 'reader-row', B10_LIVE_VAULT_NAME),
      expectB10Destination(video.page, 'video-row', B10_LIVE_VAULT_NAME)
    ]);
    await expect(clipperMenu).toHaveAttribute('open', '');
    await expect(clipperDownloads).toBeFocused();

    await updateB10Vault(extensionPage, B10_RENAMED_VAULT_NAME);
    await Promise.all([
      expectB10Destination(clipper.page, 'clipper-row', B10_RENAMED_VAULT_NAME),
      expectB10Destination(reader.page, 'reader-row', B10_RENAMED_VAULT_NAME),
      expectB10Destination(video.page, 'video-row', B10_RENAMED_VAULT_NAME)
    ]);

    await Promise.all([clipper.page.close(), reader.page.close(), video.page.close()]);
  }
);

test('adds the localized Clipper setup link when the last configured vault disappears', async () => {
  const matrixCase = F07_CASES.find(
    (candidate) => candidate.id === 'clipper-mobile-zh-dark-downloads-closed'
  );
  if (!matrixCase) throw new Error('Clipper setup-link matrix case missing');
  const { background, context, page, profile } = await openF07Surface(matrixCase);
  try {
    await markB10DestinationRow(page, 'clipper-setup-link-row');
    const root = page.locator('[data-stitch-surface="clipper"]');
    await expect(root.locator('.export-destination-label')).toHaveText(F07_LONG_VAULT_NAME);
    await expect
      .poll(() =>
        root
          .locator('.export-destination-option[data-destination-id]')
          .evaluateAll((buttons) =>
            buttons.map((button) =>
              button instanceof HTMLElement ? button.dataset.destinationId : undefined
            )
          )
      )
      .toEqual([B10_VAULT_ID, 'downloads']);
    await expect(root.locator('.export-destination-setup-link')).toHaveCount(0);

    await clearB10Vaults(background);

    await expect(root.locator('.export-destination-label')).toHaveText('Downloads');
    await expect(root.locator('.export-destination-row')).toHaveAttribute(
      'data-live-runtime-marker',
      'clipper-setup-link-row'
    );
    await expect
      .poll(() =>
        root.locator('.export-destination-row').evaluate((element) => {
          return window.__b10DestinationRows?.['clipper-setup-link-row'] === element;
        })
      )
      .toBe(true);
    await expect
      .poll(() =>
        root
          .locator('.export-destination-option[data-destination-id]')
          .evaluateAll((buttons) =>
            buttons.map((button) =>
              button instanceof HTMLElement ? button.dataset.destinationId : undefined
            )
          )
      )
      .toEqual(['downloads']);
    await expect(root.locator('[data-destination-id="downloads"]')).toHaveClass(/\bis-selected\b/u);
    const link = root.locator('.export-destination-setup-link');
    await expect(link).toHaveText('配置仓库');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAttribute('href', /options\/index\.html#section-storage$/u);
  } finally {
    await context.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
});

testWithExtension(
  'carries implicit and explicit Clipper destinations into real Video drafts',
  async ({ context, extensionPage }) => {
    const implicit = await openFixtureWithRuntime(
      context,
      extensionPage,
      'https://www.bilibili.com/video/BV1clipperImplicit/',
      b10VideoFixtureHtml(),
      createB10StoredOptions()
    );
    await openB10Clipper(implicit.page, extensionPage);
    await startB10ClipperVideo(implicit.page, extensionPage);
    await expect(implicit.page.locator('.export-destination-label')).toHaveText('Downloads');
    await markB10DestinationRow(implicit.page, 'clipper-video-implicit');
    await expect
      .poll(() => readB10VideoDraft(extensionPage, implicit.page.url()))
      .toMatchObject({
        destination: { kind: 'downloads' },
        captureCount: 1
      });
    await updateB10Vault(extensionPage, B10_LIVE_VAULT_NAME);
    await expectB10Destination(implicit.page, 'clipper-video-implicit', B10_LIVE_VAULT_NAME);
    const implicitCaptureInput = implicit.page.locator('[data-capture-input]').first();
    await expect(implicitCaptureInput).toBeEditable();
    await implicitCaptureInput.fill('Persist the live implicit destination');
    await expect
      .poll(() => readB10VideoDraft(extensionPage, implicit.page.url()))
      .toMatchObject({
        destination: { kind: 'vault', vaultId: B10_VAULT_ID },
        captureCount: 1
      });

    const downloads = await openFixtureWithRuntime(
      context,
      extensionPage,
      'https://www.bilibili.com/video/BV1clipperDownloads/',
      b10VideoFixtureHtml(),
      createB10StoredOptions(B10_LIVE_VAULT_NAME)
    );
    await openB10Clipper(downloads.page, extensionPage);
    await selectB10ClipperDestination(downloads.page, 'downloads');
    await startB10ClipperVideo(downloads.page, extensionPage);
    await expect(downloads.page.locator('.export-destination-label')).toHaveText('Downloads');
    await markB10DestinationRow(downloads.page, 'clipper-video-downloads');
    await expect
      .poll(() => readB10VideoDraft(extensionPage, downloads.page.url()))
      .toMatchObject({
        destination: { kind: 'downloads' },
        captureCount: 1
      });
    await updateB10Vault(extensionPage, B10_RENAMED_VAULT_NAME);
    await expect(downloads.page.locator('.export-destination-label')).toHaveText('Downloads');
    await expect(downloads.page.locator('.export-destination-row')).toHaveAttribute(
      'data-live-runtime-marker',
      'clipper-video-downloads'
    );

    const vault = await openFixtureWithRuntime(
      context,
      extensionPage,
      'https://www.bilibili.com/video/BV1clipperVault/',
      b10VideoFixtureHtml(),
      createB10StoredOptions()
    );
    await openB10Clipper(vault.page, extensionPage);
    await updateB10Vault(extensionPage, B10_LIVE_VAULT_NAME);
    await vault.page
      .locator('[data-stitch-surface="clipper"] textarea')
      .fill('Explicit Vault A comment');
    await selectB10ClipperDestination(vault.page, B10_VAULT_ID);
    await setB10OtherDefaultKeepingSelectedVault(extensionPage);
    await expect
      .poll(() =>
        vault.page
          .locator('[data-stitch-surface="clipper"] .export-destination-option')
          .evaluateAll((buttons) =>
            buttons.map((button) =>
              button instanceof HTMLElement ? button.dataset.destinationId : undefined
            )
          )
      )
      .toEqual([B10_VAULT_ID, 'other-default-vault', 'downloads']);
    await expect(
      vault.page.locator('[data-stitch-surface="clipper"] .export-destination-label')
    ).toHaveText(B10_LIVE_VAULT_NAME);
    await startB10ClipperVideo(vault.page, extensionPage);
    await expect(vault.page.locator('.export-destination-label')).toHaveText(B10_LIVE_VAULT_NAME);
    await markB10DestinationRow(vault.page, 'clipper-video-vault');
    await expect
      .poll(() => readB10VideoDraft(extensionPage, vault.page.url()))
      .toMatchObject({
        destination: { kind: 'vault', vaultId: B10_VAULT_ID },
        captureComments: ['Explicit Vault A comment'],
        captureCount: 1
      });
    await expect
      .poll(() => readB10VideoDraft(extensionPage, vault.page.url()))
      .toMatchObject({
        destination: { kind: 'vault', vaultId: B10_VAULT_ID },
        captureCount: 1
      });
    await updateB10Vault(extensionPage, B10_RENAMED_VAULT_NAME);
    await expectB10Destination(vault.page, 'clipper-video-vault', B10_RENAMED_VAULT_NAME);
    await expect
      .poll(() => readB10VideoDraft(extensionPage, vault.page.url()))
      .toMatchObject({
        destination: { kind: 'vault', vaultId: B10_VAULT_ID },
        captureCount: 1
      });

    await Promise.all([implicit.page.close(), downloads.page.close(), vault.page.close()]);
  }
);

type ContentCorrectionSurface = 'clipper' | 'reader' | 'video';
type ContentCorrectionKey = 'Enter' | 'Space';
type PersistedCollapseSurface = 'reader' | 'video';
type PersistedSessionLayout = {
  'aiob.sessionPanel.width': number;
  'aiob.sessionPanel.maxWidth': number;
  'aiob.sessionPanel.height': number;
  'aiob.sessionPanel.collapsed': boolean;
};

const PERSISTED_SESSION_LAYOUT: PersistedSessionLayout = {
  'aiob.sessionPanel.width': 512,
  'aiob.sessionPanel.maxWidth': 576,
  'aiob.sessionPanel.height': 520,
  'aiob.sessionPanel.collapsed': false
};
const PERSISTED_COLLAPSE_SURFACES: PersistedCollapseSurface[] = ['reader', 'video'];

async function createContentCorrectionExtensionSession(): Promise<{
  context: BrowserContext;
  extensionPage: Page;
  userDataDir: string;
}> {
  const userDataDir = await fs.mkdtemp(path.join(tmpdir(), 'content-correction-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    channel: 'chromium',
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 15000 }));
  const extensionId = worker.url().split('/')[2];
  if (!extensionId) throw new Error(`Unable to parse extension id from ${worker.url()}`);
  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/options/index.html`, {
    waitUntil: 'domcontentloaded'
  });
  return { context, extensionPage, userDataDir };
}

async function closeContentCorrectionExtensionSession(session: {
  context: BrowserContext;
  userDataDir: string;
}): Promise<void> {
  await session.context.close().catch(() => undefined);
  await fs.rm(session.userDataDir, { recursive: true, force: true });
}

async function createPersistedCollapseExtensionSession(): Promise<{
  context: BrowserContext;
  extensionPage: Page;
  userDataDir: string;
}> {
  const userDataDir = await fs.mkdtemp(path.join(tmpdir(), 'persisted-session-collapse-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    channel: 'chromium',
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 15000 }));
  const extensionId = worker.url().split('/')[2];
  if (!extensionId) throw new Error(`Unable to parse extension id from ${worker.url()}`);
  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/options/index.html`, {
    waitUntil: 'domcontentloaded'
  });
  return { context, extensionPage, userDataDir };
}

async function seedPersistedSessionLayout(extensionPage: Page): Promise<void> {
  await extensionPage.evaluate(async (layout) => {
    await chrome.storage.local.set(layout);
  }, PERSISTED_SESSION_LAYOUT);
  await expect
    .poll(() => readPersistedSessionLayout(extensionPage))
    .toEqual(PERSISTED_SESSION_LAYOUT);
}

async function readPersistedSessionLayout(extensionPage: Page) {
  return extensionPage.evaluate(async (keys) => {
    const stored = await chrome.storage.local.get(keys);
    return {
      'aiob.sessionPanel.width': stored['aiob.sessionPanel.width'],
      'aiob.sessionPanel.maxWidth': stored['aiob.sessionPanel.maxWidth'],
      'aiob.sessionPanel.height': stored['aiob.sessionPanel.height'],
      'aiob.sessionPanel.collapsed': stored['aiob.sessionPanel.collapsed']
    };
  }, Object.keys(PERSISTED_SESSION_LAYOUT));
}

async function openPersistedCollapseSurface(
  surface: PersistedCollapseSurface,
  context: BrowserContext,
  extensionPage: Page
): Promise<Page> {
  const caseId = `persisted-collapse-${surface}`;
  const fixture = await openFixtureWithRuntime(
    context,
    extensionPage,
    surface === 'reader'
      ? `https://example.com/${caseId}`
      : `https://www.bilibili.com/video/BV1${caseId.replaceAll('-', '')}/`,
    surface === 'reader'
      ? b10ArticleFixtureHtml('Persisted Reader collapse fixture')
      : b10VideoFixtureHtml(),
    createB10StoredOptions()
  );
  if (surface === 'reader') {
    await openB10Clipper(fixture.page, extensionPage);
    await fixture.page.locator('[data-stitch-surface="clipper"] [data-action-id="reader"]').click();
  } else {
    await openB10Clipper(fixture.page, extensionPage);
    await startB10ClipperVideo(fixture.page, extensionPage);
  }
  await expect(fixture.page.locator(`[data-stitch-surface="${surface}"]`)).toBeVisible();
  return fixture.page;
}

async function readPersistedPanelGeometry(page: Page, surface: PersistedCollapseSurface) {
  return page.locator(`[data-stitch-surface="${surface}"]`).evaluate((root) => {
    const modal = root.querySelector<HTMLElement>('.resource-modal--session');
    const surfaceWindow = root.querySelector<HTMLElement>('.surface-window');
    const header = root.querySelector<HTMLElement>('.surface-window-header');
    const title = root.querySelector<HTMLElement>('.surface-window-title');
    const body = root.querySelector<HTMLElement>('.surface-window-body');
    const footer = root.querySelector<HTMLElement>('.surface-window-footer');
    const widthHandle = root.querySelector<HTMLElement>('.session-panel-resize-handle');
    const heightHandle = root.querySelector<HTMLElement>('.session-panel-height-resize-handle');
    if (
      !modal ||
      !surfaceWindow ||
      !header ||
      !title ||
      !body ||
      !footer ||
      !widthHandle ||
      !heightHandle
    ) {
      throw new Error('Persisted collapse surface is missing required session-panel elements.');
    }
    const modalRect = modal.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const style = getComputedStyle(modal);
    return {
      inlineWidth: modal.style.width,
      inlineHeight: modal.style.height,
      computedWidth: style.width,
      computedHeight: style.height,
      width: modalRect.width,
      height: modalRect.height,
      collapsed: modal.classList.contains('is-collapsed'),
      windowCollapsed: surfaceWindow.classList.contains('is-collapsed'),
      headerDisplay: getComputedStyle(header).display,
      titleDisplay: getComputedStyle(title).display,
      titleWidth: titleRect.width,
      titleInside:
        titleRect.left >= modalRect.left - 1 &&
        titleRect.right <= modalRect.right + 1 &&
        titleRect.top >= modalRect.top - 1 &&
        titleRect.bottom <= modalRect.bottom + 1,
      bodyDisplay: getComputedStyle(body).display,
      footerDisplay: getComputedStyle(footer).display,
      widthHandleDisplay: getComputedStyle(widthHandle).display,
      heightHandleDisplay: getComputedStyle(heightHandle).display,
      widthHandlePointerEvents: getComputedStyle(widthHandle).pointerEvents,
      heightHandlePointerEvents: getComputedStyle(heightHandle).pointerEvents,
      widthHandleCursor: getComputedStyle(widthHandle).cursor,
      heightHandleCursor: getComputedStyle(heightHandle).cursor,
      rect: {
        left: modalRect.left,
        top: modalRect.top,
        right: modalRect.right,
        bottom: modalRect.bottom
      }
    };
  });
}

for (const surface of PERSISTED_COLLAPSE_SURFACES) {
  test(`collapses installed ${surface} persisted dimensions without losing the expanded layout`, async () => {
    const session = await createPersistedCollapseExtensionSession();
    const { context, extensionPage } = session;
    try {
      await seedPersistedSessionLayout(extensionPage);
      const page = await openPersistedCollapseSurface(surface, context, extensionPage);
      const modal = page.locator(`[data-stitch-surface="${surface}"] .resource-modal--session`);
      await expect
        .poll(() => readPersistedPanelGeometry(page, surface))
        .toMatchObject({
          inlineWidth: '512px',
          inlineHeight: '520px',
          computedWidth: '512px',
          computedHeight: '520px',
          collapsed: false,
          windowCollapsed: false
        });
      const expanded = await readPersistedPanelGeometry(page, surface);
      expect(Math.abs(expanded.width - 512)).toBeLessThanOrEqual(1);
      expect(Math.abs(expanded.height - 520)).toBeLessThanOrEqual(1);
      await modal.evaluate((element) => {
        if (!(element instanceof HTMLElement)) {
          throw new Error('Persisted collapse modal is not an HTMLElement.');
        }
        window.__persistedCollapseModal = element;
      });
      const vacatedPoint = {
        x: Math.round(expanded.rect.left + 20),
        y: Math.round(expanded.rect.top + 20)
      };

      await page
        .locator(`[data-stitch-surface="${surface}"] [data-action-id="session:toggleCollapse"]`)
        .click();
      await expect(modal).toHaveClass(/\bis-collapsed\b/);
      await expect
        .poll(() => readPersistedSessionLayout(extensionPage))
        .toEqual({ ...PERSISTED_SESSION_LAYOUT, 'aiob.sessionPanel.collapsed': true });

      const collapsed = await readPersistedPanelGeometry(page, surface);
      expect(collapsed).toMatchObject({
        inlineWidth: '512px',
        inlineHeight: '520px',
        collapsed: true,
        windowCollapsed: true,
        bodyDisplay: 'none',
        footerDisplay: 'none',
        widthHandleDisplay: 'none',
        heightHandleDisplay: 'none',
        titleInside: true
      });
      expect(collapsed.headerDisplay).not.toBe('none');
      expect(collapsed.titleDisplay).not.toBe('none');
      expect(collapsed.titleWidth).toBeGreaterThan(0);
      expect(collapsed.height).toBeLessThan(120);
      expect(collapsed.width).toBeGreaterThan(0);
      expect(collapsed.width).toBeLessThan(expanded.width);
      expect(await modal.evaluate((element) => window.__persistedCollapseModal === element)).toBe(
        true
      );
      expect(
        await page.evaluate(
          ({ x, y, surfaceId }) => {
            const hit = document.elementFromPoint(x, y);
            const root = hit?.getRootNode();
            const host = root instanceof ShadowRoot ? root.host : null;
            return {
              insideSurface:
                hit?.closest(`[data-stitch-surface="${surfaceId}"]`) !== null ||
                (host instanceof Element && host.matches(`[data-stitch-surface="${surfaceId}"]`))
            };
          },
          { ...vacatedPoint, surfaceId: surface }
        )
      ).toEqual({ insideSurface: false });
      expect(await readPersistedSessionLayout(extensionPage)).toEqual({
        ...PERSISTED_SESSION_LAYOUT,
        'aiob.sessionPanel.collapsed': true
      });

      await page.locator(`[data-stitch-surface="${surface}"] .surface-window`).click();
      await expect(modal).not.toHaveClass(/\bis-collapsed\b/);
      await expect
        .poll(() => readPersistedSessionLayout(extensionPage))
        .toEqual(PERSISTED_SESSION_LAYOUT);
      const restored = await readPersistedPanelGeometry(page, surface);
      expect(restored).toMatchObject({
        inlineWidth: '512px',
        inlineHeight: '520px',
        computedWidth: '512px',
        computedHeight: '520px',
        collapsed: false,
        windowCollapsed: false,
        widthHandlePointerEvents: 'auto',
        heightHandlePointerEvents: 'auto',
        widthHandleCursor: 'ew-resize',
        heightHandleCursor: 'ns-resize'
      });
      expect(restored.widthHandleDisplay).not.toBe('none');
      expect(restored.heightHandleDisplay).not.toBe('none');
      expect(Math.abs(restored.width - expanded.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(restored.height - expanded.height)).toBeLessThanOrEqual(1);
      expect(await readPersistedSessionLayout(extensionPage)).toEqual(PERSISTED_SESSION_LAYOUT);
    } finally {
      await closeContentCorrectionExtensionSession(session);
    }
  });
}

async function setContentCorrectionLanguage(
  extensionPage: Page,
  language: 'en' | 'zh-CN'
): Promise<void> {
  await extensionPage.evaluate(async (nextLanguage) => {
    await chrome.storage.sync.set({ language: nextLanguage });
  }, language);
  await expect
    .poll(() =>
      extensionPage.evaluate(async () => (await chrome.storage.sync.get('language')).language)
    )
    .toBe(language);
}

async function openContentCorrectionSurface(
  surface: ContentCorrectionSurface,
  page: Page,
  extensionPage: Page
): Promise<void> {
  if (surface === 'video') {
    await openVideoPanelFromControlBar(page, 'Content correction video note');
    await expandVideoPanel(page);
    return;
  }
  await openB10Clipper(page, extensionPage);
  if (surface === 'reader') {
    await page.locator('[data-stitch-surface="clipper"] [data-action-id="reader"]').click();
    await expect(page.locator('[data-stitch-surface="reader"]')).toBeVisible();
  }
}

async function createContentCorrectionFixture(
  context: BrowserContext,
  extensionPage: Page,
  surface: ContentCorrectionSurface,
  caseId: string
): Promise<Page> {
  const isVideo = surface === 'video';
  const videoId = caseId.replace(/[^a-zA-Z0-9]/gu, '');
  const url = isVideo
    ? `https://www.bilibili.com/video/BV1contentCorrection${videoId}/`
    : `https://example.com/content-correction-${caseId}`;
  const fixture = await openFixtureWithRuntime(
    context,
    extensionPage,
    url,
    isVideo ? b10VideoFixtureHtml() : b10ArticleFixtureHtml(`Content correction ${surface}`),
    createB10StoredOptions(B10_LIVE_VAULT_NAME)
  );
  await openContentCorrectionSurface(surface, fixture.page, extensionPage);
  return fixture.page;
}

const COUNTER_LANGUAGES: Array<'en' | 'zh-CN'> = ['zh-CN', 'en'];

async function waitForReaderCounterDraft(
  extensionPage: Page,
  pageUrl: string,
  count: number
): Promise<void> {
  await expect
    .poll(() =>
      extensionPage.evaluate(async (url) => {
        const stored = await chrome.storage.local.get<PlainStorageRecord>(null);
        return Object.entries(stored).flatMap(([key, record]) => {
          if (
            !key.startsWith('aiob.sessionDraft.v1.reader.') ||
            !record ||
            typeof record !== 'object' ||
            Array.isArray(record) ||
            record.pageUrl !== url
          )
            return [];
          const payload = record.payload;
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
          return Array.isArray(payload.highlights) ? [payload.highlights.length] : [];
        });
      }, pageUrl)
    )
    .toContain(count);
}

for (const surface of PERSISTED_COLLAPSE_SURFACES) {
  for (const language of COUNTER_LANGUAGES) {
    test(`keeps installed ${surface} ${language} counters localized once as items change`, async ({
      browserName
    }, testInfo) => {
      void browserName;
      const session = await createContentCorrectionExtensionSession();
      const { context, extensionPage } = session;
      try {
        await setContentCorrectionLanguage(extensionPage, language);
        const page = await createContentCorrectionFixture(
          context,
          extensionPage,
          surface,
          `counter-${surface}-${language}`
        );
        const root = page.locator(`[data-stitch-surface="${surface}"]`);
        const counter = root.locator('.session-counter');
        const expectedCounter = (count: number) =>
          language === 'zh-CN'
            ? surface === 'reader'
              ? `已收集 ${count} 条高亮`
              : `已保存 ${count} 条记录`
            : surface === 'reader'
              ? `Collected ${count} highlights`
              : `Saved ${count} entries`;
        await expect(counter).toBeVisible();
        await expect(counter).toHaveText(expectedCounter(1));
        if (surface === 'reader') await waitForReaderCounterDraft(extensionPage, page.url(), 1);
        for (let count = 2; count <= 4; count += 1) {
          if (surface === 'reader') {
            await page.evaluate((index) => {
              const paragraph = document.createElement('p');
              paragraph.textContent = `Additional reader counter selection ${index}`;
              document.querySelector('article')?.append(paragraph);
              paragraph.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
              const range = document.createRange();
              range.selectNodeContents(paragraph);
              const selection = window.getSelection();
              selection?.removeAllRanges();
              selection?.addRange(range);
              paragraph.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
            }, count);
          } else {
            await openVideoPanelFromControlBar(page, `Counter note ${count}`, {
              captureScreenshotEnabled: false
            });
            await expandVideoPanel(page);
          }
          await expect(counter).toBeVisible();
          await expect(counter).toHaveText(expectedCounter(count));
          if (surface === 'reader')
            await waitForReaderCounterDraft(extensionPage, page.url(), count);
        }
        await root
          .locator('.surface-window')
          .screenshot({ path: testInfo.outputPath(`${surface}-counter-${language}.png`) });
        for (let count = 3; count >= 0; count -= 1) {
          await root.locator(`[data-action-id="${surface}:delete"]`).first().click();
          await expect(counter).toBeVisible();
          await expect(counter).toHaveText(expectedCounter(count));
        }
      } finally {
        await closeContentCorrectionExtensionSession(session);
      }
    });
  }
}

async function markContentCorrectionDestination(
  page: Page,
  surface: ContentCorrectionSurface,
  caseId: string
): Promise<{
  summary: ReturnType<Page['locator']>;
  option: ReturnType<Page['locator']>;
}> {
  const root = page.locator(`[data-stitch-surface="${surface}"]`);
  const row = root.locator('.export-destination-row');
  const summary = row.locator('.export-destination-summary');
  const option = row.locator('.export-destination-option[data-destination-id="downloads"]');
  await expect(row).toBeVisible();
  await expect(option).toBeAttached();
  await option.evaluate((element, key) => {
    const destinationRow = element.closest('.export-destination-row');
    if (!destinationRow) throw new Error('destination row missing');
    const refs = (window.__contentCorrectionRefs ??= {});
    const entry = { row: destinationRow, option: element, clickCount: 0 };
    refs[key] = entry;
    element.addEventListener(
      'click',
      () => {
        entry.clickCount += 1;
      },
      { capture: true }
    );
  }, caseId);
  return { summary, option };
}

async function readContentCorrectionOutcome(
  page: Page,
  surface: ContentCorrectionSurface,
  caseId: string
) {
  return page.locator(`[data-stitch-surface="${surface}"]`).evaluate((root, key) => {
    const refs = window.__contentCorrectionRefs?.[key];
    const row = root.querySelector('.export-destination-row');
    const option = root.querySelector(
      '.export-destination-option[data-destination-id="downloads"]'
    );
    const summary = root.querySelector('.export-destination-summary');
    const shadow = root.getRootNode();
    return {
      clickCount: refs?.clickCount ?? 0,
      rowRetained: refs?.row === row && row?.isConnected === true,
      optionRetained: refs?.option === option && option?.isConnected === true,
      selected: option?.classList.contains('is-selected') === true,
      menuOpen: root.querySelector('.export-destination-menu[open]') !== null,
      summaryActive: shadow instanceof ShadowRoot && shadow.activeElement === summary,
      summaryFocusVisible: summary instanceof HTMLElement && summary.matches(':focus-visible')
    };
  }, caseId);
}

const CONTENT_CORRECTION_KEYBOARD_CASES: Array<{
  surface: ContentCorrectionSurface;
  key: ContentCorrectionKey;
  language: 'en' | 'zh-CN';
  saveTo: 'Save to' | '保存到';
}> = [
  { surface: 'clipper', key: 'Enter', language: 'en', saveTo: 'Save to' },
  { surface: 'clipper', key: 'Space', language: 'zh-CN', saveTo: '保存到' },
  { surface: 'reader', key: 'Enter', language: 'zh-CN', saveTo: '保存到' },
  { surface: 'reader', key: 'Space', language: 'en', saveTo: 'Save to' },
  { surface: 'video', key: 'Enter', language: 'en', saveTo: 'Save to' },
  { surface: 'video', key: 'Space', language: 'zh-CN', saveTo: '保存到' }
];

for (const current of CONTENT_CORRECTION_KEYBOARD_CASES) {
  test(`keeps installed ${current.surface} ${current.language} ${current.key} locale copy and keyboard focus continuous`, async () => {
    const session = await createContentCorrectionExtensionSession();
    const { context, extensionPage } = session;
    try {
      const caseId = `${current.surface}-${current.language}-${current.key}`;
      await setContentCorrectionLanguage(extensionPage, current.language);
      const page = await createContentCorrectionFixture(
        context,
        extensionPage,
        current.surface,
        caseId
      );
      const root = page.locator(`[data-stitch-surface="${current.surface}"]`);
      await expect(root.locator('.export-destination-eyebrow')).toHaveText(current.saveTo);
      const { summary, option } = await markContentCorrectionDestination(
        page,
        current.surface,
        caseId
      );

      await summary.focus();
      await summary.press('Enter');
      await expect(root.locator('.export-destination-menu')).toHaveAttribute('open', '');
      await option.focus();
      await expect
        .poll(() => option.evaluate((element) => element.matches(':focus-visible')))
        .toBe(true);
      await option.press(current.key);
      await expect(root.locator('.export-destination-label')).toHaveText('Downloads');
      await expect(option).toHaveClass(/\bis-selected\b/);
      await expect(root.locator('.export-destination-menu[open]')).toHaveCount(0);
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      );

      expect(await readContentCorrectionOutcome(page, current.surface, caseId)).toEqual({
        clickCount: 1,
        rowRetained: true,
        optionRetained: true,
        selected: true,
        menuOpen: false,
        summaryActive: true,
        summaryFocusVisible: true
      });
    } finally {
      await closeContentCorrectionExtensionSession(session);
    }
  });
}

const CONTENT_CORRECTION_POINTER_SURFACES: ContentCorrectionSurface[] = [
  'clipper',
  'reader',
  'video'
];

for (const surface of CONTENT_CORRECTION_POINTER_SURFACES) {
  test(`does not move installed ${surface} pointer selection focus to the destination summary`, async () => {
    const session = await createContentCorrectionExtensionSession();
    const { context, extensionPage } = session;
    try {
      const caseId = `${surface}-pointer`;
      await setContentCorrectionLanguage(extensionPage, 'en');
      const page = await createContentCorrectionFixture(context, extensionPage, surface, caseId);
      const root = page.locator(`[data-stitch-surface="${surface}"]`);
      await expect(root.locator('.export-destination-eyebrow')).toHaveText('Save to');
      const { summary, option } = await markContentCorrectionDestination(page, surface, caseId);

      await summary.click();
      await expect(root.locator('.export-destination-menu')).toHaveAttribute('open', '');
      await option.click();
      await expect(root.locator('.export-destination-label')).toHaveText('Downloads');
      await expect(root.locator('.export-destination-menu[open]')).toHaveCount(0);
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      );

      expect(await readContentCorrectionOutcome(page, surface, caseId)).toEqual({
        clickCount: 1,
        rowRetained: true,
        optionRetained: true,
        selected: true,
        menuOpen: false,
        summaryActive: false,
        summaryFocusVisible: false
      });
    } finally {
      await closeContentCorrectionExtensionSession(session);
    }
  });
}
type F07Surface = 'clipper' | 'reader' | 'video';
type F07MatrixCase = {
  id: string;
  surface: F07Surface;
  viewport: { width: number; height: number };
  language: 'en' | 'zh-CN';
  theme: 'light' | 'dark';
  destinationId: typeof B10_VAULT_ID | 'downloads';
  expectedLabel: string;
  expectedEyebrow: 'Save to' | '保存到';
  activationKey: ContentCorrectionKey;
  leaveOpen: boolean;
};

const F07_LONG_VAULT_NAME = 'F07 Independent Shared Destination Vault';
const F07_LONG_TITLE =
  'F07 shared export destination layout with an intentionally long localized filename and path that must remain on one line across Clipper Reader and Video while preserving the full production destination interaction contract';
const F07_LONG_PATH =
  'F07/independent-options-ui/shared-export-destination/{domain}/{yyyy}/{mm}/{dd}/{title}-layout-contract.md';
const F07_CASES: F07MatrixCase[] = [
  {
    id: 'clipper-desktop-en-light-vault-open',
    surface: 'clipper',
    viewport: { width: 1440, height: 1000 },
    language: 'en',
    theme: 'light',
    destinationId: B10_VAULT_ID,
    expectedLabel: F07_LONG_VAULT_NAME,
    expectedEyebrow: 'Save to',
    activationKey: 'Enter',
    leaveOpen: true
  },
  {
    id: 'clipper-mobile-zh-dark-downloads-closed',
    surface: 'clipper',
    viewport: { width: 390, height: 844 },
    language: 'zh-CN',
    theme: 'dark',
    destinationId: 'downloads',
    expectedLabel: 'Downloads',
    expectedEyebrow: '保存到',
    activationKey: 'Space',
    leaveOpen: false
  },
  {
    id: 'reader-desktop-zh-dark-downloads-open',
    surface: 'reader',
    viewport: { width: 1440, height: 1000 },
    language: 'zh-CN',
    theme: 'dark',
    destinationId: 'downloads',
    expectedLabel: 'Downloads',
    expectedEyebrow: '保存到',
    activationKey: 'Enter',
    leaveOpen: true
  },
  {
    id: 'reader-mobile-en-light-vault-open',
    surface: 'reader',
    viewport: { width: 390, height: 844 },
    language: 'en',
    theme: 'light',
    destinationId: B10_VAULT_ID,
    expectedLabel: F07_LONG_VAULT_NAME,
    expectedEyebrow: 'Save to',
    activationKey: 'Space',
    leaveOpen: true
  },
  {
    id: 'video-desktop-en-dark-vault-open',
    surface: 'video',
    viewport: { width: 1440, height: 1000 },
    language: 'en',
    theme: 'dark',
    destinationId: B10_VAULT_ID,
    expectedLabel: F07_LONG_VAULT_NAME,
    expectedEyebrow: 'Save to',
    activationKey: 'Enter',
    leaveOpen: true
  },
  {
    id: 'video-mobile-zh-light-downloads-closed',
    surface: 'video',
    viewport: { width: 390, height: 844 },
    language: 'zh-CN',
    theme: 'light',
    destinationId: 'downloads',
    expectedLabel: 'Downloads',
    expectedEyebrow: '保存到',
    activationKey: 'Space',
    leaveOpen: false
  }
];

function createF07StoredOptions(theme: F07MatrixCase['theme']) {
  return {
    ...createOptionsFixture(),
    interfaceTheme: theme,
    templates: {
      article: F07_LONG_PATH,
      video: F07_LONG_PATH,
      fragment: F07_LONG_PATH,
      reading: F07_LONG_PATH,
      ai: F07_LONG_PATH
    },
    vaultRouter: {
      defaultVaultId: B10_VAULT_ID,
      vaults: [
        {
          id: B10_VAULT_ID,
          name: F07_LONG_VAULT_NAME,
          vault: F07_LONG_VAULT_NAME,
          httpsUrl: 'https://127.0.0.1:27124',
          httpUrl: 'http://127.0.0.1:27123',
          apiKey: 'a'.repeat(64),
          enabled: true,
          isDefault: true
        }
      ],
      rules: []
    }
  };
}

function f07FixtureHtml(includeVideo: boolean, includeVideoElement = true): string {
  return `<!doctype html>
    <html>
      <head><title>${F07_LONG_TITLE}</title></head>
      <body>
        <main>
          <h1 id="video-title">${F07_LONG_TITLE}</h1>
          ${
            includeVideo
              ? `<div id="movie_player" class="html5-video-player">${includeVideoElement ? '<video></video>' : ''}<div class="ytp-right-controls"></div></div>`
              : ''
          }
          <article>
            <p id="selectable">Selected passage for the installed shared destination contract.</p>
            ${'<p>Installed production extension surface evidence.</p>'.repeat(8)}
          </article>
        </main>
      </body>
    </html>`;
}

async function openF07Surface(
  matrixCase: F07MatrixCase,
  options: { observeNativeVideoAttachment?: boolean; videoInitiallyAvailable?: boolean } = {}
): Promise<{
  context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>;
  background: Worker;
  page: Page;
  profile: string;
  tabId: number;
}> {
  const profile = await fs.mkdtemp(path.join(tmpdir(), 'f07-export-destination-'));
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    viewport: matrixCase.viewport,
    locale: matrixCase.language === 'zh-CN' ? 'zh-CN' : 'en-US',
    colorScheme: matrixCase.theme,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });
  const background =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 15000 }));
  const storedLanguage = await background.evaluate(
    async ({ language, options }) => {
      await chrome.storage.sync.set({ language, options });
      return (await chrome.storage.sync.get('language')).language;
    },
    {
      language: matrixCase.language,
      options: createF07StoredOptions(matrixCase.theme)
    }
  );
  expect(storedLanguage).toBe(matrixCase.language);
  const video = matrixCase.surface === 'video';
  const url = video
    ? `https://www.youtube.com/watch?v=f07-${matrixCase.id}`
    : `https://example.org/f07-${matrixCase.id}`;
  await context.route(url, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: f07FixtureHtml(video, options.videoInitiallyAvailable ?? true)
    })
  );
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const tabs = await background.evaluate(() => chrome.tabs.query({}));
  const tabId = tabs.find((tab) => tab.url === url)?.id;
  if (!tabId) throw new Error('F07 fixture tab id missing');
  if (options.observeNativeVideoAttachment) {
    await background.evaluate(
      (id) =>
        chrome.scripting.executeScript({
          target: { tabId: id },
          world: 'ISOLATED',
          func: () => {
            let attachmentCount = 0;
            HTMLVideoElement.prototype.addEventListener = function (
              type: string,
              listener: EventListenerOrEventListenerObject,
              options?: boolean | AddEventListenerOptions
            ) {
              if (
                this.dataset.lifecycleTrigger === 'native-player-observer' &&
                ['loadedmetadata', 'durationchange', 'emptied', 'play', 'pause'].includes(type)
              ) {
                attachmentCount += 1;
              }
              EventTarget.prototype.addEventListener.call(this, type, listener, options);
            };
            Object.defineProperty(globalThis, '__f07VideoListenerAttachmentCount', {
              configurable: true,
              get: () => attachmentCount
            });
          }
        }),
      tabId
    );
  }
  await background.evaluate(
    (id) => chrome.scripting.executeScript({ target: { tabId: id }, files: ['content/index.js'] }),
    tabId
  );
  await background.evaluate(
    (id) =>
      chrome.scripting.executeScript({
        target: { tabId: id },
        world: 'ISOLATED',
        func: async () => {
          await globalThis.__AIIINOB_CONTENT_RUNTIME_PROMISE__;
        }
      }),
    tabId
  );
  await page.locator('#selectable').evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  const opened = await background.evaluate(async (id) => {
    await chrome.tabs.sendMessage(id, { action: 'clipSelection' });
    return true;
  }, tabId);
  expect(opened).toBe(true);
  await expect(page.locator('[data-stitch-surface="clipper"]')).toBeVisible();
  if (matrixCase.surface !== 'clipper') {
    await page
      .locator(`[data-stitch-surface="clipper"] [data-action-id="${matrixCase.surface}"]`)
      .click();
    await expect(page.locator(`[data-stitch-surface="${matrixCase.surface}"]`)).toBeVisible();
  }
  await expect(
    page.locator(`[data-stitch-surface="${matrixCase.surface}"] .export-destination-label`)
  ).toHaveText(F07_LONG_VAULT_NAME);
  return { context, background, page, profile, tabId };
}

async function readF07VideoListenerAttachmentCount(background: Worker, tabId: number) {
  const result = await background.evaluate(
    (id) =>
      chrome.scripting.executeScript({
        target: { tabId: id },
        world: 'ISOLATED',
        func: () => globalThis.__f07VideoListenerAttachmentCount ?? 0
      }),
    tabId
  );
  return result[0]?.result ?? 0;
}

test('keeps the installed Video destination row stable through the native player observer rerender', async () => {
  const matrixCase = F07_CASES.find(
    (candidate) => candidate.id === 'video-mobile-zh-light-downloads-closed'
  );
  if (!matrixCase) throw new Error('Video lifecycle matrix case missing');
  const { background, context, page, profile, tabId } = await openF07Surface(matrixCase, {
    observeNativeVideoAttachment: true,
    videoInitiallyAvailable: false
  });
  try {
    const scope = page.locator('[data-stitch-surface="video"]');
    const row = scope.locator('.export-destination-row');
    const menu = scope.locator('.export-destination-menu');
    const summary = scope.locator('.export-destination-summary');
    const downloads = scope.locator('.export-destination-option[data-destination-id="downloads"]');
    await expect
      .poll(() => readB10VideoDraft(background, page.url()))
      .toMatchObject({
        destination: { kind: 'vault', vaultId: B10_VAULT_ID },
        captureCount: 1
      });
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('open', '');
    await page.keyboard.press('Space');
    await expect(menu).not.toHaveAttribute('open', '');
    await page.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('open', '');
    await downloads.focus();
    await page.keyboard.press('Space');
    await expect(menu).not.toHaveAttribute('open', '');
    await expectF07VisibleFocus(summary);
    await expect(scope.locator('.export-destination-label')).toHaveText('Downloads');
    await expect
      .poll(() => readB10VideoDraft(background, page.url()))
      .toMatchObject({ destination: { kind: 'downloads' }, captureCount: 1 });

    const beforePlayer = await scope.evaluate((surface) => {
      const root = surface.getRootNode();
      if (!(root instanceof ShadowRoot)) throw new Error('Video lifecycle root missing');
      const destinationRow = root.querySelector('.export-destination-row');
      const details = destinationRow?.querySelector('.export-destination-menu');
      const summaryElement = details?.querySelector('.export-destination-summary');
      const optionElements = Array.from(
        destinationRow?.querySelectorAll('.export-destination-option[data-destination-id]') ?? []
      );
      if (!destinationRow || !details || !summaryElement) {
        throw new Error('Video lifecycle destination structure missing');
      }
      window.__f07LifecycleRefs = {
        host: root.host,
        surface,
        row: destinationRow,
        details,
        summary: summaryElement,
        options: optionElements
      };
      return {
        optionIds: optionElements.map((option) =>
          option instanceof HTMLElement ? option.dataset.destinationId : undefined
        ),
        summaryFocused: root.activeElement === summaryElement,
        summaryFocusVisible: summaryElement.matches(':focus-visible')
      };
    });
    expect(beforePlayer).toEqual({
      optionIds: [B10_VAULT_ID, 'downloads'],
      summaryFocused: true,
      summaryFocusVisible: true
    });

    await page.locator('#movie_player').evaluate((player) => {
      const video = document.createElement('video');
      video.dataset.lifecycleTrigger = 'native-player-observer';
      player.prepend(video);
    });
    await expect.poll(() => readF07VideoListenerAttachmentCount(background, tabId)).toBe(5);

    const afterPlayer = await row.evaluate((destinationRow) => {
      const root = destinationRow.getRootNode();
      if (!(root instanceof ShadowRoot)) throw new Error('Video lifecycle root missing');
      const refs = window.__f07LifecycleRefs;
      if (!refs) throw new Error('Video lifecycle references missing');
      const surface = root.querySelector('[data-stitch-surface="video"]');
      const details = destinationRow.querySelector('.export-destination-menu');
      const summaryElement = details?.querySelector('.export-destination-summary');
      const optionElements = Array.from(
        destinationRow.querySelectorAll('.export-destination-option[data-destination-id]')
      );
      const optionIds = optionElements.map((option) =>
        option instanceof HTMLElement ? option.dataset.destinationId : undefined
      );
      return {
        hostRetained: refs.host === root.host,
        surfaceRetained: refs.surface === surface,
        rowRetained: refs.row === destinationRow,
        detailsRetained: refs.details === details,
        summaryRetained: refs.summary === summaryElement,
        optionsRetained:
          refs.options.length === optionElements.length &&
          refs.options.every((option, index) => option === optionElements[index]),
        optionIds,
        uniqueOptionIds: new Set(optionIds).size === optionIds.length,
        selectedIds: optionElements
          .filter((option) => option.classList.contains('is-selected'))
          .map((option) =>
            option instanceof HTMLElement ? option.dataset.destinationId : undefined
          ),
        menuOpen: details?.hasAttribute('open') ?? false,
        summaryFocused: root.activeElement === summaryElement,
        summaryFocusVisible: summaryElement?.matches(':focus-visible') ?? false
      };
    });
    expect(afterPlayer).toEqual({
      hostRetained: true,
      surfaceRetained: true,
      rowRetained: true,
      detailsRetained: true,
      summaryRetained: true,
      optionsRetained: true,
      optionIds: [B10_VAULT_ID, 'downloads'],
      uniqueOptionIds: true,
      selectedIds: ['downloads'],
      menuOpen: false,
      summaryFocused: true,
      summaryFocusVisible: true
    });
    await expect
      .poll(() => readB10VideoDraft(background, page.url()))
      .toMatchObject({ destination: { kind: 'downloads' }, captureCount: 1 });
  } finally {
    await context.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
});

async function readF07DestinationLayout(page: Page, surface: F07Surface) {
  const row = page.locator(`[data-stitch-surface="${surface}"] .export-destination-row`);
  await expect(row).toBeVisible();
  return row.evaluate((element) => {
    const root = element.getRootNode();
    if (!(root instanceof ShadowRoot || root instanceof Document)) {
      throw new Error('Destination row root must support selectors');
    }
    const select = (selector: string): Element => {
      const found = root.querySelector(selector);
      if (!(found instanceof Element)) throw new Error(`Missing ${selector}`);
      return found;
    };
    const style = (selector: string, pseudo?: string) => {
      const computed = getComputedStyle(select(selector), pseudo);
      return {
        display: computed.display,
        position: computed.position,
        padding: computed.padding,
        cursor: computed.cursor,
        listStyleType: computed.listStyleType,
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        lineHeight: computed.lineHeight,
        overflow: computed.overflow,
        textOverflow: computed.textOverflow,
        whiteSpace: computed.whiteSpace,
        zIndex: computed.zIndex,
        backgroundColor: computed.backgroundColor
      };
    };
    const rect = (selector: string) => {
      const value = select(selector).getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom };
    };
    const box = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return null;
      const value = element.getBoundingClientRect();
      const computed = getComputedStyle(element);
      return {
        className: element.className,
        left: value.left,
        right: value.right,
        width: value.width,
        cssWidth: computed.width,
        minWidth: computed.minWidth,
        maxWidth: computed.maxWidth,
        boxSizing: computed.boxSizing,
        display: computed.display,
        position: computed.position,
        overflow: computed.overflow
      };
    };
    const path = select('.export-destination-path');
    const surfaceWindow = select('.surface-window');
    return {
      row: style('.export-destination-row'),
      summary: style('.export-destination-summary'),
      marker: style('.export-destination-summary', '::marker'),
      eyebrow: style('.export-destination-eyebrow'),
      label: style('.export-destination-label'),
      path: style('.export-destination-path'),
      options: style('.export-destination-options'),
      summaryRect: rect('.export-destination-summary'),
      optionsRect: rect('.export-destination-options'),
      surfaceRect: rect('.surface-window'),
      ancestorBoxes: {
        surface: box(surfaceWindow),
        rail: box(surfaceWindow.closest('.session-panel-rail')),
        stage: box(surfaceWindow.closest('.surface-stage')),
        stack: box(surfaceWindow.closest('.resource-modal-stack')),
        body: box(surfaceWindow.closest('.resource-modal-body')),
        modal: box(surfaceWindow.closest('.resource-modal'))
      },
      pathClientWidth: path.clientWidth,
      pathScrollWidth: path.scrollWidth,
      pathHeight: path.getBoundingClientRect().height,
      surfaceClientWidth: surfaceWindow.clientWidth,
      surfaceScrollWidth: surfaceWindow.scrollWidth,
      pageClientWidth: document.documentElement.clientWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      viewport: { width: innerWidth, height: innerHeight }
    };
  });
}

async function expectF07VisibleFocus(locator: ReturnType<Page['locator']>): Promise<void> {
  const focus = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const root = element.getRootNode();
    return {
      active:
        root instanceof ShadowRoot
          ? root.activeElement === element
          : document.activeElement === element,
      focusVisible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow
    };
  });
  expect(focus.active).toBe(true);
  expect(focus.focusVisible).toBe(true);
  expect(
    (focus.outlineStyle !== 'none' && Number.parseFloat(focus.outlineWidth) > 0) ||
      focus.boxShadow !== 'none'
  ).toBe(true);
}

async function readF07FocusScrollState(page: Page, surface: F07Surface) {
  return page.locator(`[data-stitch-surface="${surface}"]`).evaluate((surfaceWindow) => {
    const root = surfaceWindow.getRootNode();
    if (!(root instanceof ShadowRoot)) throw new Error('F07 surface must use a ShadowRoot');
    const body = surfaceWindow.closest<HTMLElement>('.resource-modal-body');
    const row = root.querySelector<HTMLElement>('.export-destination-row');
    const option = root.querySelector<HTMLElement>('.export-destination-option:focus');
    const rect = (element: Element | null) => {
      const value = element?.getBoundingClientRect();
      return value
        ? { left: value.left, right: value.right, top: value.top, bottom: value.bottom }
        : null;
    };
    return {
      bodyScrollLeft: body?.scrollLeft ?? null,
      bodyClientWidth: body?.clientWidth ?? null,
      bodyScrollWidth: body?.scrollWidth ?? null,
      surfaceRect: rect(surfaceWindow),
      rowRect: rect(row),
      focusedOptionRect: rect(option),
      menuOpen: root.querySelector('.export-destination-menu[open]') !== null,
      activeClassName:
        root.activeElement instanceof HTMLElement ? root.activeElement.className : null
    };
  });
}

async function chooseF07DestinationWithKeyboard(
  page: Page,
  surface: F07Surface,
  destinationId: F07MatrixCase['destinationId'],
  expectedLabel: string,
  activationKey: ContentCorrectionKey
) {
  const scope = page.locator(`[data-stitch-surface="${surface}"]`);
  const menu = scope.locator('.export-destination-menu');
  const summary = scope.locator('.export-destination-summary');
  const option = scope.locator(
    `.export-destination-option[data-destination-id="${destinationId}"]`
  );
  await summary.focus();
  await page.keyboard.press('Shift+Tab');
  let reachedWithTab = false;
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press('Tab');
    reachedWithTab = await summary.evaluate((element) => {
      const root = element.getRootNode();
      return root instanceof ShadowRoot
        ? root.activeElement === element
        : document.activeElement === element;
    });
    if (reachedWithTab) break;
  }
  expect(reachedWithTab).toBe(true);
  await expectF07VisibleFocus(summary);
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('open', '');
  await page.keyboard.press('Space');
  await expect(menu).not.toHaveAttribute('open', '');
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('open', '');
  const beforeOptionFocus = await readF07FocusScrollState(page, surface);
  await option.focus();
  const afterOptionFocus = await readF07FocusScrollState(page, surface);
  await expect(option).toHaveAccessibleName(new RegExp(expectedLabel));
  await expectF07VisibleFocus(option);
  await page.keyboard.press(activationKey);
  await expect(menu).not.toHaveAttribute('open', '');
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expectF07VisibleFocus(summary);
  const afterActivation = await readF07FocusScrollState(page, surface);
  return { beforeOptionFocus, afterOptionFocus, afterActivation };
}

for (const matrixCase of F07_CASES) {
  test(`F07 shares export destination styles in ${matrixCase.id}`, async ({
    browserName: _browserName
  }, testInfo) => {
    const { context, page, profile } = await openF07Surface(matrixCase);
    try {
      const scope = page.locator(`[data-stitch-surface="${matrixCase.surface}"]`);
      const row = scope.locator('.export-destination-row');
      const menu = scope.locator('.export-destination-menu');
      const summary = scope.locator('.export-destination-summary');
      const target = scope.locator(
        `.export-destination-option[data-destination-id="${matrixCase.destinationId}"]`
      );
      await expect(scope).toHaveAttribute('data-preview-theme', matrixCase.theme);
      const browserLanguage = await page.evaluate(() => navigator.language);
      expect(browserLanguage.toLowerCase()).toContain(matrixCase.language.toLowerCase());
      await expect(scope.locator('.export-destination-eyebrow')).toHaveText(
        matrixCase.expectedEyebrow
      );
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          })
      );
      await row.evaluate((element) => {
        window.__f07DestinationRow = element;
      });

      const keyboardOutcome = await chooseF07DestinationWithKeyboard(
        page,
        matrixCase.surface,
        matrixCase.destinationId,
        matrixCase.expectedLabel,
        matrixCase.activationKey
      );
      const keyboardOutcomePath = testInfo.outputPath(`${matrixCase.id}-keyboard-scroll.json`);
      await fs.writeFile(keyboardOutcomePath, `${JSON.stringify(keyboardOutcome, null, 2)}\n`);
      await testInfo.attach(`${matrixCase.id}-keyboard-scroll.json`, {
        path: keyboardOutcomePath,
        contentType: 'application/json'
      });
      await expect(scope.locator('.export-destination-label')).toHaveText(matrixCase.expectedLabel);
      await expect(target).toHaveClass(/is-selected/);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          })
      );
      await expect
        .poll(() => row.evaluate((element) => window.__f07DestinationRow === element))
        .toBe(true);

      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(menu).toHaveAttribute('open', '');
      const openLayout = await readF07DestinationLayout(page, matrixCase.surface);
      const openLayoutPath = testInfo.outputPath(`${matrixCase.id}-open-layout.json`);
      await fs.writeFile(openLayoutPath, `${JSON.stringify(openLayout, null, 2)}\n`);
      await testInfo.attach(`${matrixCase.id}-open-layout.json`, {
        path: openLayoutPath,
        contentType: 'application/json'
      });
      await page.screenshot({
        path: testInfo.outputPath(`${matrixCase.id}-open.png`),
        fullPage: false
      });
      expect(openLayout.row.display).toBe('flex');
      expect(openLayout.summary).toMatchObject({
        display: 'grid',
        padding: '8px 10px',
        cursor: 'pointer'
      });
      expect(openLayout.marker.listStyleType).toBe('none');
      expect(openLayout.eyebrow.fontSize).toBe('10px');
      expect(openLayout.label).toMatchObject({ fontSize: '11px', fontWeight: '650' });
      expect(openLayout.path).toMatchObject({
        fontSize: '10px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      });
      expect(openLayout.options).toMatchObject({
        display: 'grid',
        position: 'absolute',
        zIndex: '2'
      });
      expect(openLayout.pathScrollWidth).toBeGreaterThan(openLayout.pathClientWidth);
      expect(openLayout.pathHeight).toBeLessThanOrEqual(
        Number.parseFloat(openLayout.path.lineHeight) * 1.25
      );
      expect(openLayout.surfaceScrollWidth).toBeLessThanOrEqual(openLayout.surfaceClientWidth);
      expect(openLayout.pageScrollWidth).toBeLessThanOrEqual(openLayout.pageClientWidth);
      expect(openLayout.optionsRect.left).toBeGreaterThanOrEqual(-1);
      expect(openLayout.optionsRect.right).toBeLessThanOrEqual(openLayout.viewport.width + 1);
      expect(openLayout.optionsRect.top).toBeGreaterThanOrEqual(-1);
      expect(openLayout.optionsRect.bottom).toBeLessThanOrEqual(openLayout.viewport.height + 1);
      if (matrixCase.surface === 'clipper') {
        expect(openLayout.optionsRect.top).toBeGreaterThanOrEqual(openLayout.summaryRect.bottom);
      } else {
        expect(openLayout.optionsRect.bottom).toBeLessThanOrEqual(openLayout.summaryRect.top);
      }
      const selectedColor = await target.evaluate(
        (element) => getComputedStyle(element).backgroundColor
      );
      expect(selectedColor).not.toBe('rgba(0, 0, 0, 0)');
      if (!matrixCase.leaveOpen) {
        const beforeFinalClose = await scope.evaluate((surface) => {
          const root = surface.getRootNode();
          if (!(root instanceof ShadowRoot)) throw new Error('F07 final-close root missing');
          const row = root.querySelector('.export-destination-row');
          const summary = root.querySelector('.export-destination-summary');
          const active = root.activeElement;
          return {
            retainedRow: window.__f07DestinationRow === row,
            menuOpen: root.querySelector('.export-destination-menu[open]') !== null,
            summaryActive: active === summary,
            activeClassName: active instanceof HTMLElement ? active.className : null,
            activeDestinationId:
              active instanceof HTMLElement ? (active.dataset.destinationId ?? null) : null
          };
        });
        const beforeFinalClosePath = testInfo.outputPath(
          `${matrixCase.id}-before-final-space.json`
        );
        await fs.writeFile(beforeFinalClosePath, `${JSON.stringify(beforeFinalClose, null, 2)}\n`);
        await testInfo.attach(`${matrixCase.id}-before-final-space.json`, {
          path: beforeFinalClosePath,
          contentType: 'application/json'
        });
        expect(beforeFinalClose).toMatchObject({
          retainedRow: true,
          menuOpen: true,
          summaryActive: true
        });
        await page.keyboard.press('Space');
        await expect(menu).not.toHaveAttribute('open', '');
      }
      await page.screenshot({
        path: testInfo.outputPath(
          `${matrixCase.id}-${matrixCase.leaveOpen ? 'retained-open' : 'closed'}.png`
        ),
        fullPage: false
      });
    } finally {
      await context.close();
      await fs.rm(profile, { recursive: true, force: true });
    }
  });
}
