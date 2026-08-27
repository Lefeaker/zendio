import { buildDiagnosticsReport } from '@options/components/diagnostics';
import { formatOptionsError, showStatusMessage } from '@options/components/messages';
import type { ActionRegistry } from '@options/schema-runtime/actionRuntime';
import type { Language, Messages } from '@i18n';
import type { CompleteOptions, InterfaceTheme } from '@shared/types/options';
import type { ConnectionTestResult } from '@shared/types/connection';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';
import type { VaultRouterConfig } from '@shared/types/vault';
import { persistTheme } from './productionStitchStateMapper';
import { isHighlightTheme } from './stateMapper/themeStateMapper';
import {
  createProductionDomainActions,
  createProductionRoutingActions,
  createProductionStorageActions,
  updateExperimentalBoolean
} from './productionStitchActionGroups';
import { createProductionSelectionTriggerActions } from './productionStitchSelectionTriggerActions';
import type { ClassifierFieldUpdateResult } from './productionStitchShellState';
import type { SectionInvalidationRequest } from '@ui/stitch-runtime/render/sectionInvalidation';
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
  persistThemePreference(theme: InterfaceTheme): Promise<void>;
  runPersistenceTask(key: string, task: () => Promise<void>, capture?: () => () => void): void;
  refreshAppData(): void;
  render(scopes: SectionInvalidationRequest): void;
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
  trackExperimentalFeatureToggle?(featureKey: string, enabled: boolean): void;
  trackLanguageChanged?(language: Language): void;
  trackThemeChanged?(theme: InterfaceTheme): void;
  updateClassifierField(field: string, value: unknown): ClassifierFieldUpdateResult;
  updateDraftPath(path: string, value: unknown): void;
  updateVaultField(index: number, field: string, value: unknown): void;
}
export function createProductionStitchActions(
  ctx: ProductionStitchActionContext
): ActionRegistry<PreviewStoreState, PreviewContent> {
  return {
    ...createProductionRoutingActions(ctx),
    ...createProductionStorageActions(ctx),
    ...createProductionDomainActions(ctx),
    ...createProductionSelectionTriggerActions(ctx),
    'preview:setTheme': ({ value, mutate: update }) => {
      const theme: InterfaceTheme = value === 'light' || value === 'system' ? value : 'dark';
      ctx.runPersistenceTask(
        'options:theme',
        async () => {
          update(
            (next) => {
              next.interfaceThemePreference = theme;
              next.previewTheme = persistTheme(theme);
            },
            { silent: true }
          );
          ctx.syncPreviewThemeControls();
          await ctx.persistThemePreference(theme);
          ctx.trackThemeChanged?.(theme);
        },
        () => {
          const stateTheme = ctx.getState().interfaceThemePreference ?? 'system';
          const draftTheme = ctx.getDraft().interfaceTheme ?? stateTheme;
          return () => {
            const next = ctx.getState();
            next.previewTheme = persistTheme((next.interfaceThemePreference = stateTheme));
            ctx.getDraft().interfaceTheme = draftTheme;
          };
        }
      );
    },
    'preview:setLanguage': ({ value, mutate: update }) => {
      const nextLanguage = String(value || ctx.getCurrentLanguage()) as Language;
      ctx.runPersistenceTask(
        'options:language',
        async () => {
          update((next) => (next.previewLanguage = nextLanguage), { silent: true });
          const nextResource = ctx.changeLanguage
            ? await ctx.changeLanguage(nextLanguage)
            : { messages: ctx.getMessages(), language: nextLanguage };
          ctx.setLanguageResource(nextResource);
          ctx.render('locale-schema');
          ctx.trackLanguageChanged?.(nextLanguage);
        },
        () => {
          const previous = {
            language: ctx.getCurrentLanguage(),
            messages: ctx.getMessages(),
            previewLanguage: ctx.getState().previewLanguage
          };
          return () => {
            ctx.setLanguageResource(previous);
            ctx.getState().previewLanguage = previous.previewLanguage;
          };
        }
      );
    },
    'resource:close': () => {
      ctx.setState({ ...ctx.getState(), activeResource: null });
      ctx.renderActiveResourceModal();
    },
    'resource:open': ({ args }) => ctx.openResource(String(args[0] ?? '')),
    'navigation:scrollToPanel': ({ args }) => ctx.scrollToPanel(String(args[0] ?? 'overview')),
    'navigation:openMainAtPanel': ({ args }) => {
      ctx.setState({ ...ctx.getState(), activeResource: null });
      ctx.renderActiveResourceModal();
      ctx.scrollToPanel(String(args[0] ?? 'overview'));
    },
    'navigation:closeResourceAndScrollToPanel': ({ args }) => {
      ctx.setState({ ...ctx.getState(), activeResource: null });
      ctx.renderActiveResourceModal();
      ctx.scrollToPanel(String(args[0] ?? 'overview'));
    },
    'yaml:setFilter': ({ args }) => {
      ctx.getState().yamlFilter = String(args[0] ?? 'all');
      ctx.render('output');
    },
    'yaml:toggleFieldState': ({ args }) => {
      const field = String(args[0] ?? '');
      const mode = String(args[1] ?? '');
      const key = `${field}:${mode}`;
      const state = ctx.getState();
      state.yamlFieldStates[key] = state.yamlFieldStates[key] === 'On' ? 'Off' : 'On';
      ctx.markWidgetDirty('yamlConfig');
      ctx.scheduleDraftSave();
      ctx.render('output');
    },
    'template:setActiveField': ({ args }) => {
      ctx.getState().activeTemplateField = String(args[0] ?? 'articleVideo');
    },
    'template:updateValue': ({ args, value }) => {
      const field = String(args[0] ?? '');
      if (field) {
        ctx.getState().templateValues[field] = String(value ?? '');
        ctx.applyTemplateStateToDraft();
        ctx.scheduleDraftSave();
      }
    },
    'template:insertToken': ({ value }) => {
      const state = ctx.getState();
      const field = state.activeTemplateField;
      if (field) {
        state.templateValues[field] = `${state.templateValues[field] ?? ''}${String(value ?? '')}`;
        ctx.applyTemplateStateToDraft();
        ctx.scheduleDraftSave();
        ctx.render('output');
      }
    },
    'output:setReadingPathMode': ({ value }) => {
      ctx.getState().readingPathMode = String(value ?? 'custom');
      ctx.applyTemplateStateToDraft();
      ctx.scheduleDraftSave();
      ctx.render('output');
    },
    'output:applyPreset': ({ args }) => ctx.applyOutputPreset(String(args[0] ?? '')),
    'highlight:setTheme': ({ value }) => {
      const draft = ctx.getDraft();
      const highlightTheme = String(value ?? 'gradient');
      draft.readingSession.highlightTheme = isHighlightTheme(highlightTheme)
        ? highlightTheme
        : 'gradient';
      ctx.getState().highlightTheme = draft.readingSession.highlightTheme;
      ctx.scheduleDraftSave();
      ctx.syncHighlightThemeControls();
    },
    'options:updateField': ({ args, value }) => {
      ctx.updateDraftPath(String(args[0] ?? ''), value);
      ctx.scheduleDraftSave();
    },
    'experimental:updateAiConfigField': ({ args, value }) => {
      const field = String(args[0] ?? '');
      if (field === 'provider' || field === 'model' || field === 'apiUrl' || field === 'apiKey') {
        ctx.getDraft().experimentalAi[field] = String(value ?? '');
        ctx.getState().experimentalAiConfig[field] = String(value ?? '');
        ctx.scheduleDraftSave();
      }
    },
    'experimental:setPageSummaryEnabled': () => {
      updateExperimentalBoolean(ctx.getDraft(), ctx.getState(), 'pageSummaryEnabled');
      ctx.trackExperimentalFeatureToggle?.(
        'page_summary_enabled',
        ctx.getState().pageSummaryEnabled
      );
    },
    'experimental:setReadingOverlaySummaryEnabled': () => {
      updateExperimentalBoolean(ctx.getDraft(), ctx.getState(), 'readingOverlaySummaryEnabled');
      ctx.trackExperimentalFeatureToggle?.(
        'reading_overlay_summary_enabled',
        ctx.getState().readingOverlaySummaryEnabled
      );
    },
    'experimental:setSubtitleTranslationEnabled': () => {
      updateExperimentalBoolean(ctx.getDraft(), ctx.getState(), 'subtitleTranslationEnabled');
      ctx.trackExperimentalFeatureToggle?.(
        'subtitle_translation_enabled',
        ctx.getState().subtitleTranslationEnabled
      );
    },
    'experimental:setSubtitleTargetLanguage': () => {
      const state = ctx.getState();
      state.subtitleTargetLanguage =
        ctx.getDraft().subtitleTranslation.targetLanguage || state.subtitleTargetLanguage;
    },
    'overview:clearUsageData': () => {
      ctx.runPersistenceTask('usage:reset', async () => {
        await ctx.resetUsageData();
        ctx.refreshAppData();
        ctx.render('overview-usage');
      });
    },
    'overview:clearAnalyticsData': () => {
      ctx.runPersistenceTask('privacy:clear', async () => {
        await ctx.clearAnalyticsPrivacyData();
        ctx.refreshAppData();
        ctx.render('overview-usage');
      });
    },
    'overview:updatePrivacyConsent': ({ args, value }) => {
      const field = String(args[0] ?? '');
      if (field !== 'analytics' && field !== 'errorReporting' && field !== 'debugMode') {
        return;
      }
      ctx.runPersistenceTask(`privacy:${field}`, async () => {
        await ctx.persistPrivacyPreference(field, Boolean(value));
        ctx.render('overview-usage');
      });
    },
    'maintenance:copyConfig': ({ value }) => {
      ctx.runPersistenceTask('maintenance:copy', () =>
        ctx.copyConfigurationToClipboard(ctx.eventButton(value))
      );
    },
    'maintenance:diagnose': () => {
      ctx.setMaintenanceLog(
        buildDiagnosticsReport(ctx.collectDraftWithWidgets(), ctx.getMessages())
      );
      ctx.refreshAppData();
      ctx.render('maintenance');
    },
    'maintenance:importConfig': ({ value }) => {
      ctx.runPersistenceTask('options:import', () =>
        ctx.importConfigurationWithStatus(ctx.eventButton(value))
      );
    },
    'maintenance:repair': () => {
      ctx.runPersistenceTask('options:repair', () => ctx.repairConfiguration());
    },
    'maintenance:reload': () => {
      ctx.runPersistenceTask('options:reload', () => ctx.reloadOptions());
    },
    'classifier:updateField': ({ args, value }) => {
      const result = ctx.updateClassifierField(String(args[0] ?? ''), value);
      if (!result.success) {
        showStatusMessage('error', formatOptionsError(result.error, ctx.getMessages()));
      }
    }
  };
}
