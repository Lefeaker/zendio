/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../../src/shared/config';
import { createMemoryStorageArea } from '../../../src/platform/preview/memoryStorage';
import { createPracticeView } from '../../../src/onboarding/practiceView';
import {
  matchesPracticeSource,
  mountPracticeCoach,
  practiceSelectionHint
} from '../../../src/onboarding/practiceCoach';
import { LEARNING_PROGRESS_KEY } from '../../../src/shared/learningProgress';
import type { IOptionsRepository } from '../../../src/shared/repositories/IOptionsRepository';
import en from '../../../src/i18n/generated/locales/en.generated';
const messages = en.runtime;

function rig() {
  const storage = createMemoryStorageArea();
  let changed = () => {};
  const stop = vi.fn();
  storage.watchKey = (_key, callback) => {
    changed = () => callback(undefined, {});
    return stop;
  };
  const options: IOptionsRepository = {
    get: vi.fn().mockResolvedValue(DEFAULT_OPTIONS),
    patch: vi.fn(),
    replace: vi.fn(),
    onChange: vi.fn(() => stop)
  };
  const root = document.createElement('main');
  document.body.append(root);
  const view = createPracticeView(root, messages, {
    enable: vi.fn(),
    exit: vi.fn(),
    next: vi.fn(),
    locate: vi.fn()
  });
  return { storage, options, view, root, changed: () => changed(), stop };
}

describe('guided practice', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });
  it('uses the configured selection trigger without changing settings', () => {
    const config = DEFAULT_OPTIONS.fragmentClipper;
    expect(practiceSelectionHint(config, messages)).toContain('Shift');
    expect(
      practiceSelectionHint({ ...config, selectionModifierKeys: ['ctrl', 'alt'] }, messages)
    ).toContain('Ctrl + Alt');
    expect(practiceSelectionHint({ ...config, selectionTriggerMode: 'direct' }, messages)).toBe(
      messages.practiceSelectDirect
    );
    expect(practiceSelectionHint({ ...config, selectionTriggerMode: 'disabled' }, messages)).toBe(
      messages.practiceDisabled
    );
  });
  it('matches only this practice run, allowing text-fragment hashes', () => {
    const url = 'chrome-extension://example/onboarding/practice.html?run=a';
    expect(matchesPracticeSource(url + '#:~:text=Hello', url)).toBe(true);
    expect(matchesPracticeSource(url.replace('run=a', 'run=b'), url)).toBe(false);
    expect(matchesPracticeSource(undefined, url)).toBe(false);
    expect(matchesPracticeSource('invalid', url)).toBe(false);
  });
  it('ignores unrelated saves, waits for actual completion and releases observers on exit', async () => {
    const r = rig();
    const coach = await mountPracticeCoach({ ...r, messages, exit: vi.fn() });
    const receipt = {
      operationId: 'op_practice',
      filePath: 'note.md',
      savedAt: 3,
      destination: 'downloads',
      course: 'fragment'
    };
    const save = async (state: unknown) => {
      await r.storage.set(LEARNING_PROGRESS_KEY, state);
      r.changed();
    };
    await save({
      version: 1,
      completed: {},
      pending: [],
      latest: { ...receipt, sourceUrl: 'https://elsewhere.test/' }
    });
    await vi.waitFor(() => expect(document.querySelector('.practice-coach-hint')).not.toBeNull());
    expect(coach.getReceipt()).toBeUndefined();
    const own = { ...receipt, sourceUrl: location.href };
    await save({
      version: 1,
      completed: {},
      pending: [{ receipt: own, courses: ['fragment'], downloadIds: [2], failed: true }]
    });
    await vi.waitFor(() => expect(r.root.textContent).toContain(messages.practiceRetry));
    expect(coach.getReceipt()).toBeUndefined();
    await save({ version: 1, completed: { fragment: own }, pending: [], latest: own });
    await vi.waitFor(() =>
      expect(r.root.querySelector('#practiceResult')?.hasAttribute('hidden')).toBe(false)
    );
    expect(coach.getReceipt()?.sourceUrl).toBe(location.href);
    const mutation = vi.fn();
    const observer = new MutationObserver(mutation);
    observer.observe(r.root, { subtree: true, attributes: true, childList: true });
    window.dispatchEvent(new Event('resize'));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(mutation).not.toHaveBeenCalled();
    observer.disconnect();
    coach.dispose();
    expect(document.querySelector('#practiceCoach')).toBeNull();
    expect(r.stop).toHaveBeenCalledTimes(2);
    expect(r.options.patch).not.toHaveBeenCalled();
  });
  it('returns to selection when the real popup is cancelled, without recording completion', async () => {
    const r = rig();
    const coach = await mountPracticeCoach({ ...r, messages, exit: vi.fn() });
    const popup = document.createElement('div');
    popup.id = 'obsidian-clipper-dialog';
    const shadow = popup.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<button data-action-id="reader">Read</button><button data-action-id="clip">Clip</button><div class="export-destination-option is-selected" data-destination-id="downloads"></div><a class="export-destination-setup-link"></a>';
    document.body.append(popup);
    await vi.waitFor(() => expect(shadow.querySelectorAll('.practice-coach-hint')).toHaveLength(2));
    expect(shadow.textContent).toContain(messages.practiceNoVault);
    popup.remove();
    await vi.waitFor(() => expect(r.root.textContent).toContain(messages.practiceSelectTitle));
    expect(coach.getReceipt()).toBeUndefined();
    expect(await r.storage.get(LEARNING_PROGRESS_KEY)).toBeUndefined();
    coach.dispose();
  });
});
