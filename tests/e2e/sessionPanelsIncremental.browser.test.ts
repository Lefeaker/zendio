import { chromium, expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../../build/dist');

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
      const insideSessionPanel = (target: unknown): boolean => {
        if (!(target instanceof Node)) return false;
        const root = target.getRootNode();
        return (
          root instanceof ShadowRoot &&
          root.host instanceof HTMLElement &&
          root.host.dataset.sessionPanelRoot === 'true'
        );
      };
      const insertBefore = Node.prototype.insertBefore;
      Node.prototype.insertBefore = function <T extends Node>(node: T, child: Node | null): T {
        if (insideSessionPanel(this)) metrics.inserts += 1;
        return insertBefore.call(this, node, child) as T;
      };
      const removeChild = Node.prototype.removeChild;
      Node.prototype.removeChild = function <T extends Node>(child: T): T {
        if (insideSessionPanel(this)) metrics.removes += 1;
        return removeChild.call(this, child) as T;
      };
      const add = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (
        ...args: Parameters<EventTarget['addEventListener']>
      ) {
        if (insideSessionPanel(this)) metrics.listenersAdded += 1;
        return add.apply(this, args);
      };
      const remove = EventTarget.prototype.removeEventListener;
      EventTarget.prototype.removeEventListener = function (
        ...args: Parameters<EventTarget['removeEventListener']>
      ) {
        if (insideSessionPanel(this)) metrics.listenersRemoved += 1;
        return remove.apply(this, args);
      };
      Object.assign(window, { __u04aMetrics: metrics });
    });
    await page.goto(`chrome-extension://${extensionId}/content-orchestrator-harness.html`);
    await expect(page.locator('#status')).toHaveText('Harness ready');

    await page.evaluate(async () => {
      const harness = (
        window as unknown as {
          harness: {
            startReaderSession(): Promise<void>;
            setReaderHighlightCount(count: number): void;
          };
        }
      ).harness;
      await harness.startReaderSession();
      harness.setReaderHighlightCount(20);
      const host = document.querySelector<HTMLElement>('#aiob-reader-panel');
      const shadow = host?.shadowRoot;
      Object.assign(window, {
        __u04aReaderRefs: {
          shell: shadow?.querySelector('.reader-surface-window'),
          list: shadow?.querySelector('.session-item-list'),
          first: shadow?.querySelector('[data-highlight-id="harness-highlight-1"]'),
          preview: shadow?.querySelector(
            '[data-highlight-id="harness-highlight-1"] .session-item-primary-line'
          ),
          lastInput: shadow?.querySelector('[data-highlight-input="harness-highlight-20"]'),
          status: shadow?.querySelector('[data-session-status]')
        }
      });
      const preview = shadow?.querySelector<HTMLElement>(
        '[data-highlight-id="harness-highlight-1"] .session-item-primary-line'
      );
      preview?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
      for (let index = 0; index < 100; index += 1) harness.setReaderHighlightCount(20);
    });

    const readerState = await page.evaluate(() => {
      const refs = (window as unknown as { __u04aReaderRefs: Record<string, Element> })
        .__u04aReaderRefs;
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
      const harness = (
        window as unknown as {
          harness: {
            startVideoSession(): Promise<void>;
          };
        }
      ).harness;
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
      Object.assign(window, { __u04aVideoPreview: preview });
    }, fragmentId);
    await page.evaluate(async () => {
      const harness = (
        window as unknown as {
          harness: { addVideoCaptureCount(count: number): Promise<void> };
        }
      ).harness;
      await harness.addVideoCaptureCount(20);
    });
    await expect(page.locator('[data-role="capture-item"]')).toHaveCount(21);
    const videoPreviewState = await page.evaluate((id) => {
      const host = document.querySelector<HTMLElement>('[data-session-panel-root="true"]');
      const preview = host?.shadowRoot?.querySelector<HTMLElement>(
        `[data-capture-id="${id}"] .session-item-primary-line`
      );
      const retained = (window as unknown as { __u04aVideoPreview: HTMLElement })
        .__u04aVideoPreview;
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
