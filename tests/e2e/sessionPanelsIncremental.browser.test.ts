import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
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

async function readB10VideoDraft(extensionPage: Page, pageUrl: string) {
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

    await updateB10Vault(extensionPage, B10_LIVE_VAULT_NAME);
    await Promise.all([
      expectB10Destination(clipper.page, 'clipper-row', B10_LIVE_VAULT_NAME),
      expectB10Destination(reader.page, 'reader-row', B10_LIVE_VAULT_NAME),
      expectB10Destination(video.page, 'video-row', B10_LIVE_VAULT_NAME)
    ]);

    await updateB10Vault(extensionPage, B10_RENAMED_VAULT_NAME);
    await Promise.all([
      expectB10Destination(clipper.page, 'clipper-row', B10_RENAMED_VAULT_NAME),
      expectB10Destination(reader.page, 'reader-row', B10_RENAMED_VAULT_NAME),
      expectB10Destination(video.page, 'video-row', B10_RENAMED_VAULT_NAME)
    ]);

    await Promise.all([clipper.page.close(), reader.page.close(), video.page.close()]);
  }
);

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
