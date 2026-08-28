import { createSchemaRenderer } from '@options/schema-runtime/renderer';
import { renderPreviewView } from '@options/stitch/render/renderStitchView';
import { el } from '@ui/stitch-runtime';
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
import type {
  SectionInvalidationOwner,
  SectionInvalidationRequest,
  SectionInvalidationScope
} from '@ui/stitch-runtime/render/sectionInvalidation';

export type ProductionStitchSectionHandlers = Partial<Record<SectionInvalidationScope, () => void>>;

export function createProductionStitchInvalidationBridge(options: {
  handlers: ProductionStitchSectionHandlers;
  isActive(): boolean;
  mountRoot: HTMLElement;
}): { dispose(): void; render(scopes: SectionInvalidationRequest): void } {
  let disposed = false;
  let unavailable = false;
  let owner: SectionInvalidationOwner | null = null;
  void import('@ui/stitch-runtime/render/sectionInvalidation')
    .then((module) => {
      if (!disposed)
        owner = module.createSectionInvalidationOwner({
          handlers: options.handlers,
          capture: () => module.captureSectionDomSnapshot(options.mountRoot),
          restore: (snapshot) => module.restoreSectionDomSnapshot(options.mountRoot, snapshot)
        });
    })
    .catch(() => {
      unavailable = true;
      if (options.isActive()) options.handlers['all-invariant-recovery']?.();
    });

  return {
    dispose() {
      disposed = true;
      owner?.dispose();
    },
    render(scopes) {
      if (!options.isActive()) return;
      const requested: SectionInvalidationScope[] =
        typeof scopes === 'string' ? [scopes] : [...scopes];
      requested.forEach((scope) => {
        if (!options.handlers[scope])
          throw new Error(`UNKNOWN_SECTION_INVALIDATION_SCOPE:${scope}`);
      });
      if (owner) return owner.invalidate(scopes);
      const dominant = requested.includes('all-invariant-recovery')
        ? 'all-invariant-recovery'
        : requested.includes('locale-schema')
          ? 'locale-schema'
          : null;
      const toApply: SectionInvalidationScope[] = unavailable
        ? ['all-invariant-recovery']
        : dominant
          ? [dominant]
          : requested;
      toApply.forEach((scope) => options.handlers[scope]?.());
    }
  };
}

interface ProductionStitchShellSchemaRendererOptions {
  createSchemaContext(): SchemaContext;
  dispatch(actionId: string, args?: unknown[], value?: unknown, event?: Event): void;
  mutate(
    mutator: (draftState: PreviewStoreState) => void,
    options?: { silent?: boolean; scope?: SectionInvalidationScope }
  ): void;
  render(scopes: SectionInvalidationRequest): void;
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
      dispatch: options.dispatch,
      resolveAssetUrl: options.resolveAssetUrl,
      mountWidget: options.widgetHost.mountWidget
    };
  }

  return createSchemaRenderer<PreviewStoreState, PreviewContent>(
    {
      getContext: options.createSchemaContext,
      dispatch: (action, payload) => {
        if (typeof action === 'string') {
          options.dispatch(action, [], payload);
          return;
        }
        options.dispatch(action.id, action.args ?? [], payload);
      },
      mutate: (mutator, mutationOptions) =>
        options.mutate(mutator, { ...mutationOptions, scope: 'output' }),
      requestRerender: () => options.render('output'),
      getWidgetFactory: options.widgetHost.createWidgetFactory
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
    render: (scopes) => getRenderLifecycle()?.render(scopes),
    renderActiveResourceModal: () => getRenderLifecycle()?.renderActiveResourceModal(),
    scrollToPanel: (panelId) => getRenderLifecycle()?.scrollToPanel(panelId),
    syncHighlightThemeControls: () => getRenderLifecycle()?.syncHighlightThemeControls(),
    syncModifierControls: () => getRenderLifecycle()?.syncModifierControls(),
    syncPreviewThemeControls: () => getRenderLifecycle()?.syncPreviewThemeControls()
  };
}
