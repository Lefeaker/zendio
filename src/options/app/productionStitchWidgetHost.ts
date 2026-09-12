import { mergeOptions, omitLegacyRestRootDirFromOptions } from '@shared/config/optionsMerger';
import { YamlConfigEditorWidgetAdapter } from '@options/yaml-config-editor/widgetAdapter';
import type { Messages } from '@i18n';
import type { CompleteOptions } from '@shared/types/options';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';
import type { WidgetFactory } from '@options/schema-runtime/contracts';

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
  getRenderProtectionKeys(): string[];
  markDirty(key: string): void;
  mountWidget(widgetType: string, host: HTMLElement): void;
  reconcileRenderProtection(persistentDirtyPathKeys: readonly string[]): void;
  resetDirty(): void;
}

type ProductionYamlWidget = YamlConfigEditorWidgetAdapter & {
  collect: () => Partial<CompleteOptions>;
};

function createWidget(widgetType: string): ProductionYamlWidget | null {
  return widgetType === 'yaml-config' ? new YamlConfigEditorWidgetAdapter() : null;
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
  const widgetInstances = new Set<ProductionYamlWidget>();
  const dirtyWidgetKeys = new Set<string>();
  const renderProtection = new Map<string, { invalid: boolean }>();

  function collectBaseDraft(): CompleteOptions {
    const draft = options.getDraft();
    const collected: CompleteOptions = {
      ...mergeOptions(draft),
      ...draft
    };
    return applyDisabledExperimentalState(
      omitLegacyRestRootDirFromOptions(collected),
      options.getState()
    );
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
          keys.forEach((key) => {
            dirtyWidgetKeys.add(key);
            renderProtection.set(key, { invalid: meta?.invalid === true });
          });
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
    getRenderProtectionKeys: () => [...renderProtection.keys()],
    markDirty(key) {
      dirtyWidgetKeys.add(key);
      renderProtection.set(key, { invalid: false });
    },
    mountWidget,
    reconcileRenderProtection(persistentDirtyPathKeys) {
      const persistent = new Set(persistentDirtyPathKeys);
      renderProtection.forEach((protection, key) => {
        if (!protection.invalid && !persistent.has(key)) renderProtection.delete(key);
      });
    },
    resetDirty() {
      dirtyWidgetKeys.clear();
      renderProtection.clear();
    }
  };
}
