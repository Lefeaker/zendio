import { createActionRuntime } from '@options/schema-runtime/actionRuntime';
import { createSchemaRenderer } from '@options/schema-runtime/renderer';
import type { CompleteOptions } from '@shared/types/options';
import { el } from '@options/stitch/ui/dom';
import { previewUi } from '@options/stitch/ui/components';
import { previewContent } from '@options/stitch/content';
import { renderPreviewView } from '@options/stitch/render/renderStitchView';
import type {
  PreviewContent,
  PreviewStoreState,
  SchemaContext,
  ViewSchema
} from '@options/stitch/types';
import {
  applyOptionsToState,
  createInitialStitchState,
  createProductionContent,
  createThemeMediaQuery,
  persistTheme,
  resolveExtensionVersionLabel,
  resolveStoredTheme,
  resolveThemePreference
} from './productionStitchStateMapper';
import { createProductionStitchActions } from './productionStitchActions';
import { createProductionStitchWidgetHost } from './productionStitchWidgetHost';
import { createProductionStitchStorageController } from './productionStitchStorageController';
import { createProductionStitchPersistence } from './productionStitchPersistence';
import {
  captureOptionsScroll,
  installButtonPressScrollGuard,
  restoreOptionsScrollSoon,
  shouldPreserveButtonActionScroll
} from './productionStitchScrollGuard';
import { localizeStitchContent } from './productionStitchLocalization';
import {
  createProductionStitchRenderLifecycle,
  type ProductionStitchRenderLifecycle
} from './productionStitchRenderLifecycle';
import {
  applyOutputPresetToDraft,
  applyTemplateStateToDraft,
  createInitialDraft,
  mergePartialIntoDraft,
  resolveDefaultDomainMappingRows,
  resolveMessagingRepositoryFallback,
  resolveOptionsRepositoryFallback,
  resolveRoot,
  updateClassifierField,
  updateDraftPath
} from './productionStitchShellState';
import type {
  MountedProductionStitchShell,
  ProductionStitchShellDependencies
} from './productionStitchShell';
import { cleanupProductionStitchShell } from './productionStitchShellTeardown';

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
    mergePartialIntoDraft: (partial) =>
      mergePartialIntoDraft(
        draft,
        (entries) => {
          domainMappingRows = entries;
        },
        partial
      ),
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

  let renderLifecycle: ProductionStitchRenderLifecycle | null = null;

  function render(): void {
    renderLifecycle?.render();
  }

  function renderActiveResourceModal(): void {
    renderLifecycle?.renderActiveResourceModal();
  }

  function scrollToPanel(panelId: string): void {
    renderLifecycle?.scrollToPanel(panelId);
  }

  function openResource(resourceId: string): void {
    renderLifecycle?.openResource(resourceId);
  }

  function syncHighlightThemeControls(): void {
    renderLifecycle?.syncHighlightThemeControls();
  }

  function syncModifierControls(): void {
    renderLifecycle?.syncModifierControls();
  }

  function syncPreviewThemeControls(): void {
    renderLifecycle?.syncPreviewThemeControls();
  }

  function applySystemThemePreferenceChange(): void {
    renderLifecycle?.applySystemThemePreferenceChange();
  }

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
      applyOutputPreset: (name) =>
        applyOutputPresetToDraft({
          draft,
          state,
          setDomainMappingRows: (entries) => {
            domainMappingRows = entries;
          },
          refreshAppData,
          scheduleDraftSave,
          render,
          name
        }),
      applyTemplateStateToDraft: () => applyTemplateStateToDraft(draft, state),
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
      updateClassifierField: (field, value) =>
        updateClassifierField(draft, state, scheduleDraftSave, field, value),
      updateDraftPath: (path, value) => updateDraftPath(draft, state, path, value),
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

  const mounted: MountedProductionStitchShell = {
    cleanup() {
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
    refreshOptions(options = null) {
      draft = createInitialDraft(options);
      domainMappingRows = resolveDefaultDomainMappingRows(draft);
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
