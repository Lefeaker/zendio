import { createThemeMediaQuery } from './productionStitchStateMapper';
import { installButtonPressScrollGuard } from './productionStitchScrollGuard';
import { createProductionStitchRenderLifecycle } from './productionStitchRenderLifecycle';
import {
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
  createProductionStitchMutator,
  resolveProductionDomainEntries,
  syncProductionDomainEntries
} from './productionStitchShellContext';
import { createProductionStitchShellActionRuntime } from './productionStitchShellActionRuntime';
import {
  createProductionStitchRenderDelegates,
  createProductionStitchShellSchemaRenderer
} from './productionStitchShellRenderDelegates';
import type { ProductionStitchRenderLifecycle } from './productionStitchRenderLifecycleTypes';
import { createProductionStitchShellRuntimeServices } from './productionStitchShellRuntimeServices';
import { resolveProductionStitchAssets } from './productionStitchShellAssetResolver';
import { createProductionStitchShellMutableState } from './productionStitchShellMutableState';

export function mountProductionStitchShellFromDependencies({
  root,
  controller,
  initialOptions = null,
  getFooterMeta,
  getFooterView,
  getSettingsView,
  previewContent,
  language,
  messages = null,
  changeLanguage,
  optionsRepository,
  messagingRepository,
  storage,
  now
}: ProductionStitchShellDependencies): MountedProductionStitchShell {
  const stitchAssets = resolveProductionStitchAssets({
    previewContent,
    getFooterMeta,
    getFooterView,
    getSettingsView
  });
  const mountRoot = resolveRoot(root);
  const buttonPressScrollGuard = installButtonPressScrollGuard(mountRoot);
  const resolvedOptionsRepository = optionsRepository ?? resolveOptionsRepositoryFallback();
  const resolvedMessagingRepository = messagingRepository ?? resolveMessagingRepositoryFallback();
  const shellState = createProductionStitchShellMutableState({
    initialOptions,
    previewContent: stitchAssets.previewContent,
    language,
    messages
  });
  const themeMediaQuery = createThemeMediaQuery();

  let renderLifecycle: ProductionStitchRenderLifecycle | null = null;
  const renderDelegates = createProductionStitchRenderDelegates(() => renderLifecycle);
  const mutate = createProductionStitchMutator({
    getState: shellState.getState,
    render: renderDelegates.render
  });

  const { persistence, storageController, widgetHost } = createProductionStitchShellRuntimeServices(
    {
      controller,
      optionsRepository: resolvedOptionsRepository,
      messagingRepository: resolvedMessagingRepository,
      ...(storage ? { storage } : {}),
      ...(now ? { now } : {}),
      getAppData: shellState.getAppData,
      getCurrentMessages: shellState.getCurrentMessages,
      getDraft: shellState.getDraft,
      getState: shellState.getState,
      setAppData: shellState.setAppData,
      setConnectionNotice: shellState.setConnectionNotice,
      setDraft: shellState.setDraft,
      setDomainMappingRows: shellState.setDomainMappingRows,
      setMaintenanceLog: shellState.setMaintenanceLog,
      setState: shellState.setState,
      getConnectionNotice: shellState.getConnectionNotice,
      refreshAppData: shellState.refreshAppData,
      render: renderDelegates.render,
      scheduleDraftSave
    }
  );

  const actionRuntime = createProductionStitchShellActionRuntime({
    mountRoot,
    buttonPressScrollGuard,
    controller,
    optionsRepository: resolvedOptionsRepository,
    ...(changeLanguage ? { changeLanguage } : {}),
    getAppData: shellState.getAppData,
    getCurrentLanguage: shellState.getCurrentLanguage,
    getCurrentMessages: shellState.getCurrentMessages,
    getDraft: shellState.getDraft,
    getState: shellState.getState,
    setConnectionNotice: shellState.setConnectionNotice,
    setDomainMappingRows: shellState.setDomainMappingRows,
    setLanguageResource: shellState.setLanguageResource,
    setMaintenanceLog: shellState.setMaintenanceLog,
    setState: shellState.setState,
    createSchemaContext: shellState.createSchemaContext,
    mutate,
    currentDomainEntries: () => resolveProductionDomainEntries(shellState.getDomainMappingRows()),
    refreshAppData: shellState.refreshAppData,
    refreshOptions: (options) => mounted.refreshOptions(options),
    render: renderDelegates.render,
    renderActiveResourceModal: renderDelegates.renderActiveResourceModal,
    scheduleDraftSave,
    scrollToPanel: renderDelegates.scrollToPanel,
    syncDomainEntries: (entries) => {
      shellState.setDomainMappingRows(syncProductionDomainEntries(shellState.getDraft(), entries));
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
    createSchemaContext: shellState.createSchemaContext,
    dispatch,
    mutate,
    render: renderDelegates.render,
    widgetHost
  });

  renderLifecycle = createProductionStitchRenderLifecycle({
    getFooterMeta: stitchAssets.getFooterMeta,
    getFooterView: stitchAssets.getFooterView,
    mountRoot,
    getAppData: shellState.getAppData,
    getCurrentLanguage: shellState.getCurrentLanguage,
    getSettingsView: stitchAssets.getSettingsView,
    getState: shellState.getState,
    setState: shellState.setState,
    createSchemaContext: shellState.createSchemaContext,
    dispatch,
    schemaRenderer,
    widgetHost
  });

  function scheduleDraftSave(): void {
    shellState.refreshAppData();
    controller.scheduleAutoSave(() => mounted.collectDraft());
  }

  const mounted: MountedProductionStitchShell = {
    cleanup() {
      renderLifecycle?.cleanup();
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
      shellState.resetOptions(options);
      widgetHost.resetDirty();
      renderDelegates.render();
    },
    setMessages(nextMessages, nextLanguage) {
      shellState.setLanguageResource({
        messages: nextMessages,
        language: nextLanguage
      });
      renderDelegates.render();
    }
  };

  themeMediaQuery.addEventListener?.('change', renderDelegates.applySystemThemePreferenceChange);

  renderDelegates.render();
  void persistence.loadUsageStatsFromStorage();
  return mounted;
}
