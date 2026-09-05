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
import { createProductionStitchAssetUrlResolver } from './productionStitchAssetUrlResolver';
import { createUnavailableUsageStatsClient } from './usage-dashboard/usageStatsClient';
import { createProductionStitchAuthoritativeRebase } from './productionStitchAuthoritativeRebase';

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
  usageStatsClient,
  storage,
  runtime,
  resolveAssetUrl: providedResolveAssetUrl,
  browserTarget: providedBrowserTarget,
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
  const resolvedUsageStatsClient = usageStatsClient ?? createUnavailableUsageStatsClient();
  const resolveAssetUrl =
    providedResolveAssetUrl ?? createProductionStitchAssetUrlResolver(runtime);
  const browserTarget = providedBrowserTarget ?? runtime?.getBrowserTarget() ?? 'chrome';
  const shellState = createProductionStitchShellMutableState({
    initialOptions,
    previewContent: stitchAssets.previewContent,
    language,
    messages,
    browserTarget
  });
  const themeMediaQuery = createThemeMediaQuery();
  let shellActive = true;

  let renderLifecycle: ProductionStitchRenderLifecycle | null = null;
  const renderDelegates = createProductionStitchRenderDelegates(() => renderLifecycle);
  const {
    createSchemaContext,
    getAppData,
    getConnectionNotice,
    getCurrentLanguage,
    getCurrentMessages,
    getDomainMappingRows,
    getDraft,
    getState,
    refreshAppData,
    resetOptions,
    setAppData,
    setConnectionNotice,
    setDomainMappingRows,
    setDraft,
    setLanguageResource,
    setMaintenanceLog,
    setState
  } = shellState;
  const {
    applySystemThemePreferenceChange,
    openResource,
    render,
    renderActiveResourceModal,
    scrollToPanel,
    syncHighlightThemeControls,
    syncModifierControls,
    syncPreviewThemeControls
  } = renderDelegates;
  const mutate = createProductionStitchMutator({
    getState,
    render
  });

  const { persistence, storageController, widgetHost } = createProductionStitchShellRuntimeServices(
    {
      controller,
      optionsRepository: resolvedOptionsRepository,
      messagingRepository: resolvedMessagingRepository,
      usageStatsClient: resolvedUsageStatsClient,
      ...(storage ? { storage } : {}),
      ...(now ? { now } : {}),
      getAppData,
      getCurrentMessages,
      getDraft,
      getState,
      isActive: () => shellActive,
      resetOptions,
      setAppData,
      setConnectionNotice,
      setDomainMappingRows,
      setMaintenanceLog,
      getConnectionNotice,
      refreshAppData,
      render,
      scheduleDraftSave
    }
  );

  const actionRuntime = createProductionStitchShellActionRuntime({
    mountRoot,
    buttonPressScrollGuard,
    controller,
    optionsRepository: resolvedOptionsRepository,
    ...(changeLanguage ? { changeLanguage } : {}),
    getAppData,
    getCurrentLanguage,
    getCurrentMessages,
    getDraft,
    getState,
    setAppData,
    setDraft,
    setConnectionNotice,
    setDomainMappingRows,
    setLanguageResource,
    setMaintenanceLog,
    setState,
    createSchemaContext,
    mutate,
    currentDomainEntries: () => resolveProductionDomainEntries(getDomainMappingRows()),
    refreshAppData,
    refreshOptions: (options) => mounted.refreshOptions(options),
    render,
    renderActiveResourceModal,
    scheduleDraftSave,
    scrollToPanel,
    syncDomainEntries: (entries) => {
      setDomainMappingRows(syncProductionDomainEntries(getDraft(), entries));
    },
    syncHighlightThemeControls,
    syncModifierControls,
    syncPreviewThemeControls,
    openResource,
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
    render,
    resolveAssetUrl,
    widgetHost
  });

  renderLifecycle = createProductionStitchRenderLifecycle({
    getFooterMeta: stitchAssets.getFooterMeta,
    getFooterView: stitchAssets.getFooterView,
    mountRoot,
    getAppData,
    getCurrentLanguage,
    getSettingsView: stitchAssets.getSettingsView,
    getState,
    setState,
    createSchemaContext,
    dispatch,
    resolveAssetUrl,
    schemaRenderer,
    widgetHost
  });

  function scheduleDraftSave(): void {
    shellState.refreshAppData();
    persistence.restoreUsageStatsView();
    controller.scheduleAutoSave(() => mounted.collectDraft());
  }
  const rebaseOptions = createProductionStitchAuthoritativeRebase({
    resetOptions,
    afterReset: persistence.restoreUsageStatsView.bind(persistence),
    getRenderProtectionKeys: widgetHost.getRenderProtectionKeys.bind(widgetHost),
    reconcileRenderProtection: widgetHost.reconcileRenderProtection.bind(widgetHost),
    render: renderDelegates.render
  });

  const mounted: MountedProductionStitchShell = {
    cleanup() {
      shellActive = false;
      actionRuntime.dispose();
      renderLifecycle?.cleanup();
      cleanupProductionStitchShell({
        mountRoot,
        buttonPressScrollGuard,
        themeMediaQuery,
        applySystemThemePreferenceChange,
        schemaRenderer,
        widgetHost
      });
    },
    collectDraft() {
      return widgetHost.collectDraftWithWidgets();
    },
    rebaseOptions,
    refreshOptions(options = null) {
      resetOptions(options);
      persistence.restoreUsageStatsView();
      widgetHost.resetDirty();
      renderDelegates.render('all-invariant-recovery');
    },
    setMessages(nextMessages, nextLanguage) {
      shellState.setLanguageResource({
        messages: nextMessages,
        language: nextLanguage
      });
      renderDelegates.render('locale-schema');
    }
  };
  themeMediaQuery.addEventListener?.('change', applySystemThemePreferenceChange);

  render('all-invariant-recovery');
  void persistence.loadUsageStatsFromStorage();
  return mounted;
}
