/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RELEASE_LANGUAGE_ORDER } from '@i18n/catalog/languages';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import type { MountedProductionStitchShell } from '@options/app/productionStitchShell';
import type { OptionsController } from '@options/app/optionsController';
import { getMessagesForLanguage, type Language } from '@i18n';
import { schemaShellMessagesEnglish } from '@i18n/generated/schemaMessages.generated';
import { e2ePlatformHarness } from './setup';
import { getLanguageSelectValues } from '../utils/optionsI18nTextAssertions';

async function installProductionStitchTestAssets(): Promise<void> {
  const { getFooterMeta, getFooterView, getSettingsView, previewContent } =
    await import('@options/app/productionStitchAssets');
  (
    globalThis as typeof globalThis & {
      __AIIINOB_TEST_STITCH_ASSETS__?: {
        previewContent: typeof previewContent;
        getFooterMeta: typeof getFooterMeta;
        getFooterView: typeof getFooterView;
        getSettingsView: typeof getSettingsView;
      };
    }
  ).__AIIINOB_TEST_STITCH_ASSETS__ = {
    previewContent,
    getFooterMeta,
    getFooterView,
    getSettingsView
  };
}

const EXPECTED_LANGUAGE_VALUES = [...RELEASE_LANGUAGE_ORDER];
const POST_SWITCH_PANEL_EXPECTATIONS = [
  { panelId: 'overview', text: schemaShellMessagesEnglish.schemaOverviewTitle },
  { panelId: 'storage', text: schemaShellMessagesEnglish.schemaStorageVaultListTitle },
  {
    panelId: 'capture-sources',
    text: schemaShellMessagesEnglish.schemaCaptureSourcesAiChatGroupTitle
  },
  {
    panelId: 'capture-behavior',
    text: schemaShellMessagesEnglish.schemaCaptureBehaviorReadingGroupTitle
  },
  { panelId: 'output', text: schemaShellMessagesEnglish.schemaOutputTemplatesGroupTitle },
  { panelId: 'maintenance', text: schemaShellMessagesEnglish.schemaMaintenanceTransferGroupTitle }
] as const;

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
    (candidate) => {
      const values = Array.from(candidate.options).map((option) => option.value);
      return (
        values.length === EXPECTED_LANGUAGE_VALUES.length &&
        values.every((value, index) => value === EXPECTED_LANGUAGE_VALUES[index])
      );
    }
  );
  if (!select) {
    throw new Error('production language select missing');
  }

  const values = Array.from(select.options).map((option) => option.value);
  expect(values).toEqual(EXPECTED_LANGUAGE_VALUES);
  expect(values).not.toContain('es');
  expect(values).not.toContain('qps-ploc');
  return select;
}

async function flushAsyncLanguageChange(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function openPanel(panelId: (typeof POST_SWITCH_PANEL_EXPECTATIONS)[number]['panelId']) {
  const button = document.querySelector<HTMLButtonElement>(`[data-nav-panel="${panelId}"]`);
  if (!button) {
    throw new Error(`Missing panel button: ${panelId}`);
  }
  button.click();
  await flushAsyncLanguageChange();

  const panel = document.querySelector<HTMLElement>(`[data-panel-id="${panelId}"]`);
  if (!panel) {
    throw new Error(`Missing panel body: ${panelId}`);
  }
  return panel;
}

describe('options language switching e2e', () => {
  let mounted: MountedProductionStitchShell | null = null;

  beforeEach(async () => {
    e2ePlatformHarness.reset();
    e2ePlatformHarness.configure();
    await e2ePlatformHarness.storage.sync.set('language', 'zh-CN');
    await installProductionStitchTestAssets();
    document.body.innerHTML = '<div id="optionsShellRoot"></div>';
  });

  afterEach(() => {
    mounted?.cleanup();
    mounted = null;
    delete (globalThis as typeof globalThis & { __AIIINOB_TEST_STITCH_ASSETS__?: unknown })
      .__AIIINOB_TEST_STITCH_ASSETS__;
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
        return {
          messages: language === 'en' ? await getMessagesForLanguage(language) : null,
          language
        };
      }
    });

    await expect(e2ePlatformHarness.storage.sync.get<string>('language')).resolves.toBe('zh-CN');
    expect(getLanguageSelectValues(document)).toEqual(EXPECTED_LANGUAGE_VALUES);

    const select = findLanguageSelect();
    expect(select.value).toBe('zh-CN');

    select.value = 'en';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncLanguageChange();

    expect(languageChanges).toEqual(['en']);
    await expect(e2ePlatformHarness.storage.sync.get<string>('language')).resolves.toBe('en');
    expect(findLanguageSelect().value).toBe('en');
    expect(getLanguageSelectValues(document)).toEqual(EXPECTED_LANGUAGE_VALUES);

    for (const { panelId, text } of POST_SWITCH_PANEL_EXPECTATIONS) {
      const panel = await openPanel(panelId);
      expect(panel.textContent).toContain(text);
    }
  });
});
