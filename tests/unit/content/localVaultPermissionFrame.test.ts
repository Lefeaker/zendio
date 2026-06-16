/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMessage } from '../../../src/i18n';
import type { LocalVaultPermissionState } from '../../../src/platform/interfaces/fileSystemAccess';
import { SHOW_LOCAL_VAULT_PERMISSION_PROMPT } from '../../../src/shared/types/clip';

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

async function loadPermissionMessages(language: string) {
  const { getMessagesForLanguage } = await import('../../../src/i18n');
  return getMessagesForLanguage(language);
}

async function loadPermissionFrameModule() {
  const module = await import('../../../src/content/runtime/localVaultPermissionFrame');
  await flushMicrotasks();
  return module;
}

describe('localVaultPermissionFrame', () => {
  beforeEach(() => {
    document.documentElement.lang = '';
    document.documentElement.dir = '';
    document.title = '';
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window.history.replaceState(
      null,
      '',
      '/permission.html?folderId=folder-main&folderName=Main%20Vault&language=en'
    );
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders zh-CN catalog copy, updates metadata, and posts granted results', async () => {
    const messages = await loadPermissionMessages('zh-CN');
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const permissionService = {
      ensurePermission: vi.fn<() => Promise<LocalVaultPermissionState>>(() =>
        Promise.resolve('granted')
      )
    };
    window.history.replaceState(
      null,
      '',
      '/permission.html?folderId=folder-main&folderName=Main%20Vault&language=zh-CN'
    );
    const { mountLocalVaultPermissionFrame } = await loadPermissionFrameModule();

    mountLocalVaultPermissionFrame({
      document,
      window,
      permissionService,
      language: 'zh-CN'
    });
    await flushMicrotasks();

    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.title).toBe(messages.localVaultPermissionTitle);
    expect(document.querySelector('h1')?.textContent).toBe(messages.localVaultPermissionFrameTitle);
    expect(document.querySelector<HTMLElement>('[data-role="description"]')?.textContent).toBe(
      formatMessage(messages.localVaultPermissionDescription, { folderName: 'Main Vault' }, 'zh-CN')
    );
    expect(document.querySelector<HTMLElement>('[data-role="reconfirm"]')?.textContent).toBe(
      messages.localVaultPermissionChromeReconfirm
    );
    expect(
      document.querySelector<HTMLButtonElement>('[data-action="authorize"]')?.textContent
    ).toBe(messages.localVaultPermissionAuthorizeButton);
    expect(
      document.querySelector<HTMLButtonElement>('[data-action="rest-once"]')?.textContent
    ).toBe(messages.localVaultPermissionUseRestOnceButton);
    expect(
      document.querySelector<HTMLButtonElement>('[data-action="rest-always"]')?.textContent
    ).toBe(messages.localVaultPermissionUseRestAlwaysButton);

    document.querySelector<HTMLButtonElement>('[data-action="authorize"]')?.click();
    await flushMicrotasks();

    expect(permissionService.ensurePermission).toHaveBeenCalledWith('folder-main');
    expect(document.querySelector<HTMLElement>('[data-role="status"]')?.textContent).toBe(
      messages.localVaultPermissionOpeningStatus
    );
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'AIIOB_LOCAL_VAULT_PERMISSION_RESULT',
        response: { action: 'granted', permissionState: 'granted' }
      },
      '*'
    );
  });

  it('renders English copy without CJK and uses the localized folder fallback', async () => {
    const messages = await loadPermissionMessages('en');
    const permissionService = {
      ensurePermission: vi.fn<() => Promise<LocalVaultPermissionState>>(() =>
        Promise.resolve('prompt')
      )
    };
    window.history.replaceState(null, '', '/permission.html?folderId=folder-main&language=en');
    const { mountLocalVaultPermissionFrame } = await loadPermissionFrameModule();

    mountLocalVaultPermissionFrame({
      document,
      window,
      permissionService,
      language: 'en'
    });
    await flushMicrotasks();

    const bodyText = document.body.textContent ?? '';
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe(messages.localVaultPermissionTitle);
    expect(bodyText).toContain(messages.localVaultPermissionFolderFallback);
    expect(bodyText).toContain(messages.localVaultPermissionUseRestAlwaysButton);
    expect(bodyText).not.toMatch(/\p{Script=Han}/u);
  });

  it('preserves REST fallback message contract for manual fallback buttons', async () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const permissionService = {
      ensurePermission: vi.fn<() => Promise<LocalVaultPermissionState>>(() =>
        Promise.resolve('prompt')
      )
    };
    const { mountLocalVaultPermissionFrame } = await loadPermissionFrameModule();

    mountLocalVaultPermissionFrame({
      document,
      window,
      permissionService
    });
    await flushMicrotasks();
    document.querySelector<HTMLButtonElement>('[data-action="rest-always"]')?.click();

    expect(permissionService.ensurePermission).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'AIIOB_LOCAL_VAULT_PERMISSION_RESULT',
        response: { action: 'use-rest', permissionState: 'denied', persistRest: true }
      },
      '*'
    );
  });

  it('localizes the iframe title and passes the resolved language to the permission page', async () => {
    const messages = await loadPermissionMessages('zh-CN');
    const { createLocalVaultPermissionPrompt } =
      await import('../../../src/content/runtime/localVaultPermissionPrompt');

    const prompt = createLocalVaultPermissionPrompt({
      document,
      window,
      runtime: {
        getURL: (path: string) => `chrome-extension://test/${path}`
      },
      resolveLocalization: async () => ({
        language: 'zh-CN',
        title: messages.localVaultPermissionTitle
      })
    });

    const pendingResult = prompt.request({
      type: SHOW_LOCAL_VAULT_PERMISSION_PROMPT,
      folderId: 'folder-main',
      folderName: 'Main Vault'
    });
    await flushMicrotasks();

    const frame = document.querySelector<HTMLIFrameElement>('iframe');
    expect(frame).not.toBeNull();
    expect(frame?.title).toBe(messages.localVaultPermissionTitle);
    if (!frame) {
      throw new Error('Expected the permission prompt iframe to be rendered.');
    }
    expect(new URL(frame.src).searchParams.get('language')).toBe('zh-CN');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(pendingResult).resolves.toEqual({ action: 'cancelled' });
  });
});
