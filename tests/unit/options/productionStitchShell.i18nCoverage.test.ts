/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMessagesForLanguage, type Messages } from '@i18n';
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

function createSchemaContextFromAppData(appData: typeof previewContent, messages: Messages | null) {
  const draft = createCompleteOptions(SURFACE_INITIAL_OPTIONS);
  const state = applyOptionsToState(createInitialStitchState(appData), draft, appData);
  state.previewLanguage = 'en';

  return createProductionStitchSchemaContext({
    appData,
    previewContent,
    language: 'en',
    messages,
    state
  });
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

  it('keeps P03 resource views catalog-backed when messages is null', () => {
    const poisonedAppData = structuredClone(previewContent);
    poisonedAppData.resources.onboarding.hero.title = 'RAW ONBOARDING TITLE SENTINEL';
    poisonedAppData.resources.onboarding.hero.description = 'RAW ONBOARDING DESCRIPTION SENTINEL';
    poisonedAppData.resources.onboarding.steps[0] = {
      ...poisonedAppData.resources.onboarding.steps[0],
      title: 'RAW ONBOARDING STEP TITLE SENTINEL',
      description: 'RAW ONBOARDING STEP DESCRIPTION SENTINEL',
      bullets: ['RAW ONBOARDING BULLET SENTINEL']
    };
    poisonedAppData.resources.pluginSetup.hero.pills[0] = 'RAW PLUGIN PILL SENTINEL';
    poisonedAppData.resources.pluginSetup.ports[0] = [
      'RAW PLUGIN FIELD SENTINEL',
      'RAW PLUGIN VALUE SENTINEL'
    ];
    poisonedAppData.resources.pluginSetup.steps[0] = {
      ...poisonedAppData.resources.pluginSetup.steps[0],
      title: 'RAW PLUGIN STEP TITLE SENTINEL',
      body: 'RAW PLUGIN STEP BODY SENTINEL'
    };
    poisonedAppData.resources.pluginSetup.checks[0] = 'RAW PLUGIN CHECK SENTINEL';
    poisonedAppData.resources.support.channels[0] = {
      ...poisonedAppData.resources.support.channels[0],
      title: 'RAW SUPPORT TITLE SENTINEL',
      subtitle: 'RAW SUPPORT SUBTITLE SENTINEL'
    };
    poisonedAppData.resources.suggestions.channels[0] = {
      ...poisonedAppData.resources.suggestions.channels[0],
      title: 'RAW SUGGESTION TITLE SENTINEL',
      subtitle: 'RAW SUGGESTION SUBTITLE SENTINEL'
    };
    poisonedAppData.resources.contact.entries[0] = {
      ...poisonedAppData.resources.contact.entries[0],
      title: 'RAW CONTACT TITLE SENTINEL',
      subtitle: 'RAW CONTACT SUBTITLE SENTINEL'
    };
    poisonedAppData.resources.changelog.hero.title = 'RAW CHANGELOG TITLE SENTINEL';
    poisonedAppData.resources.changelog.hero.description = 'RAW CHANGELOG DESCRIPTION SENTINEL';
    poisonedAppData.resources.changelog.entries[0] = {
      ...poisonedAppData.resources.changelog.entries[0],
      bullets: ['RAW CHANGELOG BULLET SENTINEL']
    };

    const onboarding = renderResourceModal('onboarding', poisonedAppData, null);
    expect(onboarding.textContent).toContain(
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaResourceOnboardingTitle
    );
    expect(onboarding.textContent).toContain(DEFAULT_PRODUCTION_ENGLISH_MESSAGES.step1Title);
    expect(onboarding.textContent).not.toContain('RAW ONBOARDING TITLE SENTINEL');
    expect(onboarding.textContent).not.toContain('RAW ONBOARDING DESCRIPTION SENTINEL');
    expect(onboarding.textContent).not.toContain('RAW ONBOARDING STEP TITLE SENTINEL');
    expect(onboarding.textContent).not.toContain('RAW ONBOARDING STEP DESCRIPTION SENTINEL');
    expect(onboarding.textContent).not.toContain('RAW ONBOARDING BULLET SENTINEL');
    onboarding.remove();

    const pluginSetup = renderResourceModal('plugin-setup', poisonedAppData, null);
    expect(pluginSetup.textContent).toContain(
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaResourcePluginSetupTitle
    );
    expect(pluginSetup.textContent).toContain(
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaResourcePluginSetupStep1
    );
    expect(pluginSetup.textContent).toContain(
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaResourcePluginSetupChecklist1
    );
    expect(pluginSetup.textContent).not.toContain('RAW PLUGIN PILL SENTINEL');
    expect(pluginSetup.textContent).not.toContain('RAW PLUGIN FIELD SENTINEL');
    expect(pluginSetup.textContent).not.toContain('RAW PLUGIN VALUE SENTINEL');
    expect(pluginSetup.textContent).not.toContain('RAW PLUGIN STEP TITLE SENTINEL');
    expect(pluginSetup.textContent).not.toContain('RAW PLUGIN STEP BODY SENTINEL');
    expect(pluginSetup.textContent).not.toContain('RAW PLUGIN CHECK SENTINEL');
    pluginSetup.remove();

    const support = renderResourceModal('support', poisonedAppData, null);
    expect(support.textContent).toContain(
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaResourceSupportTitle
    );
    expect(support.textContent).toContain(
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaResourceSupportKoFiDescription
    );
    expect(support.textContent).not.toContain('RAW SUPPORT TITLE SENTINEL');
    expect(support.textContent).not.toContain('RAW SUPPORT SUBTITLE SENTINEL');
    support.remove();

    const suggestions = renderResourceModal('suggestions', poisonedAppData, null);
    expect(suggestions.textContent).toContain(
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaResourceSuggestionsTitle
    );
    expect(suggestions.textContent).toContain(
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaResourceSuggestionsGithubDescription
    );
    expect(suggestions.textContent).not.toContain('RAW SUGGESTION TITLE SENTINEL');
    expect(suggestions.textContent).not.toContain('RAW SUGGESTION SUBTITLE SENTINEL');
    suggestions.remove();

    const contact = renderResourceModal('contact', poisonedAppData, null);
    expect(contact.textContent).toContain(
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaResourceContactTitle
    );
    expect(contact.textContent).toContain(
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaResourceContactRedditDescription
    );
    expect(contact.textContent).not.toContain('RAW CONTACT TITLE SENTINEL');
    expect(contact.textContent).not.toContain('RAW CONTACT SUBTITLE SENTINEL');
    contact.remove();

    const changelog = renderResourceModal('changelog', poisonedAppData, null);
    expect(changelog.textContent).toContain(
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaResourceChangelogTitle
    );
    expect(changelog.textContent).toContain(
      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaResourceChangelogV020Bullet1
    );
    expect(changelog.textContent).not.toContain('RAW CHANGELOG TITLE SENTINEL');
    expect(changelog.textContent).not.toContain('RAW CHANGELOG DESCRIPTION SENTINEL');
    expect(changelog.textContent).not.toContain('RAW CHANGELOG BULLET SENTINEL');
    changelog.remove();
  });

  it('localizes sample preview metadata through catalog keys for zh-CN', async () => {
    const zhMessages = await getMessagesForLanguage('zh-CN');
    const context = createSchemaContextFromAppData(structuredClone(previewContent), zhMessages);

    expect(context.appData.storage.routingTypeOptions[2]?.label).toBe(
      zhMessages.ruleTypeUrlPattern
    );
    expect(context.appData.storage.vaults[1]?.name).toBe(
      zhMessages.schemaPreviewSampleVaultResearch
    );
    expect(context.appData.surfaces.clipper.source.title).toBe(
      zhMessages.schemaPreviewClipperSourceArticleTitle
    );
    expect(context.appData.surfaces.clipper.destination?.label).toBe(
      zhMessages.schemaPreviewSampleVaultResearch
    );
    expect(context.appData.surfaces.clipper.destination?.options[0]?.label).toBe(
      zhMessages.schemaPreviewSampleVaultResearch
    );
    expect(context.appData.surfaces.video.captures[1]?.summary).toBe(
      zhMessages.schemaPreviewVideoCaptureTwoSummary
    );
    expect(context.appData.surfaces.taskSuccess.likeToast.detail).toBe(
      zhMessages.schemaPreviewTaskSuccessLikeToastDetail
    );
    expect(context.appData.surfaces.taskSuccess.dislikeToast.detail).toBe(
      zhMessages.schemaPreviewTaskSuccessDislikeToastDetail
    );
  });
});
