/* @vitest-environment jsdom */
import { createMemoryStorageArea } from '../../../src/platform/preview/memoryStorage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountLearningCenter } from '../../../src/onboarding/learning';
import { LEARNING_PROGRESS_KEY } from '../../../src/shared/learningProgress';
import type { TabsService } from '../../../src/platform/interfaces/tabs';
import type { OnboardingControllerDependencies } from '../../../src/onboarding/dependencies';

const tabDefaults = {
  index: 0,
  windowId: 1,
  highlighted: false,
  active: true,
  pinned: false,
  incognito: false,
  selected: true,
  discarded: false,
  autoDiscardable: true,
  frozen: false,
  groupId: -1
};

function required<T extends Element>(root: HTMLElement, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error('Missing test element: ' + selector);
  return node;
}

function rig() {
  let changed: (() => void) | undefined;
  const local = createMemoryStorageArea();
  local.watchKey = (_key, cb) => {
    changed = () => cb(undefined, {});
    return vi.fn();
  };
  const createMock = vi.fn<TabsService['create']>().mockResolvedValue(undefined);
  const dependencies: OnboardingControllerDependencies = {
    storage: { local, sync: local },
    tabs: {
      create: createMock,
      remove: vi.fn(),
      get: vi.fn(),
      getCurrent: vi.fn(),
      query: vi.fn<TabsService['query']>().mockResolvedValue([
        { ...tabDefaults, id: 1, url: 'https://example.com/article', title: 'My article' },
        { ...tabDefaults, id: 2, url: 'chrome://extensions', title: 'Extensions' }
      ]),
      sendMessage: vi.fn(),
      onActivated: vi.fn(),
      onUpdated: vi.fn(),
      onRemoved: vi.fn()
    }
  };
  const navigation = { openVault: vi.fn(), openOptions: vi.fn(), openExternalLink: vi.fn() };
  const root = document.createElement('main');
  document.body.append(root);
  return { root, dependencies, navigation, createMock, changed: () => changed?.() };
}

describe('learning center', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });
  it('opens a real page but does not complete a lesson on open or skip', async () => {
    const r = rig();
    const dispose = await mountLearningCenter(r.root, r.dependencies, r.navigation, {});
    const select = required<HTMLSelectElement>(r.root, '#learningPage');
    expect(select.options.length).toBe(2);
    select.value = 'https://example.com/article';
    select.dispatchEvent(new Event('change'));
    required<HTMLButtonElement>(r.root, '#learningOpenPage').click();
    await vi.waitFor(() =>
      expect(r.createMock).toHaveBeenCalledWith({
        url: 'https://example.com/article',
        active: true
      })
    );
    expect(await r.dependencies.storage.local.get(LEARNING_PROGRESS_KEY)).toBeUndefined();
    const later = Array.from(r.root.querySelectorAll('button')).find(
      (button) => button.textContent === 'Try later'
    );
    later?.click();
    expect(r.root.querySelector('.learning-count')?.textContent).toContain('0 / 6');
    expect(await r.dependencies.storage.local.get(LEARNING_PROGRESS_KEY)).toBeUndefined();
    dispose();
  });

  it('reacts to persisted export results while preserving unfinished URL input', async () => {
    const r = rig();
    const dispose = await mountLearningCenter(r.root, r.dependencies, r.navigation, {});
    const input = required<HTMLInputElement>(r.root, '#learningUrl');
    input.value = 'https://example.com/unfinished';
    const receipt = {
      operationId: 'op_real',
      filePath: '/Downloads/note (1).md',
      destination: 'downloads',
      downloadId: 8,
      savedAt: 3
    };
    await r.dependencies.storage.local.set(LEARNING_PROGRESS_KEY, {
      version: 1,
      completed: { fragment: receipt },
      latest: receipt,
      pending: []
    });
    r.changed();
    await vi.waitFor(() =>
      expect(r.root.querySelector('.learning-count')?.textContent).toContain('1 / 6')
    );
    expect(r.root.querySelector('.learning-path')?.textContent).toBe('/Downloads/note (1).md');
    expect(r.root.querySelector('#learningUrl')).toBe(input);
    expect(input.value).toBe('https://example.com/unfinished');
    dispose();
  });

  it('rejects internal/store links and does not open arbitrary schemes', async () => {
    const r = rig();
    const dispose = await mountLearningCenter(r.root, r.dependencies, r.navigation, {});
    const input = required<HTMLInputElement>(r.root, '#learningUrl');
    for (const url of [
      'javascript:alert(1)',
      'chrome://settings',
      'https://chromewebstore.google.com/'
    ]) {
      input.value = url;
      required<HTMLButtonElement>(r.root, '#learningOpenPage').click();
      expect(r.createMock).not.toHaveBeenCalled();
      expect(r.root.querySelector('[role="alert"]')?.textContent).toContain('regular HTTP(S)');
    }
    dispose();
  });
});
