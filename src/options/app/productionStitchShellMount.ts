import { previewContent } from '@options/stitch/content';
import type { PreviewContent, SchemaContext } from '@options/stitch/types';
import {
  applyOptionsToState,
  createInitialStitchState,
  createThemeMediaQuery,
  persistTheme,
  resolveStoredTheme,
  resolveThemePreference
} from './productionStitchStateMapper';
import { installButtonPressScrollGuard } from './productionStitchScrollGuard';
import {
  createProductionStitchRenderLifecycle,
  type ProductionStitchRenderLifecycle
} from './productionStitchRenderLifecycle';
import {
  createInitialDraft,
  resolveDefaultDomainMappingRows,
  resolveMessagingRepositoryFallback,
  resolveOptionsRepositoryFallback,
  resolveRoot
} from './productionStitchShellState';
import type {
  MountedProductionStitchShell,
  ProductionStitchShellDependencies
} from './productionStitchShellTypes';
import { cleanupProductionStitchShell } from './productionStitchShellTeardown';
import {
  createProductionStitchAppData,
  createProductionStitchMutator,
  createProductionStitchSchemaContext,
  resolveProductionDomainEntries,
  syncProductionDomainEntries
} from './productionStitchShellContext';
import { createProductionStitchShellActionRuntime } from './productionStitchShellActionRuntime';
import {
  createProductionStitchRenderDelegates,
  createProductionStitchShellSchemaRenderer
} from './productionStitchShellRenderDelegates';
import { createProductionStitchShellRuntimeServices } from './productionStitchShellRuntimeServices';

export function mountProductionStitchShellFromDependencies({
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
  let draft = createInitialDraft(initialOptions);

  let currentLanguage = language;
  let currentMessages = messages;
  let connectionNotice: PreviewContent['storage']['connectionNotice'] | undefined;
  let maintenanceLog = previewContent.maintenanceLog;
  let domainMappingRows: Array<[string, string]> = resolveDefaultDomainMappingRows(draft);
  let appData = createProductionStitchAppData(draft, { maintenanceLog });
  let state = applyOptionsToState(createInitialStitchState(appData), draft, appData);
  state.interfaceThemePreference = resolveThemePreference(draft);
  state.previewTheme = resolveStoredTheme(draft);
  state.previewLanguage = currentLanguage;
  state.previewTheme = persistTheme(state.interfaceThemePreference);
  const themeMediaQuery = createThemeMediaQuery();

  function createSchemaContext(): SchemaContext {
    return createProductionStitchSchemaContext({
      appData,
      language: currentLanguage,
      state
    });
  }

  function refreshAppData(): void {
    appData = createProductionStitchAppData(draft, {
      ...(connectionNotice ? { connectionNotice } : {}),
      maintenanceLog
    });
    state.maintenanceLog = maintenanceLog;
  }

  let renderLifecycle: ProductionStitchRenderLifecycle | null = null;
  const renderDelegates = createProductionStitchRenderDelegates(() => renderLifecycle);
  const mutate = createProductionStitchMutator({
    getState: () => state,
    render: renderDelegates.render
  });

  const { persistence, storageController, widgetHost } = createProductionStitchShellRuntimeServices(
    {
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
      setConnectionNotice: (notice) => {
        connectionNotice = notice;
      },
      setDraft: (nextDraft) => {
        draft = nextDraft;
      },
      setDomainMappingRows: (entries) => {
        domainMappingRows = entries;
      },
      setMaintenanceLog: (log) => {
        maintenanceLog = log;
      },
      setState: (nextState) => {
        state = nextState;
      },
      getConnectionNotice: () => connectionNotice,
      refreshAppData,
      render: renderDelegates.render,
      scheduleDraftSave
    }
  );

  let mounted: MountedProductionStitchShell;
  const actionRuntime = createProductionStitchShellActionRuntime({
    mountRoot,
    buttonPressScrollGuard,
    controller,
    optionsRepository: resolvedOptionsRepository,
    ...(changeLanguage ? { changeLanguage } : {}),
    getAppData: () => appData,
    getCurrentLanguage: () => currentLanguage,
    getCurrentMessages: () => currentMessages,
    getDraft: () => draft,
    getState: () => state,
    setConnectionNotice: (notice) => {
      connectionNotice = notice;
    },
    setDomainMappingRows: (entries) => {
      domainMappingRows = entries;
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
    createSchemaContext,
    mutate,
    currentDomainEntries: () => resolveProductionDomainEntries(domainMappingRows),
    refreshAppData,
    refreshOptions: (options) => mounted.refreshOptions(options),
    render: renderDelegates.render,
    renderActiveResourceModal: renderDelegates.renderActiveResourceModal,
    scheduleDraftSave,
    scrollToPanel: renderDelegates.scrollToPanel,
    syncDomainEntries: (entries) => {
      domainMappingRows = syncProductionDomainEntries(draft, entries);
    },
    syncHighlightThemeControls: renderDelegates.syncHighlightThemeControls,
    syncModifierControls: renderDelegates.syncModifierControls,
    syncPreviewThemeControls: renderDelegates.syncPreviewThemeControls,
    openResource: renderDelegates.openResource,
    persistence,
    storageController,
    widgetHost
  });

  function dispatch(actionId: string, args: unknown[] = [], value?: unknown, event?: Event): void {
    actionRuntime.dispatch(actionId, args, value, event);
  }

  const schemaRenderer = createProductionStitchShellSchemaRenderer({
    createSchemaContext,
    dispatch,
    mutate,
    render: renderDelegates.render,
    widgetHost
  });

  renderLifecycle = createProductionStitchRenderLifecycle({
    mountRoot,
    getAppData: () => appData,
    getCurrentLanguage: () => currentLanguage,
    getState: () => state,
    setState: (nextState) => {
      state = nextState;
    },
    createSchemaContext,
    dispatch,
    schemaRenderer,
    widgetHost
  });

  function scheduleDraftSave(): void {
    refreshAppData();
    controller.scheduleAutoSave(() => mounted.collectDraft());
  }

  mounted = {
    cleanup() {
      cleanupProductionStitchShell({
        mountRoot,
        buttonPressScrollGuard,
        themeMediaQuery,
        applySystemThemePreferenceChange: renderDelegates.applySystemThemePreferenceChange,
        schemaRenderer,
        widgetHost
      });
    },
    collectDraft() {
      return widgetHost.collectDraftWithWidgets();
    },
    refreshOptions(options = null) {
      draft = createInitialDraft(options);
      domainMappingRows = resolveDefaultDomainMappingRows(draft);
      widgetHost.resetDirty();
      refreshAppData();
      state = applyOptionsToState(state, draft, appData);
      state.interfaceThemePreference = resolveThemePreference(draft);
      state.previewTheme = resolveStoredTheme(draft);
      state.previewTheme = persistTheme(state.interfaceThemePreference);
      renderDelegates.render();
    },
    setMessages(nextMessages, nextLanguage) {
      currentMessages = nextMessages;
      currentLanguage = nextLanguage;
      state = {
        ...state,
        previewLanguage: nextLanguage
      };
      renderDelegates.render();
    }
  };

  themeMediaQuery.addEventListener?.('change', renderDelegates.applySystemThemePreferenceChange);

  renderDelegates.render();
  void persistence.loadUsageStatsFromStorage();
  return mounted;
}
