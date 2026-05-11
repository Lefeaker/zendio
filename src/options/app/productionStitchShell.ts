import { createActionRuntime } from '@options/schema-runtime/actionRuntime';
import { createSchemaRenderer } from '@options/schema-runtime/renderer';
import { mergeOptions } from '@shared/config/optionsMerger';
import { DEFAULT_DOMAIN_MAPPINGS } from '@shared/constants';
import { DI_TOKENS } from '@shared/di/tokens';
import { resolveRepository } from '@shared/di/serviceRegistry';
import type { StorageService } from '@platform/interfaces/storage';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { Language, Messages } from '@i18n';
import { parseClassifierTaxonomy } from '@options/services/validation';
import { clear, el } from '@options/stitch/ui/dom';
import { previewUi } from '@options/stitch/ui/components';
import { previewContent } from '@options/stitch/content';
import { resolveTaxonomy } from '@shared/config/taxonomyMigration';
import {
  buildAppShell,
  buildPanelStack,
  buildScrollSection,
  buildSidebar
} from '@options/stitch/render/shellBuilders';
import { getFooterMeta, getFooterView, getSettingsView } from '@options/stitch/schema/registry';
import { renderPreviewView } from '@options/stitch/render/renderStitchView';
import type {
  PreviewContent,
  PreviewStoreState,
  SchemaContext,
  ViewSchema
} from '@options/stitch/types';
import type { OptionsController } from './optionsController';
import {
  HIGHLIGHT_THEME_CLASSES,
  RUNTIME_SURFACE_RESOURCE_IDS,
  applyOptionsToState,
  createInitialStitchState,
  createPresetYamlConfig,
  createProductionContent,
  createThemeMediaQuery,
  isHighlightTheme,
  persistTheme,
  resolveExtensionVersionLabel,
  resolveReadingPathMode,
  resolveStoredTheme,
  resolveThemePreference,
  toTemplateValues
} from './productionStitchStateMapper';
import { createProductionStitchActions } from './productionStitchActions';
import { createProductionStitchWidgetHost } from './productionStitchWidgetHost';
import { createProductionStitchStorageController } from './productionStitchStorageController';
import { createProductionStitchPersistence } from './productionStitchPersistence';
import {
  captureOptionsScroll,
  installButtonPressScrollGuard,
  restoreOptionsScrollSoon,
  setScrollTopImmediately,
  shouldPreserveButtonActionScroll
} from './productionStitchScrollGuard';
import { localizeStitchContent } from './productionStitchLocalization';

export interface MountedProductionStitchShell {
  cleanup(): void;
  collectDraft(): CompleteOptions;
  refreshOptions(options?: StoredOptions | CompleteOptions | null): void;
  setMessages(messages: Messages | null, language: Language): void;
}

export interface ProductionStitchShellDependencies {
  root?: HTMLElement | null;
  controller: OptionsController;
  initialOptions?: StoredOptions | CompleteOptions | null;
  messages?: Messages | null;
  language: Language;
  changeLanguage?: (
    language: Language
  ) => Promise<{ messages: Messages | null; language: Language }>;
  optionsRepository?: Pick<IOptionsRepository, 'get' | 'set' | 'onChange'>;
  messagingRepository?: Pick<IMessagingRepository, 'send' | 'onMessage'>;
  storage?: StorageService;
  now?: () => number;
}

function createLocalOptionsRepositoryFallback(): IOptionsRepository {
  let snapshot = mergeOptions(null) as CompleteOptions;
  const listeners = new Set<(options: CompleteOptions) => void>();
  return {
    get() {
      return Promise.resolve(snapshot);
    },
    set(options) {
      snapshot = mergeOptions({ ...snapshot, ...options }) as CompleteOptions;
      listeners.forEach((listener) => listener(snapshot));
      return Promise.resolve();
    },
    onChange(callback) {
      listeners.add(callback);
      callback(snapshot);
      return () => {
        listeners.delete(callback);
      };
    }
  };
}

function createLocalMessagingRepositoryFallback(): IMessagingRepository {
  return {
    send<T>() {
      return Promise.resolve(undefined as T);
    },
    onMessage() {
      return () => {};
    }
  };
}

function resolveOptionsRepositoryFallback(): IOptionsRepository {
  try {
    return resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
  } catch {
    return createLocalOptionsRepositoryFallback();
  }
}

function resolveMessagingRepositoryFallback(): IMessagingRepository {
  try {
    return resolveRepository<IMessagingRepository>(DI_TOKENS.IMessagingRepository);
  } catch {
    return createLocalMessagingRepositoryFallback();
  }
}

function resolveRoot(root?: HTMLElement | null): HTMLElement {
  const target = root ?? document.getElementById('optionsShellRoot');
  if (!target) {
    throw new Error('[Options] Missing #optionsShellRoot for Stitch shell.');
  }
  return target;
}

export function mountProductionStitchShell({
  root,
  controller,
  initialOptions = null,
  language,
  messages = null,
  changeLanguage,
  optionsRepository,
  messagingRepository,
  storage,
  now
}: ProductionStitchShellDependencies): MountedProductionStitchShell {
  const mountRoot = resolveRoot(root);
  const buttonPressScrollGuard = installButtonPressScrollGuard(mountRoot);
  const resolvedOptionsRepository = optionsRepository ?? resolveOptionsRepositoryFallback();
  const resolvedMessagingRepository = messagingRepository ?? resolveMessagingRepositoryFallback();
  let draft = mergeOptions(initialOptions) as CompleteOptions;
  function resolveDefaultDomainMappingRows(): Array<[string, string]> {
    const entries = Object.entries(draft.domainMappings);
    if (entries.length) {
      return entries;
    }
    draft.domainMappings = { ...DEFAULT_DOMAIN_MAPPINGS };
    return Object.entries(draft.domainMappings);
  }

  let currentLanguage = language;
  let currentMessages = messages;
  let connectionNotice: PreviewContent['storage']['connectionNotice'] | undefined;
  let maintenanceLog = previewContent.maintenanceLog;
  let domainMappingRows: Array<[string, string]> = resolveDefaultDomainMappingRows();
  let appData = createProductionContent(previewContent, draft, { maintenanceLog });
  let state = applyOptionsToState(createInitialStitchState(appData), draft, appData);
  state.interfaceThemePreference = resolveThemePreference(draft);
  state.previewTheme = resolveStoredTheme(draft);
  state.previewLanguage = currentLanguage;
  state.previewTheme = persistTheme(state.interfaceThemePreference);
  const themeMediaQuery = createThemeMediaQuery();

  function mutate(
    mutator: (draftState: PreviewStoreState) => void,
    options: { silent?: boolean } = {}
  ): void {
    mutator(state);
    if (!options.silent) {
      render();
    }
  }

  function getLocalizedContent(): PreviewContent {
    const localizedAppData = localizeStitchContent(appData, currentLanguage);
    return {
      ...localizedAppData,
      brand: {
        ...localizedAppData.brand,
        title: 'All in Ob',
        subtitle: resolveExtensionVersionLabel(),
        logo: '../icons/bannerlogo-128.png'
      }
    };
  }

  function createSchemaContext(): SchemaContext {
    return {
      appData: getLocalizedContent(),
      state
    };
  }

  function refreshAppData(): void {
    appData = createProductionContent(previewContent, draft, {
      ...(connectionNotice ? { connectionNotice } : {}),
      maintenanceLog
    });
    state.maintenanceLog = maintenanceLog;
  }

  function syncDomainEntries(entries: Array<[string, string]>): void {
    domainMappingRows = entries.map(([domain, alias]) => [domain, alias]);
    draft.domainMappings = entries.reduce<Record<string, string>>((next, [domain, alias]) => {
      const key = domain.trim();
      if (key) {
        next[key] = alias.trim();
      }
      return next;
    }, {});
  }

  function currentDomainEntries(): Array<[string, string]> {
    return domainMappingRows.length
      ? domainMappingRows.map(([domain, alias]) => [domain, alias])
      : [['', '']];
  }

  function eventButton(value: unknown): HTMLButtonElement | null {
    return value instanceof Event && value.currentTarget instanceof HTMLButtonElement
      ? value.currentTarget
      : null;
  }

  function updateClassifierField(field: string, value: unknown): void {
    switch (field) {
      case 'enabled':
        draft.classifier.enabled = Boolean(value);
        state.classifierEnabled = draft.classifier.enabled;
        break;
      case 'provider':
        draft.classifier.provider = String(
          value ?? 'ollama'
        ) as CompleteOptions['classifier']['provider'];
        state.classifierProvider = draft.classifier.provider;
        break;
      case 'endpoint':
        draft.classifier.endpoint = String(value ?? '');
        state.classifierEndpoint = draft.classifier.endpoint;
        break;
      case 'model':
        draft.classifier.model = String(value ?? '');
        state.classifierModel = draft.classifier.model;
        break;
      case 'apiKey':
        draft.classifier.apiKey = String(value ?? '');
        state.classifierApiKey = draft.classifier.apiKey;
        break;
      case 'taxonomy':
        state.classifierTaxonomyText = String(value ?? '');
        try {
          draft.classifier.taxonomy = resolveTaxonomy(
            parseClassifierTaxonomy(state.classifierTaxonomyText)
          );
        } catch {
          // Keep the previous taxonomy until the JSON is valid and matches the classifier schema.
        }
        break;
      default:
        return;
    }
    scheduleDraftSave();
  }

  function mergePartialIntoDraft(partial: Partial<CompleteOptions>): void {
    if (partial.rest) {
      draft.rest = { ...draft.rest, ...partial.rest };
    }
    if (partial.templates) {
      draft.templates = { ...draft.templates, ...partial.templates };
    }
    if (partial.domainMappings) {
      draft.domainMappings = { ...partial.domainMappings };
      domainMappingRows = Object.entries(draft.domainMappings);
    }
    if (partial.vaultRouter) {
      draft.vaultRouter = partial.vaultRouter;
    }
    if (partial.yamlConfig !== undefined) {
      draft.yamlConfig = partial.yamlConfig;
    }
    Object.entries(partial).forEach(([key, value]) => {
      if (['rest', 'templates', 'domainMappings', 'vaultRouter', 'yamlConfig'].includes(key)) {
        return;
      }
      (draft as Record<string, unknown>)[key] = value;
    });
  }

  const storageController = createProductionStitchStorageController({
    getConnectionNotice: () => connectionNotice,
    getDraft: () => draft,
    getMessagingRepository: () => resolvedMessagingRepository,
    getState: () => state,
    setConnectionNotice: (notice) => {
      connectionNotice = notice;
    },
    refreshAppData,
    render,
    scheduleDraftSave
  });

  const widgetHost = createProductionStitchWidgetHost({
    getDraft: () => draft,
    getState: () => state,
    getMessages: () => currentMessages,
    ensureVaultRouter: () => storageController.ensureVaultRouter(),
    mergePartialIntoDraft,
    syncDefaultVaultFromRest: () => storageController.syncDefaultVaultFromRest(),
    refreshAppData,
    scheduleDraftSave
  });

  const persistence = createProductionStitchPersistence({
    controller,
    optionsRepository: resolvedOptionsRepository,
    messagingRepository: resolvedMessagingRepository,
    ...(storage ? { storage } : {}),
    ...(now ? { now } : {}),
    getAppData: () => appData,
    getCurrentMessages: () => currentMessages,
    getDraft: () => draft,
    getState: () => state,
    setAppData: (nextAppData) => {
      appData = nextAppData;
    },
    setDraft: (nextDraft) => {
      draft = nextDraft;
    },
    setMaintenanceLog: (log) => {
      maintenanceLog = log;
    },
    setState: (nextState) => {
      state = nextState;
    },
    collectDraftWithWidgets: () => widgetHost.collectDraftWithWidgets(),
    refreshAppData,
    render,
    syncDefaultVaultFromRest: () => storageController.syncDefaultVaultFromRest()
  });

  const actionRuntime = createActionRuntime<PreviewStoreState, PreviewContent>({
    getContext: createSchemaContext,
    mutate,
    handlers: createProductionStitchActions({
      getAppData: () => appData,
      getCurrentLanguage: () => currentLanguage,
      getDraft: () => draft,
      getMessages: () => currentMessages,
      getState: () => state,
      setConnectionNotice: (notice) => {
        connectionNotice = notice;
      },
      setLanguageResource: (resource) => {
        currentMessages = resource.messages;
        currentLanguage = resource.language;
        state.previewLanguage = resource.language;
      },
      setMaintenanceLog: (log) => {
        maintenanceLog = log;
      },
      setState: (nextState) => {
        state = nextState;
      },
      activateVaultLocalFolder: (index) => storageController.activateVaultLocalFolder(index),
      applyConnectionNotice: (result) => storageController.applyConnectionNotice(result),
      applyOutputPreset,
      applyTemplateStateToDraft,
      ...(changeLanguage ? { changeLanguage } : {}),
      chooseVaultLocalFolder: (index) => storageController.chooseVaultLocalFolder(index),
      clearAnalyticsPrivacyData: () => persistence.clearAnalyticsPrivacyData(),
      clearVaultLocalFolder: (index) => storageController.clearVaultLocalFolder(index),
      collectDraftWithWidgets: () => widgetHost.collectDraftWithWidgets(),
      copyConfigurationToClipboard: (button) => persistence.copyConfigurationToClipboard(button),
      currentDomainEntries,
      eventButton,
      ensureVaultRouter: () => storageController.ensureVaultRouter(),
      importConfigurationWithStatus: (button) => persistence.importConfigurationWithStatus(button),
      markWidgetDirty: (key) => widgetHost.markDirty(key),
      openResource,
      persistPrivacyPreference: (field, value) =>
        persistence.persistPrivacyPreference(field, value),
      persistThemePreference: (theme) => {
        void resolvedOptionsRepository.set({ interfaceTheme: theme } as Partial<CompleteOptions>);
      },
      refreshAppData,
      render,
      renderActiveResourceModal,
      repairConfiguration: () => persistence.repairConfiguration(),
      reloadOptions: async () => {
        const loaded = await controller.loadRaw();
        mounted.refreshOptions(loaded);
      },
      resetUsageData: () => persistence.resetUsageData(),
      runVaultListConnectionTest: () => storageController.runVaultListConnectionTest(),
      scheduleDraftSave,
      scrollToPanel,
      syncDomainEntries,
      syncHighlightThemeControls,
      syncModifierControls,
      syncPreviewThemeControls,
      syncRoutingRulesToDraft: () => storageController.syncRoutingRulesToDraft(),
      updateClassifierField,
      updateDraftPath,
      updateVaultField: (index, field, value) =>
        storageController.updateVaultField(index, field, value)
    }),
    onUnhandledAction: () => {
      controller.scheduleAutoSave(() => draft);
    }
  });

  function dispatch(actionId: string, args: unknown[] = [], value?: unknown, event?: Event): void {
    const scrollSnapshot = shouldPreserveButtonActionScroll(actionId)
      ? (buttonPressScrollGuard.getSnapshot() ?? captureOptionsScroll(mountRoot))
      : null;
    widgetHost.flushDirtyWidgets();
    actionRuntime.dispatch({ id: actionId, args }, value === undefined ? event : value);
    if (scrollSnapshot) {
      restoreOptionsScrollSoon(mountRoot, scrollSnapshot);
    }
  }

  function createRenderContext() {
    return {
      ...createSchemaContext(),
      el,
      ui: previewUi,
      dispatch,
      mountWidget: (widgetType: string, host: HTMLElement) =>
        widgetHost.mountWidget(widgetType, host)
    };
  }

  const schemaRenderer = createSchemaRenderer<PreviewStoreState, PreviewContent>(
    {
      getContext: createSchemaContext,
      dispatch: (action, payload) => {
        if (typeof action === 'string') {
          dispatch(action, [], payload);
          return;
        }
        dispatch(action.id, action.args ?? [], payload);
      },
      mutate,
      requestRerender: render,
      getWidgetFactory: (widgetType) => widgetHost.createWidgetFactory(widgetType)
    },
    {
      renderView: (view) => renderPreviewView(view as ViewSchema, createRenderContext())
    }
  );

  function syncHighlightThemeControls(): void {
    const theme = isHighlightTheme(state.highlightTheme) ? state.highlightTheme : 'gradient';
    const themeValues = new Set(Object.keys(HIGHLIGHT_THEME_CLASSES));
    mountRoot.querySelectorAll<HTMLButtonElement>('.chips button[data-value]').forEach((button) => {
      if (!themeValues.has(button.dataset.value ?? '')) {
        return;
      }
      const isActive = button.dataset.value === theme;
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.classList.toggle('is-active', isActive);
      const chipGroup = button.closest<HTMLElement>('.chips');
      if (chipGroup) {
        chipGroup.dataset.activeValue = theme;
      }
    });

    const highlight = mountRoot.querySelector<HTMLElement>(
      '.highlight-inline-example .inline-highlight'
    );
    if (highlight) {
      highlight.classList.remove(...Object.values(HIGHLIGHT_THEME_CLASSES));
      highlight.classList.add(HIGHLIGHT_THEME_CLASSES[theme]);
    }
  }

  function syncModifierControls(): void {
    const activeKeys = new Set(state.modifierKeys);
    mountRoot
      .querySelectorAll<HTMLInputElement>('.modifier-key-inline .switch input[type="checkbox"]')
      .forEach((input) => {
        input.checked = state.fragmentModifierEnabled;
      });
    mountRoot
      .querySelectorAll<HTMLButtonElement>('.modifier-key-inline .chips button[data-value]')
      .forEach((button) => {
        const isActive =
          state.fragmentModifierEnabled && activeKeys.has(button.dataset.value ?? '');
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        button.classList.toggle('is-active', isActive);
      });
  }

  function syncPreviewThemeControls(): void {
    const preference =
      state.interfaceThemePreference === 'light' || state.interfaceThemePreference === 'system'
        ? state.interfaceThemePreference
        : 'dark';
    mountRoot.querySelectorAll<HTMLButtonElement>('.chips button[data-value]').forEach((button) => {
      if (
        button.dataset.value !== 'light' &&
        button.dataset.value !== 'dark' &&
        button.dataset.value !== 'system'
      ) {
        return;
      }
      const isActive = button.dataset.value === preference;
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.classList.toggle('is-active', isActive);
      const chipGroup = button.closest<HTMLElement>('.chips');
      if (chipGroup) {
        chipGroup.dataset.activeValue = preference;
      }
    });
  }

  function applySystemThemePreferenceChange(): void {
    if (state.interfaceThemePreference !== 'system') {
      return;
    }
    state.previewTheme = persistTheme('system');
    syncPreviewThemeControls();
  }

  function render(): void {
    const previousMain = mountRoot.querySelector('.main');
    const previousScrollTop = previousMain instanceof HTMLElement ? previousMain.scrollTop : 0;
    const previousWindowScroll = {
      x: window.scrollX,
      y: window.scrollY
    };
    widgetHost.flushDirtyWidgets();
    widgetHost.destroyWidgets();
    clear(mountRoot).append(
      buildAppShell({
        el,
        sidebar: renderSidebar(),
        panelStack: renderSectionStack()
      })
    );
    const nextMain = mountRoot.querySelector('.main');
    const restoreScroll = () => {
      const currentMain = mountRoot.querySelector('.main');
      if (currentMain instanceof HTMLElement) {
        setScrollTopImmediately(currentMain, previousScrollTop);
      }
      if (window.scrollX !== previousWindowScroll.x || window.scrollY !== previousWindowScroll.y) {
        window.scrollTo(previousWindowScroll.x, previousWindowScroll.y);
      }
    };
    if (nextMain instanceof HTMLElement) {
      restoreScroll();
      bindScrollSync(nextMain);
      queueMicrotask(restoreScroll);
      window.requestAnimationFrame?.(() => restoreScroll());
    }
    const chartHost = mountRoot.querySelector<HTMLElement>('[data-role="usage-chart-shell"]');
    if (chartHost) {
      previewUi.renderUsageChart(chartHost, appData.overview.history);
    }
    syncPreviewThemeControls();
    syncHighlightThemeControls();
    syncModifierControls();
    renderActiveResourceModal();
  }

  function renderSidebar(): HTMLElement {
    const appData = createSchemaContext().appData;
    return buildSidebar({
      el,
      brand: appData.brand,
      settingsTitle: '',
      resourcesTitle: '',
      runtimeTitle: currentLanguage === 'en' ? 'Runtime UI' : '运行时界面',
      navItems: appData.nav,
      sidebarLinks: appData.sidebarLinks,
      surfaceLinks: appData.surfaceLinks,
      activePanel: state.activePanel,
      activeResource: state.activeResource,
      onPanelClick: scrollToPanel,
      onFooterClick: openResource
    });
  }

  function renderSectionStack(): HTMLElement {
    return buildPanelStack({
      el,
      items: appData.nav,
      renderSection: (panelId) => {
        const view = getSettingsView(panelId, createSchemaContext());
        const content = view ? schemaRenderer.renderView(view as never) : el('div');
        return buildScrollSection({ el, panelId, content });
      }
    });
  }

  function openResource(resourceId: string): void {
    if (RUNTIME_SURFACE_RESOURCE_IDS.has(resourceId)) {
      return;
    }
    const meta = getFooterMeta(resourceId);
    if (!meta) {
      return;
    }
    if (meta.openMode === 'page') {
      const href = resourceId === 'onboarding' ? '../onboarding/index.html' : meta.href;
      window.open(href ?? `./${resourceId}.html`, '_blank', 'noopener,noreferrer');
      return;
    }
    state = {
      ...state,
      activeResource: resourceId
    };
    renderActiveResourceModal();
  }

  function renderActiveResourceModal(): void {
    mountRoot.querySelectorAll('.resource-modal-overlay').forEach((modal) => modal.remove());
    if (!state.activeResource) {
      return;
    }
    const view = getFooterView(state.activeResource, createSchemaContext());
    const modal = view ? schemaRenderer.renderView(view as never) : null;
    if (modal) {
      mountRoot.querySelector<HTMLElement>('[data-modal-host="true"]')?.append(modal);
    }
  }

  function scrollToPanel(panelId: string): void {
    state = {
      ...state,
      activePanel: panelId
    };
    const main = mountRoot.querySelector<HTMLElement>('.main');
    const section = mountRoot.querySelector<HTMLElement>(`[data-panel-id="${panelId}"]`);
    if (main && section) {
      const top = Math.max(section.offsetTop - 12, 0);
      if (typeof main.scrollTo === 'function') {
        main.scrollTo({ top, behavior: 'smooth' });
      } else {
        main.scrollTop = top;
      }
    }
    syncActiveLinks();
  }

  function bindScrollSync(main: HTMLElement): void {
    main.addEventListener(
      'scroll',
      () => {
        const sections = Array.from(
          mountRoot.querySelectorAll<HTMLElement>('[data-scroll-section="true"]')
        );
        const threshold = main.scrollTop + 120;
        let nextActive = sections[0]?.dataset.panelId ?? state.activePanel;
        sections.forEach((section) => {
          if (section.offsetTop <= threshold) {
            nextActive = section.dataset.panelId ?? nextActive;
          }
        });
        if (nextActive !== state.activePanel) {
          state = {
            ...state,
            activePanel: nextActive
          };
          syncActiveLinks();
        }
      },
      { passive: true }
    );
  }

  function syncActiveLinks(): void {
    mountRoot.querySelectorAll<HTMLElement>('[data-nav-panel]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.navPanel === state.activePanel);
    });
    mountRoot.querySelectorAll<HTMLElement>('[data-footer-panel]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.footerPanel === state.activeResource);
    });
  }

  function applyTemplateStateToDraft(): void {
    draft.templates.article = state.templateValues.articleVideo ?? draft.templates.article;
    draft.templates.fragment = state.templateValues.fragment ?? draft.templates.fragment;
    draft.templates.ai = state.templateValues.aiChat ?? draft.templates.ai;
    if (state.readingPathMode === 'article') {
      draft.templates.reading = draft.templates.article;
    } else if (state.readingPathMode === 'fragment') {
      draft.templates.reading = draft.templates.fragment;
    } else {
      draft.templates.reading = state.templateValues.readingCustom ?? draft.templates.reading;
    }
  }

  function applyOutputPreset(name: string): void {
    switch (name) {
      case 'Minimal':
        draft.templates = {
          ...draft.templates,
          article: 'Articles/{domain}/{yyyy}/{slug}.md',
          fragment: 'Clips/{domain}/{yyyy}/{slug}.md',
          reading: 'Reading/{domain}/{yyyy}/{slug}.md',
          ai: 'AI/{platform}/{yyyy}/{title}.md'
        };
        draft.domainMappings = {};
        domainMappingRows = [];
        draft.yamlConfig = createPresetYamlConfig('Minimal');
        break;
      case 'Research':
        draft.templates = {
          ...draft.templates,
          article: 'Research/{domain}/{yyyy}/{slug}.md',
          fragment: 'Research/Fragments/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
          reading: 'Research/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
          ai: 'Research/AI/{platform}/{yyyy}/{yyyy}-{mm}-{dd}_{title}.md'
        };
        draft.domainMappings = {
          'arxiv.org': 'Arxiv',
          'mp.weixin.qq.com': '公众号',
          'scholar.google.com': 'Scholar'
        };
        domainMappingRows = Object.entries(draft.domainMappings);
        draft.yamlConfig = createPresetYamlConfig('Research');
        break;
      case 'Conversation':
        draft.templates = {
          ...draft.templates,
          article: 'Articles/{domain}/{yyyy}/{slug}.md',
          fragment: 'Clips/{domain}/{yyyy}/{slug}.md',
          reading: 'Reading/{domain}/{yyyy}/{slug}.md',
          ai: 'AI/{platform}/{yyyy}/{yyyy}-{mm}-{dd}_{title}.md'
        };
        draft.domainMappings = {
          'chatgpt.com': 'ChatGPT',
          'claude.ai': 'Claude',
          'gemini.google.com': 'Gemini'
        };
        domainMappingRows = Object.entries(draft.domainMappings);
        draft.yamlConfig = createPresetYamlConfig('Conversation');
        break;
      default:
        return;
    }
    state.templateValues = toTemplateValues(draft);
    state.readingPathMode = resolveReadingPathMode(draft);
    refreshAppData();
    scheduleDraftSave();
    render();
  }

  function updateDraftPath(path: string, value: unknown): void {
    switch (path) {
      case 'aiChat.userName':
        draft.aiChat.userName = String(value ?? '');
        state.aiUserName = draft.aiChat.userName;
        break;
      case 'video.floatingPromptEnabled':
        draft.video.floatingPromptEnabled = Boolean(value);
        state.videoFloatingPromptEnabled = draft.video.floatingPromptEnabled;
        break;
      case 'readingSession.exportMode':
        draft.readingSession.exportMode = String(
          value ?? 'highlights'
        ) as CompleteOptions['readingSession']['exportMode'];
        state.readingExportMode = draft.readingSession.exportMode;
        break;
      case 'fragmentClipper.useFootnoteFormat':
        draft.fragmentClipper.useFootnoteFormat = Boolean(value);
        state.fragmentUseFootnoteFormat = draft.fragmentClipper.useFootnoteFormat;
        break;
      case 'fragmentClipper.captureContext':
        draft.fragmentClipper.captureContext = Boolean(value);
        state.fragmentCaptureContext = draft.fragmentClipper.captureContext;
        break;
      case 'fragmentClipper.contextLength':
        draft.fragmentClipper.contextLength = Number(value) || draft.fragmentClipper.contextLength;
        state.fragmentContextLength = draft.fragmentClipper.contextLength;
        break;
      case 'fragmentClipper.contextMode':
        draft.fragmentClipper.contextMode = String(
          value ?? 'chars'
        ) as CompleteOptions['fragmentClipper']['contextMode'];
        state.fragmentContextMode = draft.fragmentClipper.contextMode;
        break;
      case 'fragmentClipper.keyboardShortcutsEnabled':
        draft.fragmentClipper.keyboardShortcutsEnabled = Boolean(value);
        state.fragmentKeyboardShortcutsEnabled = draft.fragmentClipper.keyboardShortcutsEnabled;
        break;
      default:
        break;
    }
  }

  function scheduleDraftSave(): void {
    refreshAppData();
    controller.scheduleAutoSave(() => mounted.collectDraft());
  }

  const mounted: MountedProductionStitchShell = {
    cleanup() {
      buttonPressScrollGuard.cleanup();
      themeMediaQuery.removeEventListener?.('change', applySystemThemePreferenceChange);
      schemaRenderer.dispose();
      widgetHost.destroyWidgets();
      clear(mountRoot);
    },
    collectDraft() {
      return widgetHost.collectDraftWithWidgets();
    },
    refreshOptions(options = null) {
      draft = mergeOptions(options) as CompleteOptions;
      domainMappingRows = resolveDefaultDomainMappingRows();
      widgetHost.resetDirty();
      refreshAppData();
      state = applyOptionsToState(state, draft, appData);
      state.interfaceThemePreference = resolveThemePreference(draft);
      state.previewTheme = resolveStoredTheme(draft);
      state.previewTheme = persistTheme(state.interfaceThemePreference);
      render();
    },
    setMessages(nextMessages, nextLanguage) {
      currentMessages = nextMessages;
      currentLanguage = nextLanguage;
      state = {
        ...state,
        previewLanguage: nextLanguage
      };
      render();
    }
  };

  themeMediaQuery.addEventListener?.('change', applySystemThemePreferenceChange);

  render();
  void persistence.loadUsageStatsFromStorage();
  return mounted;
}
