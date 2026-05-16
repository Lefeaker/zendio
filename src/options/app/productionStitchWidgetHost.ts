import { mergeOptions } from '@shared/config/optionsMerger';
import { YamlConfigWidget } from '@options/widgets/YamlConfigWidget';
import type { Messages } from '@i18n';
import type { CompleteOptions } from '@shared/types/options';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';
import type { WidgetFactory } from '@options/schema-runtime/contracts';
import type { WidgetMountContract as OptionsWidgetMountContract } from '@options/widgets/contracts';

interface ProductionStitchWidgetHostOptions {
  getDraft(): CompleteOptions;
  getState(): PreviewStoreState;
  getMessages(): Messages | null;
  ensureVaultRouter(): void;
  mergePartialIntoDraft(partial: Partial<CompleteOptions>): void;
  syncDefaultVaultFromRest(): void;
  refreshAppData(): void;
  scheduleDraftSave(): void;
}

export interface ProductionStitchWidgetHost {
  collectDraftWithWidgets(): CompleteOptions;
  createWidgetFactory(widgetType: string): WidgetFactory<PreviewStoreState, PreviewContent> | null;
  destroyWidgets(): void;
  flushDirtyWidgets(): void;
  markDirty(key: string): void;
  mountWidget(widgetType: string, host: HTMLElement): void;
  resetDirty(): void;
}

function createWidget(
  widgetType: string
): OptionsWidgetMountContract<Record<string, unknown>, Partial<CompleteOptions>> | null {
  return widgetType === 'yaml-config'
    ? (new YamlConfigWidget() as OptionsWidgetMountContract<
        Record<string, unknown>,
        Partial<CompleteOptions>
      >)
    : null;
}

function applyDisabledExperimentalState(
  collected: CompleteOptions,
  state: PreviewStoreState
): CompleteOptions {
  collected.pageSummary.enabled = false;
  collected.readingOverlaySummary.enabled = false;
  collected.subtitleTranslation.enabled = false;
  collected.interfaceTheme = state.interfaceThemePreference ?? state.previewTheme;
  return collected;
}

export function createProductionStitchWidgetHost(
  options: ProductionStitchWidgetHostOptions
): ProductionStitchWidgetHost {
  const widgetInstances = new Set<
    OptionsWidgetMountContract<Record<string, unknown>, Partial<CompleteOptions>>
  >();
  const dirtyWidgetKeys = new Set<string>();

  function collectBaseDraft(): CompleteOptions {
    const draft = options.getDraft();
    const collected = {
      ...mergeOptions(draft),
      ...draft
    } as CompleteOptions;
    return applyDisabledExperimentalState(collected, options.getState());
  }

  function collectDraftWithWidgets(): CompleteOptions {
    if (!options.getDraft().vaultRouter?.vaults?.length) {
      options.ensureVaultRouter();
    }
    if (!dirtyWidgetKeys.size) {
      return collectBaseDraft();
    }
    widgetInstances.forEach((widget) => {
      const partial = widget.collect?.();
      if (partial) {
        options.mergePartialIntoDraft(partial);
      }
    });
    options.syncDefaultVaultFromRest();
    dirtyWidgetKeys.clear();
    options.refreshAppData();
    return collectBaseDraft();
  }

  function flushDirtyWidgets(): void {
    if (dirtyWidgetKeys.size) {
      collectDraftWithWidgets();
    }
  }

  function destroyWidgets(): void {
    widgetInstances.forEach((widget) => {
      widget.destroy();
    });
    widgetInstances.clear();
  }

  function mountWidget(widgetType: string, host: HTMLElement): void {
    const widget = createWidget(widgetType);
    if (!widget) {
      host.textContent = `[Missing widget] ${widgetType}`;
      return;
    }
    widgetInstances.add(widget);
    widget.mount(
      host,
      { options: options.getDraft(), messages: options.getMessages() },
      {
        notifyDirty: (keys = [], meta) => {
          keys.forEach((key) => dirtyWidgetKeys.add(key));
          if (meta?.invalid) {
            options.refreshAppData();
            return;
          }
          options.scheduleDraftSave();
        },
        reportError: (scope, error) => {
          console.error(`[ProductionStitchShell:${scope}]`, error);
        }
      }
    );
  }

  return {
    collectDraftWithWidgets,
    createWidgetFactory(widgetType) {
      if (widgetType !== 'yaml-config') {
        return null;
      }
      return () => createWidget(widgetType) as never;
    },
    destroyWidgets,
    flushDirtyWidgets,
    markDirty(key) {
      dirtyWidgetKeys.add(key);
    },
    mountWidget,
    resetDirty() {
      dirtyWidgetKeys.clear();
    }
  };
}
