/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalVaultPermissionState } from '../../../src/platform/interfaces/fileSystemAccess';

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('localVaultPermissionFrame', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window.history.replaceState(
      null,
      '',
      '/permission.html?folderId=folder-main&folderName=Main%20Vault'
    );
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('posts granted result through an injected permission service', async () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const permissionService = {
      ensurePermission: vi.fn<() => Promise<LocalVaultPermissionState>>(() =>
        Promise.resolve('granted')
      )
    };
    const { mountLocalVaultPermissionFrame } =
      await import('../../../src/content/runtime/localVaultPermissionFrame');

    mountLocalVaultPermissionFrame({
      document,
      window,
      permissionService
    });
    document.querySelector<HTMLButtonElement>('[data-action="authorize"]')?.click();
    await flushMicrotasks();

    expect(permissionService.ensurePermission).toHaveBeenCalledWith('folder-main');
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'AIIOB_LOCAL_VAULT_PERMISSION_RESULT',
        response: { action: 'granted', permissionState: 'granted' }
      },
      '*'
    );
  });

  it('preserves REST fallback message contract for manual fallback buttons', async () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const permissionService = {
      ensurePermission: vi.fn<() => Promise<LocalVaultPermissionState>>(() =>
        Promise.resolve('prompt')
      )
    };
    const { mountLocalVaultPermissionFrame } =
      await import('../../../src/content/runtime/localVaultPermissionFrame');

    mountLocalVaultPermissionFrame({
      document,
      window,
      permissionService
    });
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
});
