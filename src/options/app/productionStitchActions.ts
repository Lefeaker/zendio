import { buildDiagnosticsReport } from '@options/components/diagnostics';
import type { ActionRegistry } from '@options/schema-runtime/actionRuntime';
import type { Language, Messages } from '@i18n';
import type { CompleteOptions, InterfaceTheme } from '@shared/types/options';
import type { ConnectionTestResult } from '@shared/types/connection';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';
import type { VaultRouterConfig } from '@shared/types/vault';
import { optionsFromModifierLabels, persistTheme } from './productionStitchStateMapper';
import {
  createProductionDomainActions,
  createProductionRoutingActions,
  createProductionStorageActions,
  updateExperimentalBoolean
} from './productionStitchActionGroups';

export interface ProductionStitchActionContext {
  getAppData(): PreviewContent;
  getCurrentLanguage(): Language;
  getDraft(): CompleteOptions;
  getMessages(): Messages | null;
  getState(): PreviewStoreState;
  setConnectionNotice(notice: PreviewContent['storage']['connectionNotice']): void;
  setLanguageResource(resource: { messages: Messages | null; language: Language }): void;
  setMaintenanceLog(log: string): void;
  setState(state: PreviewStoreState): void;
  activateVaultLocalFolder(index: number): Promise<void>;
  applyConnectionNotice(result: ConnectionTestResult): void;
  applyOutputPreset(name: string): void;
  applyTemplateStateToDraft(): void;
  changeLanguage?: (
    language: Language
  ) => Promise<{ messages: Messages | null; language: Language }>;
  chooseVaultLocalFolder(index: number): Promise<void>;
  clearAnalyticsPrivacyData(): Promise<void>;
  clearVaultLocalFolder(index: number): void;
  collectDraftWithWidgets(): CompleteOptions;
  copyConfigurationToClipboard(button: HTMLButtonElement | null): Promise<void>;
  currentDomainEntries(): Array<[string, string]>;
  eventButton(value: unknown): HTMLButtonElement | null;
  ensureVaultRouter(): VaultRouterConfig;
  importConfigurationWithStatus(button: HTMLButtonElement | null): Promise<void>;
  markWidgetDirty(key: string): void;
  openResource(resourceId: string): void;
  persistPrivacyPreference(
    field: 'analytics' | 'errorReporting' | 'debugMode',
    value: boolean
  ): Promise<void>;
  persistThemePreference(theme: InterfaceTheme): void;
  refreshAppData(): void;
  render(): void;
  renderActiveResourceModal(): void;
  repairConfiguration(): Promise<void>;
  reloadOptions(): Promise<void>;
  resetUsageData(): Promise<void>;
  runVaultListConnectionTest(): Promise<ConnectionTestResult>;
  scheduleDraftSave(): void;
  scrollToPanel(panelId: string): void;
  syncDomainEntries(entries: Array<[string, string]>): void;
  syncHighlightThemeControls(): void;
  syncModifierControls(): void;
  syncPreviewThemeControls(): void;
  syncRoutingRulesToDraft(): void;
  updateClassifierField(field: string, value: unknown): void;
  updateDraftPath(path: string, value: unknown): void;
  updateVaultField(index: number, field: string, value: unknown): void;
}

export function createProductionStitchActions(
  context: ProductionStitchActionContext
): ActionRegistry<PreviewStoreState, PreviewContent> {
  return {
    ...createProductionRoutingActions(context),
    ...createProductionStorageActions(context),
    ...createProductionDomainActions(context),
    'preview:setTheme': ({ value, mutate: update }) => {
      const theme: InterfaceTheme = value === 'light' || value === 'system' ? value : 'dark';
      update(
        (next) => {
          next.interfaceThemePreference = theme;
          next.previewTheme = persistTheme(theme);
        },
        { silent: true }
      );
      context.persistThemePreference(theme);
      context.syncPreviewThemeControls();
    },
    'preview:setLanguage': ({ value, mutate: update }) => {
      const nextLanguage = String(value || context.getCurrentLanguage()) as Language;
      update(
        (next) => {
          next.previewLanguage = nextLanguage;
        },
        { silent: true }
      );
      void (async () => {
        if (context.changeLanguage) {
          const nextResource = await context.changeLanguage(nextLanguage);
          context.setLanguageResource(nextResource);
        } else {
          context.setLanguageResource({
            messages: context.getMessages(),
            language: nextLanguage
          });
        }
        context.render();
      })();
    },
    'resource:close': () => {
      context.setState({ ...context.getState(), activeResource: null });
      context.renderActiveResourceModal();
    },
    'resource:open': ({ args }) => {
      context.openResource(String(args[0] ?? ''));
    },
    'navigation:scrollToPanel': ({ args }) => {
      context.scrollToPanel(String(args[0] ?? 'overview'));
    },
    'navigation:openMainAtPanel': ({ args }) => {
      context.setState({ ...context.getState(), activeResource: null });
      context.renderActiveResourceModal();
      context.scrollToPanel(String(args[0] ?? 'overview'));
    },
    'navigation:closeResourceAndScrollToPanel': ({ args }) => {
      context.setState({ ...context.getState(), activeResource: null });
      context.renderActiveResourceModal();
      context.scrollToPanel(String(args[0] ?? 'overview'));
    },
    'yaml:setFilter': ({ args }) => {
      context.getState().yamlFilter = String(args[0] ?? 'all');
      context.render();
    },
    'yaml:toggleFieldState': ({ args }) => {
      const field = String(args[0] ?? '');
      const mode = String(args[1] ?? '');
      const key = `${field}:${mode}`;
      const state = context.getState();
      state.yamlFieldStates[key] = state.yamlFieldStates[key] === 'On' ? 'Off' : 'On';
      context.markWidgetDirty('yamlConfig');
      context.scheduleDraftSave();
      context.render();
    },
    'template:setActiveField': ({ args }) => {
      context.getState().activeTemplateField = String(args[0] ?? 'articleVideo');
    },
    'template:updateValue': ({ args, value }) => {
      const field = String(args[0] ?? '');
      if (field) {
        context.getState().templateValues[field] = String(value ?? '');
        context.applyTemplateStateToDraft();
        context.scheduleDraftSave();
      }
    },
    'template:insertToken': ({ value }) => {
      const state = context.getState();
      const field = state.activeTemplateField;
      if (field) {
        state.templateValues[field] = `${state.templateValues[field] ?? ''}${String(value ?? '')}`;
        context.applyTemplateStateToDraft();
        context.scheduleDraftSave();
        context.render();
      }
    },
    'output:setReadingPathMode': ({ value }) => {
      context.getState().readingPathMode = String(value ?? 'custom');
      context.applyTemplateStateToDraft();
      context.scheduleDraftSave();
      context.render();
    },
    'output:applyPreset': ({ args }) => {
      context.applyOutputPreset(String(args[0] ?? ''));
    },
    'highlight:setTheme': ({ value }) => {
      const draft = context.getDraft();
      draft.readingSession.highlightTheme = String(
        value ?? 'gradient'
      ) as CompleteOptions['readingSession']['highlightTheme'];
      context.getState().highlightTheme = draft.readingSession.highlightTheme;
      context.scheduleDraftSave();
      context.syncHighlightThemeControls();
    },
    'modifier:setEnabled': ({ value }) => {
      const draft = context.getDraft();
      const state = context.getState();
      const enabled = Boolean(value);
      draft.fragmentClipper.selectionModifierEnabled = enabled;
      state.fragmentModifierEnabled = enabled;
      if (!enabled) {
        draft.fragmentClipper.selectionModifierKeys = [];
        state.modifierKeys = [];
      } else if (!state.modifierKeys.length) {
        state.modifierKeys = ['Alt'];
        draft.fragmentClipper.selectionModifierKeys = ['alt'];
      }
      context.scheduleDraftSave();
      context.syncModifierControls();
    },
    'modifier:toggleKey': ({ value }) => {
      const draft = context.getDraft();
      const state = context.getState();
      const key = String(value ?? '');
      state.modifierKeys = state.modifierKeys.includes(key)
        ? state.modifierKeys.filter((item) => item !== key)
        : [...state.modifierKeys, key];
      state.fragmentModifierEnabled = state.modifierKeys.length > 0;
      draft.fragmentClipper.selectionModifierEnabled = state.fragmentModifierEnabled;
      draft.fragmentClipper.selectionModifierKeys = optionsFromModifierLabels(state.modifierKeys);
      context.scheduleDraftSave();
      context.syncModifierControls();
    },
    'options:updateField': ({ args, value }) => {
      context.updateDraftPath(String(args[0] ?? ''), value);
      context.scheduleDraftSave();
    },
    'experimental:updateAiConfigField': ({ args, value }) => {
      const field = String(args[0] ?? '') as keyof CompleteOptions['experimentalAi'];
      if (field) {
        context.getDraft().experimentalAi[field] = String(value ?? '');
        context.getState().experimentalAiConfig[field] = String(value ?? '');
        context.scheduleDraftSave();
      }
    },
    'experimental:setPageSummaryEnabled': () => {
      updateExperimentalBoolean(context.getDraft(), context.getState(), 'pageSummaryEnabled');
    },
    'experimental:setReadingOverlaySummaryEnabled': () => {
      updateExperimentalBoolean(
        context.getDraft(),
        context.getState(),
        'readingOverlaySummaryEnabled'
      );
    },
    'experimental:setSubtitleTranslationEnabled': () => {
      updateExperimentalBoolean(
        context.getDraft(),
        context.getState(),
        'subtitleTranslationEnabled'
      );
    },
    'experimental:setSubtitleTargetLanguage': () => {
      const state = context.getState();
      state.subtitleTargetLanguage =
        context.getDraft().subtitleTranslation.targetLanguage || state.subtitleTargetLanguage;
    },
    'overview:clearUsageData': () => {
      void context.resetUsageData().finally(() => {
        context.refreshAppData();
        context.render();
      });
    },
    'overview:clearAnalyticsData': () => {
      void context.clearAnalyticsPrivacyData().finally(() => {
        context.refreshAppData();
        context.render();
      });
    },
    'overview:updatePrivacyConsent': ({ args, value }) => {
      const field = String(args[0] ?? '') as 'analytics' | 'errorReporting' | 'debugMode';
      if (!['analytics', 'errorReporting', 'debugMode'].includes(field)) {
        return;
      }
      void context.persistPrivacyPreference(field, Boolean(value)).finally(() => context.render());
    },
    'maintenance:copyConfig': ({ value }) => {
      void context.copyConfigurationToClipboard(context.eventButton(value));
    },
    'maintenance:diagnose': () => {
      context.setMaintenanceLog(buildDiagnosticsReport(context.collectDraftWithWidgets()));
      context.refreshAppData();
      context.render();
    },
    'maintenance:importConfig': ({ value }) => {
      void context.importConfigurationWithStatus(context.eventButton(value));
    },
    'maintenance:repair': () => {
      void context.repairConfiguration();
    },
    'maintenance:reload': () => {
      void context.reloadOptions();
    },
    'classifier:updateField': ({ args, value }) => {
      context.updateClassifierField(String(args[0] ?? ''), value);
    }
  };
}
