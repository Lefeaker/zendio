/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createContentMessageRouter } from '@content/runtime/contentMessageRouter';
import { SHOW_LOCAL_VAULT_PERMISSION_PROMPT, SHOW_SUPPORT_PROMPT } from '@shared/types/clip';

function createRouter(overrides: Partial<Parameters<typeof createContentMessageRouter>[0]> = {}) {
  return createContentMessageRouter({
    document,
    window,
    messaging: { addListener: vi.fn(() => () => undefined), send: vi.fn() },
    supportPrompt: { show: vi.fn() },
    localVaultPermissionPrompt: { request: vi.fn() },
    setClipMode: vi.fn(),
    runClip: vi.fn(),
    selectionController: {
      handleVideoSelectionClip: vi.fn(),
      handleVideoSelectionClipFromData: vi.fn()
    },
    createVideoSession: vi.fn(),
    isVideoSessionActive: vi.fn(() => false),
    getVideoSession: vi.fn(() => null),
    resolveActiveSelection: vi.fn(() => null),
    restoreSelectionFromSnapshot: vi.fn(() => null),
    getLastSelectionSnapshot: vi.fn(() => null),
    clearLastSelectionSnapshot: vi.fn(),
    ...overrides
  });
}

describe('contentMessageRouter', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('routes support prompt messages with normalized options', async () => {
    const supportPrompt = { show: vi.fn() };
    const router = createRouter({
      supportPrompt,
      localVaultPermissionPrompt: { request: vi.fn() }
    });

    await router.handleMessage(
      {
        type: SHOW_SUPPORT_PROMPT,
        vaultName: 'Main Vault',
        status: 'warning',
        errorMessage: 'send failed'
      },
      {}
    );

    expect(supportPrompt.show).toHaveBeenCalledWith({
      vaultName: 'Main Vault',
      status: 'warning',
      errorMessage: 'send failed'
    });
  });

  it('routes support progress messages with progress metadata', async () => {
    const supportPrompt = { show: vi.fn() };
    const router = createRouter({
      supportPrompt,
      localVaultPermissionPrompt: { request: vi.fn() }
    });

    await router.handleMessage(
      {
        type: SHOW_SUPPORT_PROMPT,
        status: 'progress',
        progress: { value: 64, label: '正在写入附件' }
      },
      {}
    );

    expect(supportPrompt.show).toHaveBeenCalledWith({
      status: 'progress',
      progress: { value: 64, label: '正在写入附件' }
    });
  });

  it('short-circuits startVideoMode when a session is already active', async () => {
    const createVideoSession = vi.fn();
    const router = createRouter({
      createVideoSession,
      isVideoSessionActive: vi.fn(() => true),
      getVideoSession: vi.fn(() => ({ start: vi.fn() }) as never)
    });

    const localVaultPermissionPrompt = {
      request: vi.fn().mockResolvedValue({ action: 'granted', permissionState: 'granted' })
    };
    const localVaultRouter = createRouter({ localVaultPermissionPrompt });

    await expect(
      localVaultRouter.handleMessage(
        {
          type: SHOW_LOCAL_VAULT_PERMISSION_PROMPT,
          folderId: 'folder-main',
          folderName: 'Blog',
          vaultName: 'blog'
        },
        {}
      )
    ).resolves.toEqual({ action: 'granted', permissionState: 'granted' });

    expect(localVaultPermissionPrompt.request).toHaveBeenCalledWith({
      type: SHOW_LOCAL_VAULT_PERMISSION_PROMPT,
      folderId: 'folder-main',
      folderName: 'Blog',
      vaultName: 'blog'
    });

    const result = await router.handleMessage({ action: 'startVideoMode' }, {});

    expect(result).toEqual({ success: true, alreadyActive: true });
    expect(createVideoSession).not.toHaveBeenCalled();
  });

  it('uses the saved snapshot when videoClipSelection has no live selection', async () => {
    const range = document.createRange();
    const textNode = document.createTextNode('saved selection');
    document.body.appendChild(textNode);
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.textContent?.length ?? 0);

    const restoredSelection = {
      rangeCount: 1,
      isCollapsed: false
    } as Selection;
    const handleVideoSelectionClip = vi.fn().mockResolvedValue(undefined);
    const clearLastSelectionSnapshot = vi.fn();
    const snapshot = { range, root: document };
    const getLastSelectionSnapshot = vi.fn(() => snapshot);
    const restoreSelectionFromSnapshot = vi.fn(() => ({
      selection: restoredSelection,
      root: document
    }));

    const router = createRouter({
      selectionController: {
        handleVideoSelectionClip,
        handleVideoSelectionClipFromData: vi.fn()
      },
      restoreSelectionFromSnapshot,
      getLastSelectionSnapshot,
      clearLastSelectionSnapshot
    });

    const result = await router.handleMessage({ action: 'videoClipSelection' }, {});

    expect(restoreSelectionFromSnapshot).toHaveBeenCalledWith(snapshot);
    expect(handleVideoSelectionClip).toHaveBeenCalledWith(
      document,
      location.href,
      restoredSelection
    );
    expect(clearLastSelectionSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true });
  });

  it('forwards frame video selections to the top-level content script', async () => {
    const textNode = document.createTextNode('frame selection');
    document.body.appendChild(textNode);
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.textContent?.length ?? 0);

    const selection = {
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: vi.fn(() => range),
      toString: vi.fn(() => 'frame selection'),
      removeAllRanges: vi.fn()
    } as unknown as Selection;
    const send = vi.fn().mockResolvedValue(undefined);
    const frameWindow = {
      top: {},
      getSelection: vi.fn(() => selection)
    } as unknown as Window;

    const router = createRouter({
      document,
      window: frameWindow,
      messaging: { addListener: vi.fn(() => () => undefined), send },
      selectionController: {
        handleVideoSelectionClip: vi.fn(),
        handleVideoSelectionClipFromData: vi.fn()
      }
    });

    const result = await router.handleMessage({ action: 'videoClipSelection', frameId: 3 }, {});

    expect(send).toHaveBeenCalledWith({
      type: 'AIIOB_FORWARD_VIDEO_SELECTION',
      payload: {
        selectedHtml: 'frame selection',
        selectedText: 'frame selection',
        sourceUrl: location.href
      }
    });
    expect(selection.removeAllRanges).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, forwarded: true });
  });

  it('ignores unknown messages without route side effects', async () => {
    const supportPrompt = { show: vi.fn() };
    const localVaultPermissionPrompt = { request: vi.fn() };
    const setClipMode = vi.fn();
    const runClip = vi.fn();
    const router = createRouter({
      supportPrompt,
      localVaultPermissionPrompt,
      setClipMode,
      runClip
    });

    const result = await router.handleMessage({ action: 'unknownAction' }, {});

    expect(result).toBeUndefined();
    expect(supportPrompt.show).not.toHaveBeenCalled();
    expect(localVaultPermissionPrompt.request).not.toHaveBeenCalled();
    expect(setClipMode).not.toHaveBeenCalled();
    expect(runClip).not.toHaveBeenCalled();
  });
});
