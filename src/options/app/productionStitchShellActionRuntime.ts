import { createActionRuntime } from '@options/schema-runtime/actionRuntime';
import type { Language } from '@i18n';
import type { AnalyticsSection } from '@shared/analytics';
import type { IOptionsRepository } from '@shared/repositories';
import { createAnalyticsEventMessage } from '@shared/types/analytics';
import type { AnalyticsRuntimeEventPayload } from '@shared/types/analytics';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';
import type { OptionsController } from './optionsController';
import {
  createProductionStitchActions,
  type ProductionStitchActionContext
} from './productionStitchActions';
import type { ProductionStitchPersistence } from './productionStitchStorageTypes';
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
import { createProductionStitchActionTaskOwner } from './productionStitchActionTaskOwner';
import type { ProductionStitchShellMutableState } from './productionStitchShellMutableState';
import { formatOptionsError, showStatusMessage } from '@options/components/messages';
import type {
  SectionInvalidationAcknowledgement,
  SectionInvalidationRequest
} from '@ui/stitch-runtime/render/sectionInvalidation';
import {
  resolveProductionStitchTaskInvalidation,
  resolveProductionStitchTaskOwner
} from './productionStitchShellContext';
import { createProductionMaintenanceRuntime } from './productionStitchMaintenanceState';
type RuntimeMutableState = Omit<
  ProductionStitchShellMutableState,
  'getConnectionNotice' | 'getDomainMappingRows' | 'resetOptions'
>;

interface ProductionStitchShellActionRuntimeOptions extends RuntimeMutableState {
  mountRoot: HTMLElement;
  buttonPressScrollGuard: ButtonPressScrollGuard;
  controller: Pick<OptionsController, 'loadRaw' | 'scheduleAutoSave'>;
  optionsRepository: Pick<IOptionsRepository, 'patch'>;
  changeLanguage?: ProductionStitchActionContext['changeLanguage'];
  mutate(mutator: (draftState: PreviewStoreState) => void, options?: { silent?: boolean }): void;
  currentDomainEntries(): Array<[string, string]>;
  refreshOptions(options: StoredOptions | CompleteOptions | null): void;
  render(scopes: SectionInvalidationRequest): void;
  renderAndWait(scopes: SectionInvalidationRequest): Promise<SectionInvalidationAcknowledgement>;
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
  dispose(): void;
  waitForIdle(): Promise<void>;
}
const PANEL_SECTION_MAP: Record<string, AnalyticsSection> = {
  overview: 'overview',
  storage: 'storage',
  output: 'templates',
  'capture-sources': 'advanced',
  'capture-behavior': 'advanced',
  maintenance: 'advanced'
};
const ACTION_SECTION_MAP: Record<string, AnalyticsSection> = {
  'maintenance:diagnose': 'advanced',
  'output:applyPreset': 'templates',
  'highlight:setTheme': 'reader',
  'selection-trigger:setMode': 'advanced',
  'modifier:setKey': 'advanced',
  'routing:add': 'storage',
  'routing:remove': 'storage',
  'storage:addVault': 'storage',
  'storage:removeVault': 'storage',
  'storage:cancelLocalFolderDelete': 'storage',
  'storage:deleteLocalFolder': 'storage',
  'domain:add': 'templates',
  'domain:remove': 'templates'
};
const TRACKED_SYNCHRONOUS_ACTIONS = new Set(Object.keys(ACTION_SECTION_MAP));
const RESOURCE_SECTION_MAP: Record<string, AnalyticsSection> = {
  'privacy-policy': 'privacy',
  'data-usage': 'privacy',
  'terms-of-use': 'privacy',
  'plugin-setup': 'onboarding'
};
function eventButton(value: unknown): HTMLButtonElement | null {
  return value instanceof Event && value.currentTarget instanceof HTMLButtonElement
    ? value.currentTarget
    : null;
}
function sanitizeActionId(actionId: string): string {
  return actionId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function createOptionsTelemetry(persistence: ProductionStitchPersistence, isActive: () => boolean) {
  async function send(message: AnalyticsRuntimeEventPayload): Promise<void> {
    if (!isActive()) return;
    try {
      await persistence.trackUsageEvent(message);
    } catch {
      // Best-effort only.
    }
  }

  function trackSectionView(panelId: string): void {
    const section = PANEL_SECTION_MAP[panelId];
    if (!section) return;
    void send(
      createAnalyticsEventMessage('options_section_viewed', {
        section
      })
    );
  }

  function trackAction(
    actionId: string,
    section?: AnalyticsSection,
    outcome: 'completed' | 'failed' = 'completed'
  ): void {
    void send(
      createAnalyticsEventMessage('options_action_completed', {
        action: sanitizeActionId(actionId),
        outcome,
        ...(section ? { section } : {})
      })
    );
  }

  function trackResourceOpen(resourceId: string): void {
    trackAction('resource:open', RESOURCE_SECTION_MAP[resourceId]);
  }

  function trackSynchronousAction(actionId: string): void {
    if (TRACKED_SYNCHRONOUS_ACTIONS.has(actionId))
      trackAction(actionId, ACTION_SECTION_MAP[actionId]);
  }

  function trackMaintenanceOutcome(
    actionId: 'maintenance:repair' | 'maintenance:reload',
    outcome: 'completed' | 'failed'
  ): void {
    trackAction(actionId, 'advanced', outcome);
  }

  function trackThemeChanged(theme: 'light' | 'dark' | 'system'): void {
    void send(createAnalyticsEventMessage('options_theme_changed', { theme }));
  }

  function trackLanguageChanged(language: Language): void {
    void send(createAnalyticsEventMessage('options_language_changed', { language }));
  }

  function trackExperimentalFeatureToggle(featureKey: string, enabled: boolean): void {
    void send(
      createAnalyticsEventMessage('experimental_feature_toggled', {
        feature_key: featureKey,
        enabled
      })
    );
  }

  return {
    trackExperimentalFeatureToggle,
    trackLanguageChanged,
    trackMaintenanceOutcome,
    trackResourceOpen,
    trackSectionView,
    trackSynchronousAction,
    trackThemeChanged
  };
}

export function createProductionStitchShellActionRuntime(
  options: ProductionStitchShellActionRuntimeOptions
): ProductionStitchShellActionRuntime {
  const {
    buttonPressScrollGuard,
    changeLanguage,
    controller,
    mountRoot,
    optionsRepository,
    persistence,
    storageController,
    widgetHost
  } = options;
  let disposed = false;
  const telemetry = createOptionsTelemetry(persistence, () => !disposed);
  const owner = createProductionStitchActionTaskOwner();
  function refresh(): void {
    options.refreshAppData();
    persistence.restoreUsageStatsView();
  }
  const maintenance = createProductionMaintenanceRuntime(
    options,
    controller.loadRaw.bind(controller),
    owner,
    () => !disposed,
    refresh,
    (outcome) => telemetry.trackMaintenanceOutcome('maintenance:reload', outcome)
  );
  function runPersistenceTask(
    key: string,
    task: () => Promise<void>,
    captureRollback?: () => () => void
  ): void {
    const scopes =
      key === 'storage:deleteLocalFolder'
        ? 'storage'
        : resolveProductionStitchTaskInvalidation(key);
    owner.run<(() => void) | undefined>({
      key: key === 'storage:deleteLocalFolder' ? key : resolveProductionStitchTaskOwner(key),
      capture: () => captureRollback?.(),
      task,
      rollback: (rollback, error) => {
        rollback?.();
        options.render(scopes);
        showStatusMessage('error', formatOptionsError(error, options.getCurrentMessages()));
      }
    });
  }
  const actionRuntime = createActionRuntime<PreviewStoreState, PreviewContent>({
    getContext: options.createSchemaContext,
    mutate: (mutator, mutationOptions) => options.mutate(mutator, mutationOptions),
    handlers: createProductionStitchActions({
      getAppData: options.getAppData,
      getCurrentLanguage: options.getCurrentLanguage,
      getDraft: options.getDraft,
      getMessages: options.getCurrentMessages,
      getState: options.getState,
      isActive: () => !disposed,
      setConnectionNotice: options.setConnectionNotice,
      setLanguageResource: options.setLanguageResource,
      runMaintenanceDiagnosis: maintenance.runDiagnosis,
      setState: options.setState,
      activateVaultLocalFolder: storageController.activateVaultLocalFolder,
      applyConnectionNotice: storageController.applyConnectionNotice,
      applyOutputPreset: (name) =>
        applyOutputPresetToDraft({
          draft: options.getDraft(),
          state: options.getState(),
          setDomainMappingRows: (entries) => options.setDomainMappingRows(entries),
          refreshAppData: refresh,
          scheduleDraftSave: () => options.scheduleDraftSave(),
          render: (scope) => options.render(scope),
          name
        }),
      applyTemplateStateToDraft: () =>
        applyTemplateStateToDraft(options.getDraft(), options.getState()),
      ...(changeLanguage ? { changeLanguage } : {}),
      chooseVaultLocalFolder: storageController.chooseVaultLocalFolder,
      clearAnalyticsPrivacyData: (...args) => persistence.clearAnalyticsPrivacyData(...args),
      clearVaultLocalFolder: (...args) => storageController.clearVaultLocalFolder(...args),
      collectDraftWithWidgets: (...args) => widgetHost.collectDraftWithWidgets(...args),
      copyConfigurationToClipboard: (...args) => persistence.copyConfigurationToClipboard(...args),
      currentDomainEntries: () => options.currentDomainEntries(),
      eventButton,
      ensureVaultRouter: (...args) => storageController.ensureVaultRouter(...args),
      importConfigurationWithStatus: (...args) =>
        persistence.importConfigurationWithStatus(...args),
      markWidgetDirty: (...args) => widgetHost.markDirty(...args),
      openResource: (resourceId) => {
        options.openResource(resourceId);
        telemetry.trackResourceOpen(resourceId);
      },
      persistPrivacyPreference: (...args) => persistence.persistPrivacyPreference(...args),
      persistThemePreference: async (theme) => {
        options.getDraft().interfaceTheme = theme;
        await optionsRepository.patch({ path: ['interfaceTheme'], value: theme });
      },
      runPersistenceTask,
      refreshAppData: refresh,
      render: (scopes) => options.render(scopes),
      renderActiveResourceModal: () => options.renderActiveResourceModal(),
      repairConfiguration: async () => {
        try {
          await persistence.repairConfiguration();
          telemetry.trackMaintenanceOutcome('maintenance:repair', 'completed');
        } catch (error) {
          telemetry.trackMaintenanceOutcome('maintenance:repair', 'failed');
          throw error;
        }
      },
      reloadOptions: maintenance.reload,
      resetUsageData: (...args) => persistence.resetUsageData(...args),
      runVaultListConnectionTest: (...args) =>
        storageController.runVaultListConnectionTest(...args),
      scheduleDraftSave: () => options.scheduleDraftSave(),
      scrollToPanel: (panelId) => {
        options.scrollToPanel(panelId);
        telemetry.trackSectionView(panelId);
      },
      syncDomainEntries: (entries) => options.syncDomainEntries(entries),
      syncHighlightThemeControls: () => options.syncHighlightThemeControls(),
      syncModifierControls: () => options.syncModifierControls(),
      syncPreviewThemeControls: () => options.syncPreviewThemeControls(),
      syncRoutingRulesToDraft: (...args) => storageController.syncRoutingRulesToDraft(...args),
      trackExperimentalFeatureToggle: telemetry.trackExperimentalFeatureToggle,
      trackLanguageChanged: telemetry.trackLanguageChanged,
      trackThemeChanged: telemetry.trackThemeChanged,
      updateClassifierField: (field, value) =>
        updateClassifierField(
          options.getDraft(),
          options.getState(),
          () => options.scheduleDraftSave(),
          field,
          value
        ),
      updateDraftPath: (path, value) =>
        updateDraftPath(options.getDraft(), options.getState(), path, value),
      updateVaultField: (...args) => storageController.updateVaultField(...args)
    }),
    onUnhandledAction: () => {
      controller.scheduleAutoSave(() => options.getDraft());
    }
  });

  function dispatch(actionId: string, args: unknown[] = [], value?: unknown, event?: Event): void {
    if (disposed) return;
    const scrollSnapshot = shouldPreserveButtonActionScroll(actionId)
      ? (buttonPressScrollGuard.getSnapshot() ?? captureOptionsScroll(mountRoot))
      : null;
    actionRuntime.dispatch({ id: actionId, args }, value === undefined ? event : value);
    telemetry.trackSynchronousAction(actionId);
    if (scrollSnapshot) {
      restoreOptionsScrollSoon(mountRoot, scrollSnapshot);
    }
  }
  return {
    dispatch,
    dispose: () => {
      disposed = true;
      maintenance.dispose();
    },
    waitForIdle: maintenance.waitForIdle
  };
}
