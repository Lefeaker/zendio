/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Messages } from '@i18n';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import {
  createProductionStitchAppData,
  createProductionStitchSchemaContext
} from '@options/app/productionStitchShellContext';
import {
  applyOptionsToState,
  createInitialStitchState
} from '@options/app/productionStitchStateMapper';
import { DEFAULT_PRODUCTION_ENGLISH_MESSAGES } from '@options/stitch/schema/i18n';
import { previewContent } from '@options/stitch/content';
import { renderPreviewView, type RendererContext } from '@options/stitch/render/renderStitchView';
import { getFooterView, getResourceView, getSettingsView } from '@options/stitch/schema/registry';
import { previewUi } from '@options/stitch/ui/components';
import { el } from '@options/stitch/ui/dom';
import { createSchemaContext as createBaseSchemaContext } from '../../utils/productionStitchAssertions';
import { expectNoChineseSettingsCopy } from '../../utils/optionsI18nTextAssertions';
import {
  asOptionsController,
  createCompleteOptions,
  createController,
  createEnglishPageMessages,
  findButton,
  flushPromises,
  queryRequired,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';

const SETTINGS_PANEL_IDS = [
  'overview',
  'storage',
  'capture-sources',
  'capture-behavior',
  'output',
  'maintenance'
];

const RESOURCE_MODAL_IDS = ['plugin-setup', 'support', 'suggestions', 'contact', 'changelog'];

type RuntimeSurfaceId = 'clipper' | 'reader' | 'video' | 'video-floating-prompt' | 'task-success';

const RUNTIME_SURFACE_IDS: RuntimeSurfaceId[] = [
  'clipper',
  'reader',
  'video',
  'video-floating-prompt',
  'task-success'
];

const SURFACE_INITIAL_OPTIONS = {
  rest: {
    vault: 'Research Vault'
  }
};

function renderRequiredElement(
  rendered: ReturnType<typeof renderPreviewView>,
  description: string
): HTMLElement {
  if (!(rendered instanceof HTMLElement)) {
    throw new Error(`Missing rendered ${description}.`);
  }
  return rendered;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getResourceLinks(messages: Messages): Array<{ label: string; resourceId: string }> {
  return [
    { label: messages.privacyPolicyLink, resourceId: 'privacy-policy' },
    { label: messages.dataUsageLink, resourceId: 'data-usage' }
  ];
}

function createEnglishSchemaContext(messages: Messages) {
  const base = createBaseSchemaContext();
  return createProductionStitchSchemaContext({
    appData: base.appData,
    state: {
      ...base.state,
      previewLanguage: 'en'
    },
    language: 'en',
    messages
  });
}

function renderOnboardingPage(messages: Messages): HTMLElement {
  const context = createEnglishSchemaContext(messages);
  const view = getResourceView('onboarding', context);
  if (!view) {
    throw new Error('Missing onboarding preview view.');
  }

  return renderRequiredElement(
    renderPreviewView(view, {
      ...context,
      el,
      ui: previewUi,
      dispatch: vi.fn()
    } satisfies RendererContext),
    'onboarding preview'
  );
}

function renderRuntimeSurface(surfaceId: RuntimeSurfaceId, messages: Messages): HTMLElement {
  mountProductionStitchShell({
    controller: asOptionsController(createController()),
    initialOptions: SURFACE_INITIAL_OPTIONS,
    messages,
    language: 'en'
  });

  queryRequired<HTMLElement>(`[data-footer-panel="${surfaceId}"]`);

  const draft = createCompleteOptions(SURFACE_INITIAL_OPTIONS);
  const appData = structuredClone(
    createProductionStitchAppData(draft, {
      maintenanceLog: previewContent.maintenanceLog
    })
  );

  const state = applyOptionsToState(createInitialStitchState(appData), draft, appData);
  state.previewLanguage = 'en';

  const context = createProductionStitchSchemaContext({
    appData,
    language: 'en',
    messages,
    state
  });

  const view = getFooterView(surfaceId, context);
  if (!view) {
    throw new Error(`Missing runtime surface view: ${surfaceId}.`);
  }

  const rendered = renderRequiredElement(
    renderPreviewView(view, {
      ...context,
      el,
      ui: previewUi,
      dispatch: vi.fn()
    } satisfies RendererContext),
    `runtime surface ${surfaceId}`
  );
  document.body.append(rendered);
  return rendered;
}

function renderSettingsPanel(
  panelId: (typeof SETTINGS_PANEL_IDS)[number],
  appData: typeof previewContent,
  messages: Messages | null
): HTMLElement {
  const draft = createCompleteOptions();
  const state = applyOptionsToState(createInitialStitchState(appData), draft, appData);
  state.previewLanguage = 'en';

  const context = createProductionStitchSchemaContext({
    appData,
    language: 'en',
    messages,
    state
  });

  const view = getSettingsView(panelId, context);
  if (!view) {
    throw new Error(`Missing settings view: ${panelId}.`);
  }

  const rendered = renderRequiredElement(
    renderPreviewView(view, {
      ...context,
      el,
      ui: previewUi,
      dispatch: vi.fn()
    } satisfies RendererContext),
    `settings panel ${panelId}`
  );
  document.body.append(rendered);
  return rendered;
}

function renderResourceModal(
  resourceId: string,
  appData: typeof previewContent,
  messages: Messages | null
): HTMLElement {
  const draft = createCompleteOptions();
  const state = applyOptionsToState(createInitialStitchState(appData), draft, appData);
  state.previewLanguage = 'en';

  const context = createProductionStitchSchemaContext({
    appData,
    language: 'en',
    messages,
    state
  });

  const view = getResourceView(resourceId, context);
  if (!view) {
    throw new Error(`Missing resource view: ${resourceId}.`);
  }

  const rendered = renderRequiredElement(
    renderPreviewView(view, {
      ...context,
      el,
      ui: previewUi,
      dispatch: vi.fn()
    } satisfies RendererContext),
    `resource modal ${resourceId}`
  );
  document.body.append(rendered);
  return rendered;
}

function renderRuntimeSurfaceFromAppData(
  surfaceId: RuntimeSurfaceId,
  appData: typeof previewContent,
  messages: Messages | null
): HTMLElement {
  const draft = createCompleteOptions(SURFACE_INITIAL_OPTIONS);
  const state = applyOptionsToState(createInitialStitchState(appData), draft, appData);
  state.previewLanguage = 'en';

  const context = createProductionStitchSchemaContext({
    appData,
    language: 'en',
    messages,
    state
  });

  const view = getFooterView(surfaceId, context);
  if (!view) {
    throw new Error(`Missing runtime surface view: ${surfaceId}.`);
  }

  const rendered = renderRequiredElement(
    renderPreviewView(view, {
      ...context,
      el,
      ui: previewUi,
      dispatch: vi.fn()
    } satisfies RendererContext),
    `runtime surface ${surfaceId}`
  );
  document.body.append(rendered);
  return rendered;
}

describe('mountProductionStitchShell English residual coverage', () => {
  beforeEach(setupProductionStitchShellTest);

  it('keeps all six settings panels free of residual Chinese outside language options in English mode', async () => {
    const messages = await createEnglishPageMessages();

    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages,
      language: 'en'
    });

    const failures: string[] = [];

    for (const panelId of SETTINGS_PANEL_IDS) {
      queryRequired<HTMLButtonElement>(`[data-nav-panel="${panelId}"]`).click();
      await flushPromises();
      try {
        expectNoChineseSettingsCopy(queryRequired<HTMLElement>(`[data-panel-id="${panelId}"]`));
      } catch (error) {
        failures.push(`Panel ${panelId}: ${getErrorMessage(error)}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(failures.join('\n'));
    }
  });

  it('keeps production settings panels free of Chinese when selected catalog keys are missing', async () => {
    const baseMessages = await createEnglishPageMessages();
    const messages: Messages = {
      ...baseMessages,
      schemaOverviewUsageGroupTitle: '',
      clearAllAnalyticsData: '',
      schemaStorageTestConnectionButton: '',
      schemaCaptureBehaviorModifierConflictBrowser: '',
      readingExportModeLabel: ''
    };

    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages,
      language: 'en'
    });

    for (const panelId of ['overview', 'storage', 'capture-behavior'] as const) {
      queryRequired<HTMLButtonElement>(`[data-nav-panel="${panelId}"]`).click();
      await flushPromises();
      expectNoChineseSettingsCopy(queryRequired<HTMLElement>(`[data-panel-id="${panelId}"]`));
    }
  });

  it('keeps the onboarding page free of residual Chinese in English mode', async () => {
    expectNoChineseSettingsCopy(renderOnboardingPage(await createEnglishPageMessages()));
  });

  it('keeps every resource modal free of residual Chinese in English mode', async () => {
    const messages = await createEnglishPageMessages();

    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: null,
      messages,
      language: 'en'
    });

    const failures: string[] = [];

    for (const resourceId of RESOURCE_MODAL_IDS) {
      queryRequired<HTMLButtonElement>(`[data-footer-panel="${resourceId}"]`).click();
      await flushPromises();

      const modal = queryRequired<HTMLElement>('.resource-modal-overlay');
      try {
        expectNoChineseSettingsCopy(modal);
      } catch (error) {
        failures.push(`Resource ${resourceId}: ${getErrorMessage(error)}`);
      }

      modal.click();
      await flushPromises();
    }

    for (const { label, resourceId } of getResourceLinks(messages)) {
      findButton(label).click();
      await flushPromises();

      const modal = queryRequired<HTMLElement>('.resource-modal-overlay');
      try {
        expectNoChineseSettingsCopy(modal);
      } catch (error) {
        failures.push(`Resource ${resourceId}: ${getErrorMessage(error)}`);
      }

      modal.click();
      await flushPromises();
    }

    if (failures.length > 0) {
      throw new Error(failures.join('\n'));
    }
  });

  it('keeps every runtime surface preview free of residual Chinese in English mode', async () => {
    const messages = await createEnglishPageMessages();
    const failures: string[] = [];

    for (const surfaceId of RUNTIME_SURFACE_IDS) {
      let surface: HTMLElement | null = null;
      try {
        surface = renderRuntimeSurface(surfaceId, messages);
        expectNoChineseSettingsCopy(surface);
      } catch (error) {
        failures.push(`Surface ${surfaceId}: ${getErrorMessage(error)}`);
      } finally {
        surface?.remove();
      }
    }

    if (failures.length > 0) {
      throw new Error(failures.join('\n'));
    }
  });

  it('keeps production overview, privacy resource, and reader surface catalog-backed when messages is null', () => {
    const poisonedAppData = structuredClone(previewContent);
    poisonedAppData.overview.hero.description = 'RAW OVERVIEW SENTINEL';
    poisonedAppData.languageOptions[0] = {
      ...poisonedAppData.languageOptions[0],
      label: 'RAW LANGUAGE SENTINEL'
    };
    poisonedAppData.privacyExcluded[0] = 'RAW PRIVACY SENTINEL';
    poisonedAppData.resources.privacyPolicy.hero.description = 'RAW RESOURCE SENTINEL';
    poisonedAppData.resources.privacyPolicy.sections[0].body = 'RAW RESOURCE BODY SENTINEL';
    poisonedAppData.surfaces.clipper.selectedText = 'RAW RUNTIME SENTINEL';

    const overview = renderSettingsPanel('overview', poisonedAppData, null);
    expect(overview.textContent).toContain(
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaOverviewHeroDescription
    );
    expect(overview.textContent).toContain(
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.errorReportingNotCollectedContent
    );
    expect(overview.textContent).toContain(
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaOverviewLanguageOptionEn
    );
    expect(overview.textContent).not.toContain('RAW OVERVIEW SENTINEL');
    expect(overview.textContent).not.toContain('RAW LANGUAGE SENTINEL');
    expect(overview.textContent).not.toContain('RAW PRIVACY SENTINEL');
    overview.remove();

    const privacyPolicy = renderResourceModal('privacy-policy', poisonedAppData, null);
    expect(privacyPolicy.textContent).toContain(
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaResourcePrivacyPolicyDescription
    );
    expect(privacyPolicy.textContent).toContain(
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.errorReportingNotCollectedContent
    );
    expect(privacyPolicy.textContent).not.toContain('RAW RESOURCE SENTINEL');
    expect(privacyPolicy.textContent).not.toContain('RAW RESOURCE BODY SENTINEL');
    privacyPolicy.remove();

    const clipper = renderRuntimeSurfaceFromAppData('clipper', poisonedAppData, null);
    expect(clipper.textContent).toContain(
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeClipperSelectedText
    );
    expect(clipper.textContent).not.toContain('RAW RUNTIME SENTINEL');
    clipper.remove();
  });
});
