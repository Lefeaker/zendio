/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import type { MountedProductionStitchShell } from '@options/app/productionStitchShell';
import type { OptionsController } from '@options/app/optionsController';
import type { Language } from '@i18n';
import { e2ePlatformHarness } from './setup';

function createController(): OptionsController {
  return {
    scheduleAutoSave: vi.fn(),
    dispose: vi.fn(),
    loadInitialState: vi.fn(),
    loadRaw: vi.fn(),
    applyToForm: vi.fn(),
    saveSnapshot: vi.fn(),
    saveRaw: vi.fn(),
    applyImportedConfig: vi.fn(),
    readForm: vi.fn(),
    cancelAutoSave: vi.fn(),
    getSnapshot: vi.fn(),
    setSnapshot: vi.fn()
  } as unknown as OptionsController;
}

function findLanguageSelect(): HTMLSelectElement {
  const select = Array.from(document.querySelectorAll<HTMLSelectElement>('select')).find(
    (candidate) =>
      Array.from(candidate.options).some((option) => option.value === 'en') &&
      Array.from(candidate.options).some((option) => option.value === 'zh-CN')
  );
  if (!select) {
    throw new Error('production language select missing');
  }
  return select;
}

async function flushAsyncLanguageChange(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('options language switching e2e', () => {
  let mounted: MountedProductionStitchShell | null = null;

  beforeEach(async () => {
    e2ePlatformHarness.reset();
    e2ePlatformHarness.configure();
    await e2ePlatformHarness.storage.sync.set('language', 'zh-CN');
    document.body.innerHTML = '<div id="optionsShellRoot"></div>';
  });

  afterEach(() => {
    mounted?.cleanup();
    mounted = null;
    document.body.innerHTML = '';
    e2ePlatformHarness.reset();
  });

  it('switches language through the production Stitch shell and persists via the active callback', async () => {
    const languageChanges: Language[] = [];
    mounted = mountProductionStitchShell({
      controller: createController(),
      initialOptions: null,
      messages: null,
      language: 'zh-CN',
      storage: e2ePlatformHarness.storage,
      changeLanguage: async (language) => {
        languageChanges.push(language);
        await e2ePlatformHarness.storage.sync.set('language', language);
        return { messages: null, language };
      }
    });

    expect(document.querySelector('[data-nav-panel="overview"]')?.textContent).toContain('总览');

    const select = findLanguageSelect();
    expect(select.value).toBe('zh-CN');

    select.value = 'en';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncLanguageChange();

    expect(languageChanges).toEqual(['en']);
    await expect(e2ePlatformHarness.storage.sync.get<string>('language')).resolves.toBe('en');
    expect(findLanguageSelect().value).toBe('en');
    expect(document.querySelector('[data-nav-panel="overview"]')?.textContent).toContain(
      'Overview'
    );
  });
});
