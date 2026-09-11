import { expect, type Page } from '@playwright/test';
import type { MessageListenerResult } from '../../../src/platform/interfaces/messaging';
import { findCurrentTabId, injectContentRuntime } from './videoListenerScopeHarness';

export type RecoveryDraft = {
  key: string;
  record: {
    revision: number;
    status: string;
    lease?: { leaseId: string; leaseExpiresAt: number };
    payload: object;
  };
};

export async function recoveryDrafts(
  extensionPage: Page,
  pageUrl: string
): Promise<RecoveryDraft[]> {
  return extensionPage.evaluate(async (url) => {
    const all = await chrome.storage.local.get(null);
    return Object.entries(all).flatMap(([key, value]) => {
      if (
        !key.startsWith('aiob.sessionDraft.v1.') ||
        !value ||
        typeof value !== 'object' ||
        !('pageUrl' in value) ||
        value.pageUrl !== url ||
        !('revision' in value) ||
        typeof value.revision !== 'number' ||
        !('status' in value) ||
        typeof value.status !== 'string' ||
        !('payload' in value) ||
        !value.payload ||
        typeof value.payload !== 'object'
      )
        return [];
      const lease = 'lease' in value ? value.lease : undefined;
      const validLease =
        lease &&
        typeof lease === 'object' &&
        'leaseId' in lease &&
        typeof lease.leaseId === 'string' &&
        'leaseExpiresAt' in lease &&
        typeof lease.leaseExpiresAt === 'number'
          ? { leaseId: lease.leaseId, leaseExpiresAt: lease.leaseExpiresAt }
          : undefined;
      return [
        {
          key,
          record: {
            revision: value.revision,
            status: value.status,
            payload: value.payload,
            ...(validLease ? { lease: validLease } : {})
          }
        }
      ];
    });
  }, pageUrl);
}

export async function openRecoveryReader(
  page: Page,
  extensionPage: Page,
  url: string
): Promise<number> {
  await page.route(url, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html lang="en"><head><title>Session recovery article</title></head><body><main><h1>Recovery</h1><p id="selection">A durable highlight survives a disconnected extension and a delayed reply.</p></main></body></html>'
    })
  );
  await page.goto(url);
  const tabId = await findCurrentTabId(extensionPage, url);
  await injectContentRuntime(extensionPage, tabId);
  await page.evaluate(() => {
    const range = document.createRange();
    const text = document.querySelector('#selection');
    if (!text) throw new Error('Selection fixture missing');
    range.selectNodeContents(text);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  await expect
    .poll(async () =>
      extensionPage.evaluate(async (id) => {
        try {
          await chrome.tabs.sendMessage(id, { action: 'clipSelection' });
          return true;
        } catch {
          return false;
        }
      }, tabId)
    )
    .toBe(true);
  await page.locator('[data-action-id="reader"]').click();
  await expect(page.locator('#aiob-reader-panel')).toHaveCount(1);
  await expect.poll(async () => (await recoveryDrafts(extensionPage, url)).length).toBe(1);
  return tabId;
}

export async function durableNote(page: Page, extensionPage: Page, value: string): Promise<void> {
  await page.locator('[data-highlight-input]').first().fill(value);
  await expect
    .poll(async () => JSON.stringify(await recoveryDrafts(extensionPage, page.url())))
    .toContain(value);
}

/** Injected into the extension's isolated world, wrapping the real native transport after commit. */
export async function interceptRecoveryReply(
  extensionPage: Page,
  tabId: number,
  operation: string,
  mode: 'lose' | 'delay'
): Promise<void> {
  await extensionPage.evaluate(
    async ({ id, operation: target, mode: faultMode }) => {
      await chrome.scripting.executeScript({
        target: { tabId: id },
        args: [target, faultMode],
        func: (targetOperation, kind) => {
          const original = chrome.runtime.sendMessage.bind(chrome.runtime);
          const state: { armed: boolean; release?: () => void } = { armed: true };
          const nativeSend = (message: object, callback: (reply: MessageListenerResult) => void) =>
            original(message, callback);
          const wrapped = (
            message: { request?: { operation?: string } },
            callback: (reply: MessageListenerResult) => void
          ) => {
            nativeSend(message, (reply) => {
              const error = chrome.runtime.lastError;
              if (error || !state.armed || message.request?.operation !== targetOperation) {
                callback(reply);
                return;
              }
              state.armed = false;
              document.documentElement.dataset.recoveryFault = targetOperation;
              if (kind === 'lose') callback(undefined);
              else
                state.release = () => {
                  callback(reply);
                  delete state.release;
                };
            });
          };
          Object.defineProperty(chrome.runtime, 'sendMessage', {
            value: wrapped,
            configurable: true
          });
          const release = () => state.release?.();
          document.addEventListener('test:release-recovery-reply', release);
        }
      });
    },
    { id: tabId, operation, mode }
  );
}

export async function releaseRecoveryReply(extensionPage: Page, tabId: number): Promise<void> {
  await extensionPage.evaluate(async (id) => {
    await chrome.scripting.executeScript({
      target: { tabId: id },
      func: () => {
        document.dispatchEvent(new Event('test:release-recovery-reply'));
      }
    });
  }, tabId);
}
