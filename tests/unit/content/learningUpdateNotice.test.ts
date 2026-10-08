/* @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorageService } from '../../../src/platform/preview/memoryStorage';
import { bindLearningUpdateNotice } from '../../../src/content/shared/panels/learningUpdateNotice';
import { registerLearningUpdateNotice } from '../../../src/background/listeners/learningUpdate';
import {
  crossesLearningUpdate,
  LEARNING_UPDATE_AVAILABLE_KEY as AVAILABLE,
  LEARNING_UPDATE_DISMISSED_KEY as DISMISSED
} from '../../../src/shared/learningUpdateNotice';
import type { RuntimeInstallListener } from '../../../src/platform/interfaces/runtime';
import type { StorageChangeCallback } from '../../../src/platform/interfaces/storage';

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));
function requireElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error('Missing test control: ' + selector);
  return element;
}
function setup() {
  const storage = createMemoryStorageService();
  const listeners = new Map<string, Set<StorageChangeCallback>>();
  vi.spyOn(storage.local, 'watchKey').mockImplementation((key, callback) => {
    const set = listeners.get(key) ?? new Set<StorageChangeCallback>();
    set.add(callback);
    listeners.set(key, set);
    return () => {
      set.delete(callback);
    };
  });
  const originalSet = storage.local.set;
  vi.spyOn(storage.local, 'set').mockImplementation(async (key, value) => {
    await originalSet(key, value);
    listeners.get(key)?.forEach((callback) => callback(value, { newValue: value }));
  });
  const runtime = { getURL: (path: string) => `chrome-extension://test/${path}` };
  const mount = (kind = 'clipper') => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="${kind}-surface-window"><header></header><textarea>Keep my draft</textarea></div>`;
    document.body.append(root);
    const dispose = bindLearningUpdateNotice(root, { storage, runtime });
    return {
      root,
      dispose,
      notice: requireElement<HTMLElement>(root, '.learning-update-notice'),
      close: requireElement<HTMLButtonElement>(root, '[data-role="learning-update-dismiss"]')
    };
  };
  return { storage, runtime, mount, listeners };
}
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('upgrade tutorial invitation', () => {
  it('only arms when an extension update crosses the tutorial release', async () => {
    const { storage } = setup();
    let listener: RuntimeInstallListener | undefined;
    const runtime = {
      onInstalled: (callback: RuntimeInstallListener) => {
        listener = callback;
        return () => {};
      },
      getManifest: () => ({ version: '0.3.3' })
    };
    registerLearningUpdateNotice(runtime, storage.local);
    listener?.({ reason: 'install' });
    listener?.({ reason: 'chrome_update', previousVersion: '0.3.2' });
    listener?.({ reason: 'update', previousVersion: '0.3.3' });
    expect(await storage.local.get(AVAILABLE)).toBeUndefined();
    await storage.local.set(DISMISSED, true);
    listener?.({ reason: 'update', previousVersion: '0.3.2' });
    expect(await storage.local.get(AVAILABLE)).toBe(true);
    expect(await storage.local.get(DISMISSED)).toBe(true);
    expect(crossesLearningUpdate('0.3.2', '0.3.4')).toBe(true);
    expect(crossesLearningUpdate('0.3.3', '0.3.4')).toBe(false);
    expect(crossesLearningUpdate('0.3.1', '0.3.2')).toBe(false);
    expect(crossesLearningUpdate(undefined, '0.3.3')).toBe(false);
    expect(crossesLearningUpdate('invalid', '0.3.3')).toBe(false);
  });

  it('leaves new installs quiet and does not alter capture drafts or focus', async () => {
    const { mount } = setup();
    const { root, notice, dispose } = mount();
    const input = requireElement<HTMLTextAreaElement>(root, 'textarea');
    input.focus();
    await flush();
    expect(notice.hidden).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('Keep my draft');
    dispose();
  });

  it('shares dismissal between clipper, reader, video and subsequent mounts', async () => {
    const { storage, mount } = setup();
    await storage.local.set(AVAILABLE, true);
    const panels = ['clipper', 'reader', 'video'].map(mount);
    await flush();
    panels.forEach(({ notice }) => expect(notice.hidden).toBe(false));
    const parent = vi.fn();
    const first = panels[0];
    if (!first) throw new Error('Missing clipper fixture');
    first.root.addEventListener('click', parent);
    first.close.click();
    await flush();
    await flush();
    expect(parent).not.toHaveBeenCalled();
    panels.forEach(({ notice }) => expect(notice.hidden).toBe(true));
    expect(requireElement<HTMLElement>(first.root, '.learning-update-reminder').hidden).toBe(false);
    expect(requireElement<HTMLAnchorElement>(first.root, '.learning-update-reminder a').href).toBe(
      'chrome-extension://test/options/index.html'
    );
    for (const other of panels.slice(1))
      expect(requireElement<HTMLElement>(other.root, '.learning-update-reminder').hidden).toBe(
        true
      );
    panels.forEach(({ dispose }) => dispose());
    const reopened = mount();
    await flush();
    expect(reopened.notice.hidden).toBe(true);
    reopened.dispose();
    expect(await storage.local.get('learningProgress.v1')).toBeUndefined();
  });

  it('links to the real teaching page in a new tab and acknowledges without cancelling navigation', async () => {
    const { storage, mount } = setup();
    await storage.local.set(AVAILABLE, true);
    const panel = mount();
    await flush();
    const link = requireElement<HTMLAnchorElement>(panel.root, 'a');
    expect(link.href).toBe('chrome-extension://test/onboarding/index.html');
    expect(link.target).toBe('_blank');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.addEventListener('click', (e) => {
      expect(e.defaultPrevented).toBe(false);
      e.preventDefault();
    });
    link.dispatchEvent(event);
    await flush();
    await flush();
    expect(await storage.local.get(DISMISSED)).toBe(true);
    expect(requireElement<HTMLElement>(panel.root, '.learning-update-reminder').hidden).toBe(true);
    panel.dispose();
  });

  it('does not resurrect a dismissed notice from a stale initial read', async () => {
    const { storage, mount } = setup();
    let finish: ((value: Record<string, boolean | undefined>) => void) | undefined;
    vi.spyOn(storage.local, 'getMany').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const panel = mount();
    await storage.local.set(DISMISSED, true);
    finish?.({ [AVAILABLE]: true });
    await flush();
    expect(panel.notice.hidden).toBe(true);
    panel.dispose();
  });

  it('cleans subscriptions and ignores reads after the panel is removed', async () => {
    const { storage, mount, listeners } = setup();
    await storage.local.set(AVAILABLE, true);
    const panel = mount();
    panel.dispose();
    await flush();
    expect(panel.root.querySelector('.learning-update-notice')).toBeNull();
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
    expect(panel.root.hasAttribute('data-learning-update')).toBe(false);
  });

  it('keeps the panel usable and allows retry if acknowledgement cannot be stored', async () => {
    const { storage, mount } = setup();
    await storage.local.set(AVAILABLE, true);
    const panel = mount();
    await flush();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(storage.local, 'set').mockRejectedValueOnce(new Error('storage unavailable'));
    panel.close.click();
    await flush();
    await flush();
    expect(panel.notice.hidden).toBe(false);
    expect(requireElement<HTMLElement>(panel.root, '.learning-update-error').hidden).toBe(false);
    expect(panel.close.disabled).toBe(false);
    panel.close.click();
    await flush();
    await flush();
    expect(panel.notice.hidden).toBe(true);
    panel.dispose();
  });
});
