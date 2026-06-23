import { createSchemaRenderer } from '@options/schema-runtime/renderer';
import { renderPreviewView } from '@options/stitch/render/renderStitchView';
import { el } from '@options/stitch/ui/dom';
import { previewUi } from '@options/stitch/ui/components';
import type {
  PreviewContent,
  PreviewStoreState,
  SchemaContext,
  ViewSchema
} from '@options/stitch/types';
import type { ProductionStitchWidgetHost } from './productionStitchWidgetHost';
import type { ProductionStitchRenderLifecycle } from './productionStitchRenderLifecycleTypes';
import type { ProductionStitchAssetUrlResolver } from './productionStitchAssetUrlResolver';

interface ProductionStitchShellSchemaRendererOptions {
  createSchemaContext(): SchemaContext;
  dispatch(actionId: string, args?: unknown[], value?: unknown, event?: Event): void;
  mutate(mutator: (draftState: PreviewStoreState) => void, options?: { silent?: boolean }): void;
  render(): void;
  resolveAssetUrl: ProductionStitchAssetUrlResolver;
  widgetHost: ProductionStitchWidgetHost;
}

export function createProductionStitchShellSchemaRenderer(
  options: ProductionStitchShellSchemaRendererOptions
) {
  function createRenderContext() {
    return {
      ...options.createSchemaContext(),
      el,
      ui: previewUi,
      dispatch: (actionId: string, args?: unknown[], value?: unknown, event?: Event) =>
        options.dispatch(actionId, args, value, event),
      resolveAssetUrl: options.resolveAssetUrl,
      mountWidget: (widgetType: string, host: HTMLElement) =>
        options.widgetHost.mountWidget(widgetType, host)
    };
  }

  return createSchemaRenderer<PreviewStoreState, PreviewContent>(
    {
      getContext: () => options.createSchemaContext(),
      dispatch: (action, payload) => {
        if (typeof action === 'string') {
          options.dispatch(action, [], payload);
          return;
        }
        options.dispatch(action.id, action.args ?? [], payload);
      },
      mutate: (mutator, mutationOptions) => options.mutate(mutator, mutationOptions),
      requestRerender: () => options.render(),
      getWidgetFactory: (widgetType) => options.widgetHost.createWidgetFactory(widgetType)
    },
    {
      renderView: (view) => renderPreviewView(view as ViewSchema, createRenderContext())
    }
  );
}

export function createProductionStitchRenderDelegates(
  getRenderLifecycle: () => ProductionStitchRenderLifecycle | null
): ProductionStitchRenderLifecycle {
  return {
    applySystemThemePreferenceChange: () =>
      getRenderLifecycle()?.applySystemThemePreferenceChange(),
    cleanup: () => getRenderLifecycle()?.cleanup(),
    openResource: (resourceId) => getRenderLifecycle()?.openResource(resourceId),
    render: () => getRenderLifecycle()?.render(),
    renderActiveResourceModal: () => getRenderLifecycle()?.renderActiveResourceModal(),
    scrollToPanel: (panelId) => getRenderLifecycle()?.scrollToPanel(panelId),
    syncHighlightThemeControls: () => getRenderLifecycle()?.syncHighlightThemeControls(),
    syncModifierControls: () => getRenderLifecycle()?.syncModifierControls(),
    syncPreviewThemeControls: () => getRenderLifecycle()?.syncPreviewThemeControls()
  };
}
