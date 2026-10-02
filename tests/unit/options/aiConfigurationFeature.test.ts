/* @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAiConfiguration } from '../../../src/options/ai-configuration/feature';
import { createPreviewOptionsRepository } from '../../../src/platform/preview/optionsRepository';
import { OptionsMutationError } from '../../../src/shared/types/optionsMutationMessages';
import en from '../../../src/i18n/generated/locales/en.generated';

const text = JSON.stringify({
  format: 'zendio-ai-config',
  version: 1,
  changes: { 'readingSession.exportMode': 'full' }
});
function element<T extends Element>(root: HTMLElement, selector: string) {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error('Missing ' + selector);
  return found;
}
async function setup(beforeApply = () => Promise.resolve()) {
  const repository = createPreviewOptionsRepository();
  let current = await repository.get();
  repository.onChange((next) => {
    current = next;
  });
  const host = document.createElement('div');
  document.body.append(host);
  const feature = createAiConfiguration({
    repository,
    getCurrent: () => current,
    getMessages: () => en.runtime,
    beforeApply,
    isActive: () => true,
    browser: 'chrome'
  });
  feature.mount(host);
  const input = element<HTMLTextAreaElement>(host, '#aiConfigInput');
  input.value = text;
  input.dispatchEvent(new Event('input'));
  return {
    repository,
    host,
    feature,
    input,
    apply: element<HTMLButtonElement>(host, '#aiConfigApply')
  };
}
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('AI configuration UI transaction', () => {
  it('does not write during preview, keeps text across remount, applies and undoes through guarded patches', async () => {
    const r = await setup();
    expect((await r.repository.get()).readingSession.exportMode).toBe('highlights');
    expect(element(r.host, '#aiConfigChanges').textContent).toContain('Highlights only');
    expect(element(r.host, '#aiConfigChanges').textContent).toContain('Full article');
    const other = document.createElement('div');
    document.body.append(other);
    r.feature.mount(other);
    expect(element<HTMLTextAreaElement>(other, '#aiConfigInput')).toBe(r.input);
    expect(r.input.value).toBe(text);
    r.apply.click();
    await vi.waitFor(() =>
      expect(element(other, '#aiConfigStatus').textContent).toContain('Applied 1')
    );
    expect((await r.repository.get()).readingSession.exportMode).toBe('full');
    element<HTMLButtonElement>(other, '#aiConfigUndo').click();
    await vi.waitFor(() =>
      expect(element(other, '#aiConfigStatus').textContent).toContain('undone')
    );
    expect((await r.repository.get()).readingSession.exportMode).toBe('highlights');
  });
  it('rejects stale previews after pending autosaves flush and never replaces new values', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const r = await setup(() => gate);
    r.apply.click();
    expect(r.apply.disabled).toBe(true);
    await r.repository.patch({ path: ['readingSession', 'exportMode'], value: 'full' });
    release?.();
    await vi.waitFor(() =>
      expect(element(r.host, '#aiConfigStatus').textContent).toContain('changed after the preview')
    );
    expect((await r.repository.get()).readingSession.exportMode).toBe('full');
    expect(r.apply.disabled).toBe(true);
  });
  it('keeps failed saves reviewable, rejects undo after later edits, and exposes copy fallback', async () => {
    const r = await setup();
    const patch = vi
      .spyOn(r.repository, 'patch')
      .mockRejectedValueOnce(new OptionsMutationError('OPTIONS_STORAGE_FAILURE'));
    r.apply.click();
    await vi.waitFor(() =>
      expect(element(r.host, '#aiConfigStatus').textContent).toContain('Could not confirm')
    );
    expect((await r.repository.get()).readingSession.exportMode).toBe('highlights');
    expect(r.apply.disabled).toBe(false);
    r.apply.click();
    await vi.waitFor(() =>
      expect(element(r.host, '#aiConfigStatus').textContent).toContain('Applied 1')
    );
    await r.repository.patch({ path: ['readingSession', 'exportMode'], value: 'highlights' });
    element<HTMLButtonElement>(r.host, '#aiConfigUndo').click();
    await vi.waitFor(() =>
      expect(element(r.host, '#aiConfigStatus').textContent).toContain('changed after the preview')
    );
    expect((await r.repository.get()).readingSession.exportMode).toBe('highlights');
    expect(patch).toHaveBeenCalled();
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) }
    });
    element<HTMLButtonElement>(r.host, '#aiConfigCopy').click();
    await vi.waitFor(() => expect(element<HTMLDetailsElement>(r.host, 'details').open).toBe(true));
    expect(element<HTMLTextAreaElement>(r.host, '#aiConfigPrompt').value).toContain(
      'zendio-ai-config'
    );
  });
});
