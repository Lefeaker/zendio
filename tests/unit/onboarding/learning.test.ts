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
    required<HTMLButtonElement>(r.root, '[data-learning-course="video"]').click();
    later?.click();
    expect(required<HTMLDetailsElement>(r.root, '.learning-library').open).toBe(true);
    expect(r.root.querySelector('.learning-count')?.textContent).toContain('0 / 5');
    expect(await r.dependencies.storage.local.get(LEARNING_PROGRESS_KEY)).toBeUndefined();
    dispose();
  });

  it('offers one initial practice action and three workflow destinations without repeated feature lists', async () => {
    const r = rig();
    const dispose = await mountLearningCenter(r.root, r.dependencies, r.navigation, {});
    expect(required<HTMLDetailsElement>(r.root, '.learning-library').open).toBe(false);
    expect(required<HTMLDetailsElement>(r.root, '.learning-custom-page').open).toBe(false);
    const lesson = required<HTMLElement>(r.root, '#learningLesson');
    expect(lesson.querySelectorAll(':scope > button:not([hidden])')).toHaveLength(1);
    expect(r.root.querySelectorAll('.learning-advanced button')).toHaveLength(3);
    expect(r.root.querySelector('.learning-advanced ul')).toBeNull();
    expect(Array.from(r.root.children).map((node) => node.className)).toEqual([
      'learning-intro',
      'learning-lesson',
      'learning-result',
      'learning-library',
      'learning-advanced'
    ]);
    dispose();
  });

  it('explains AI chat saving without a practice or completion requirement', async () => {
    const r = rig();
    await r.dependencies.storage.local.set('learningPreference.v1', {
      course: 'chat',
      url: '',
      deferred: []
    });
    await r.dependencies.storage.local.set(LEARNING_PROGRESS_KEY, {
      version: 1,
      completed: {
        chat: {
          operationId: 'old-chat',
          filePath: '/Downloads/chat.md',
          destination: 'downloads',
          savedAt: 1
        }
      },
      pending: []
    });
    const dispose = await mountLearningCenter(r.root, r.dependencies, r.navigation, {});
    expect(r.root.querySelector('[data-learning-course="chat"]')).toBeNull();
    expect(r.root.querySelectorAll('[data-learning-course]')).toHaveLength(5);
    expect(r.root.querySelector('.learning-chat-help')?.textContent).toContain('right-click');
    expect(r.root.querySelector('.learning-chat-help')?.textContent).toContain('Clip full page');
    expect(r.root.querySelector('.learning-chat-help button')).toBeNull();
    expect(r.root.querySelector('.learning-count')?.textContent).toContain('0 / 5');
    expect(required<HTMLButtonElement>(r.root, '#learningStartPractice').hidden).toBe(false);
    dispose();
  });

  it('reacts to persisted export results while preserving unfinished URL input', async () => {
    const r = rig();
    const dispose = await mountLearningCenter(r.root, r.dependencies, r.navigation, {});
    const input = required<HTMLInputElement>(r.root, '#learningUrl');
    input.value = 'https://example.com/unfinished';
    const custom = required<HTMLDetailsElement>(r.root, '.learning-custom-page');
    custom.open = true;
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
      expect(r.root.querySelector('.learning-count')?.textContent).toContain('1 / 5')
    );
    expect(r.root.querySelector('.learning-path')?.textContent).toBe('/Downloads/note (1).md');
    expect(r.root.querySelector('#learningUrl')).toBe(input);
    expect(input.value).toBe('https://example.com/unfinished');
    expect(custom.open).toBe(true);
    required<HTMLButtonElement>(r.root, '#learningShowResult').click();
    await vi.waitFor(() =>
      expect(r.root.querySelector('.learning-result [role="status"]')?.textContent).toContain(
        'Could not open or copy'
      )
    );
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
