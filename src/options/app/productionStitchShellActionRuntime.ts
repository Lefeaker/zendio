import { createActionRuntime } from '@options/schema-runtime/actionRuntime';
import type { Language, Messages } from '@i18n';
import type { IOptionsRepository } from '@shared/repositories';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { PreviewContent, PreviewStoreState, SchemaContext } from '@options/stitch/types';
import type { OptionsController } from './optionsController';
import { createProductionStitchActions } from './productionStitchActions';
import type { ProductionStitchPersistence } from './productionStitchPersistence';
import type { ButtonPressScrollGuard } from './productionStitchScrollGuard';
import {
  captureOptionsScroll,
  restoreOptionsScrollSoon,
  shouldPreserveButtonActionScroll
} from './productionStitchScrollGuard';
import type { ProductionStitchStorageController } from './productionStitchStorageController';
import {
  applyOutputPresetToDraft,
  applyTemplateStateToDraft,
  updateClassifierField,
  updateDraftPath
} from './productionStitchShellState';
import type { ProductionStitchWidgetHost } from './productionStitchWidgetHost';

interface ProductionStitchShellActionRuntimeOptions {
  mountRoot: HTMLElement;
  buttonPressScrollGuard: ButtonPressScrollGuard;
  controller: Pick<OptionsController, 'loadRaw' | 'scheduleAutoSave'>;
  optionsRepository: Pick<IOptionsRepository, 'set'>;
  changeLanguage?: (
    language: Language
  ) => Promise<{ messages: Messages | null; language: Language }>;
  getAppData(): PreviewContent;
  getCurrentLanguage(): Language;
  getCurrentMessages(): Messages | null;
  getDraft(): CompleteOptions;
  getState(): PreviewStoreState;
  setConnectionNotice(notice: PreviewContent['storage']['connectionNotice']): void;
  setDomainMappingRows(entries: Array<[string, string]>): void;
  setLanguageResource(resource: { messages: Messages | null; language: Language }): void;
  setMaintenanceLog(log: PreviewContent['maintenanceLog']): void;
  setState(state: PreviewStoreState): void;
  createSchemaContext(): SchemaContext;
  mutate(mutator: (draftState: PreviewStoreState) => void, options?: { silent?: boolean }): void;
  currentDomainEntries(): Array<[string, string]>;
  refreshAppData(): void;
  refreshOptions(options: StoredOptions | CompleteOptions | null): void;
  render(): void;
  renderActiveResourceModal(): void;
  scheduleDraftSave(): void;
  scrollToPanel(panelId: string): void;
  syncDomainEntries(entries: Array<[string, string]>): void;
  syncHighlightThemeControls(): void;
  syncModifierControls(): void;
  syncPreviewThemeControls(): void;
  openResource(resourceId: string): void;
  persistence: ProductionStitchPersistence;
  storageController: ProductionStitchStorageController;
  widgetHost: ProductionStitchWidgetHost;
}

export interface ProductionStitchShellActionRuntime {
  dispatch(actionId: string, args?: unknown[], value?: unknown, event?: Event): void;
}

function eventButton(value: unknown): HTMLButtonElement | null {
  return value instanceof Event && value.currentTarget instanceof HTMLButtonElement
    ? value.currentTarget
    : null;
}

export function createProductionStitchShellActionRuntime(
  options: ProductionStitchShellActionRuntimeOptions
): ProductionStitchShellActionRuntime {
  const {
    buttonPressScrollGuard,
    changeLanguage,
    controller,
    createSchemaContext,
    currentDomainEntries,
    getAppData,
    getCurrentLanguage,
    getCurrentMessages,
    getDraft,
    getState,
    mountRoot,
    mutate,
    openResource,
    optionsRepository,
    persistence,
    refreshAppData,
    refreshOptions,
    render,
    renderActiveResourceModal,
    scheduleDraftSave,
    scrollToPanel,
    setConnectionNotice,
    setDomainMappingRows,
    setLanguageResource,
    setMaintenanceLog,
    setState,
    storageController,
    syncDomainEntries,
    syncHighlightThemeControls,
    syncModifierControls,
    syncPreviewThemeControls,
    widgetHost
  } = options;
  const actionRuntime = createActionRuntime<PreviewStoreState, PreviewContent>({
    getContext: createSchemaContext,
    mutate,
    handlers: createProductionStitchActions({
      getAppData,
      getCurrentLanguage,
      getDraft,
      getMessages: getCurrentMessages,
      getState,
      setConnectionNotice,
      setLanguageResource,
      setMaintenanceLog,
      setState,
      activateVaultLocalFolder: (index) => storageController.activateVaultLocalFolder(index),
      applyConnectionNotice: (result) => storageController.applyConnectionNotice(result),
      applyOutputPreset: (name) =>
        applyOutputPresetToDraft({
          draft: getDraft(),
          state: getState(),
          setDomainMappingRows,
          refreshAppData,
          scheduleDraftSave,
          render,
          name
        }),
      applyTemplateStateToDraft: () => applyTemplateStateToDraft(getDraft(), getState()),
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
        void optionsRepository.set({ interfaceTheme: theme } as Partial<CompleteOptions>);
      },
      refreshAppData,
      render,
      renderActiveResourceModal,
      repairConfiguration: () => persistence.repairConfiguration(),
      reloadOptions: async () => {
        const loaded = await controller.loadRaw();
        refreshOptions(loaded);
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
        updateClassifierField(getDraft(), getState(), scheduleDraftSave, field, value),
      updateDraftPath: (path, value) => updateDraftPath(getDraft(), getState(), path, value),
      updateVaultField: (index, field, value) =>
        storageController.updateVaultField(index, field, value)
    }),
    onUnhandledAction: () => {
      controller.scheduleAutoSave(() => getDraft());
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

  return { dispatch };
}
