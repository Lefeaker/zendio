/* @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindSessionPanelFirstUseGuide } from '../../../src/content/shared/panels/sessionPanelFirstUseGuide';
import { createMemoryStorageArea } from '../../../src/platform/preview/memoryStorage';

function surface() {
  const root = document.createElement('div');
  const button = document.createElement('button');
  button.dataset.actionId = 'session:dismissFirstUseGuide';
  root.append(button);
  return { root, button };
}

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

afterEach(() => vi.restoreAllMocks());

describe('session panel first-use acknowledgement', () => {
  it('waits for acknowledgement and remembers it independently for each mode', async () => {
    const storage = createMemoryStorageArea();
    const first = surface();
    const dispose = bindSessionPanelFirstUseGuide(first.root, 'reader', storage);
    expect(first.root.dataset.sessionFirstUse).toBeUndefined();
    await flush();
    expect(first.root.dataset.sessionFirstUse).toBe('true');
    expect(await storage.get('aiob.firstUse.readerPanel.v1')).toBeUndefined();
    dispose();
    const second = surface();
    bindSessionPanelFirstUseGuide(second.root, 'reader', storage);
    await flush();
    expect(second.root.dataset.sessionFirstUse).toBe('true');
    const parentClick = vi.fn();
    second.root.addEventListener('click', parentClick);
    second.button.click();
    expect(parentClick).not.toHaveBeenCalled();
    expect(second.root.dataset.sessionFirstUse).toBeUndefined();
    expect(await storage.get('aiob.firstUse.readerPanel.v1')).toBe(true);
    const reader = surface();
    const video = surface();
    bindSessionPanelFirstUseGuide(reader.root, 'reader', storage);
    bindSessionPanelFirstUseGuide(video.root, 'video', storage);
    await flush();
    expect(reader.root.dataset.sessionFirstUse).toBeUndefined();
    expect(video.root.dataset.sessionFirstUse).toBe('true');
  });

  it('does not resurrect a dismissed guide when an older read completes', async () => {
    const storage = createMemoryStorageArea();
    let finishRead: (() => void) | undefined;
    vi.spyOn(storage, 'get').mockImplementation(
      () =>
        new Promise<undefined>((resolve) => {
          finishRead = () => resolve(undefined);
        })
    );
    const { root, button } = surface();
    bindSessionPanelFirstUseGuide(root, 'video', storage);
    button.click();
    finishRead?.();
    await flush();
    expect(root.dataset.sessionFirstUse).toBeUndefined();
    expect(await storage.getMany(['aiob.firstUse.videoPanel.v1'])).toEqual({
      'aiob.firstUse.videoPanel.v1': true
    });
  });

  it('removes the listener and ignores a pending read after disposal', async () => {
    const storage = createMemoryStorageArea();
    const save = vi.spyOn(storage, 'set');
    const { root, button } = surface();
    const dispose = bindSessionPanelFirstUseGuide(root, 'reader', storage);
    dispose();
    await flush();
    button.click();
    expect(root.dataset.sessionFirstUse).toBeUndefined();
    expect(save).not.toHaveBeenCalled();
  });

  it('contains storage failures without blocking the panel or reopening the current guide', async () => {
    const storage = createMemoryStorageArea();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(storage, 'get').mockRejectedValueOnce(new Error('read unavailable'));
    const first = surface();
    bindSessionPanelFirstUseGuide(first.root, 'reader', storage);
    await flush();
    expect(first.root.dataset.sessionFirstUse).toBeUndefined();
    const second = surface();
    bindSessionPanelFirstUseGuide(second.root, 'reader', storage);
    await flush();
    expect(second.root.dataset.sessionFirstUse).toBe('true');
    vi.spyOn(storage, 'set').mockRejectedValueOnce(new Error('write unavailable'));
    second.button.click();
    await flush();
    expect(second.root.dataset.sessionFirstUse).toBeUndefined();
    expect(warning).toHaveBeenCalledTimes(2);
  });
});
