/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createContentMessageRouter } from '@content/runtime/contentMessageRouter';
import { SHOW_SUPPORT_PROMPT } from '@shared/types/clip';

describe('contentMessageRouter', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('routes support prompt messages with normalized options', async () => {
    const supportPrompt = { show: vi.fn() };
    const router = createContentMessageRouter({
      document,
      window,
      messaging: { addListener: vi.fn(() => () => undefined), send: vi.fn() },
      supportPrompt,
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
      clearLastSelectionSnapshot: vi.fn()
    });

    await router.handleMessage({
      type: SHOW_SUPPORT_PROMPT,
      vaultName: 'Main Vault',
      status: 'warning',
      errorMessage: 'send failed'
    }, {});

    expect(supportPrompt.show).toHaveBeenCalledWith({
      vaultName: 'Main Vault',
      status: 'warning',
      errorMessage: 'send failed'
    });
  });

  it('short-circuits startVideoMode when a session is already active', async () => {
    const createVideoSession = vi.fn();
    const router = createContentMessageRouter({
      document,
      window,
      messaging: { addListener: vi.fn(() => () => undefined), send: vi.fn() },
      supportPrompt: { show: vi.fn() },
      setClipMode: vi.fn(),
      runClip: vi.fn(),
      selectionController: {
        handleVideoSelectionClip: vi.fn(),
        handleVideoSelectionClipFromData: vi.fn()
      },
      createVideoSession,
      isVideoSessionActive: vi.fn(() => true),
      getVideoSession: vi.fn(() => ({ start: vi.fn() } as never)),
      resolveActiveSelection: vi.fn(() => null),
      restoreSelectionFromSnapshot: vi.fn(() => null),
      getLastSelectionSnapshot: vi.fn(() => null),
      clearLastSelectionSnapshot: vi.fn()
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

    const router = createContentMessageRouter({
      document,
      window,
      messaging: { addListener: vi.fn(() => () => undefined), send: vi.fn() },
      supportPrompt: { show: vi.fn() },
      setClipMode: vi.fn(),
      runClip: vi.fn(),
      selectionController: {
        handleVideoSelectionClip,
        handleVideoSelectionClipFromData: vi.fn()
      },
      createVideoSession: vi.fn(),
      isVideoSessionActive: vi.fn(() => false),
      getVideoSession: vi.fn(() => null),
      resolveActiveSelection: vi.fn(() => null),
      restoreSelectionFromSnapshot,
      getLastSelectionSnapshot,
      clearLastSelectionSnapshot
    });

    const result = await router.handleMessage({ action: 'videoClipSelection' }, {});

    expect(restoreSelectionFromSnapshot).toHaveBeenCalledWith(snapshot);
    expect(handleVideoSelectionClip).toHaveBeenCalledWith(document, location.href, restoredSelection);
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

    const router = createContentMessageRouter({
      document,
      window: frameWindow,
      messaging: { addListener: vi.fn(() => () => undefined), send },
      supportPrompt: { show: vi.fn() },
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
      clearLastSelectionSnapshot: vi.fn()
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
});
