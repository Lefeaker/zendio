import { createSchemaRenderer } from '@options/schema-runtime/renderer';
import { renderPreviewView, type RendererContext } from '@options/stitch/render/renderStitchView';
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
  let initialRequest = true;
  let owner: SectionInvalidationOwner | null = null;
  const pending = new Set<SectionInvalidationScope>();
  void import('@ui/stitch-runtime/render/sectionInvalidation')
    .then(
      (module) => {
        if (disposed) return;
        owner = module.createSectionInvalidationOwner({
          handlers: options.handlers,
          capture: () => module.captureSectionDomSnapshot(options.mountRoot),
          restore: (snapshot) => module.restoreSectionDomSnapshot(options.mountRoot, snapshot)
        });
        // The canonical owner owns dominance, capture/restore and reentrant error cleanup.
        const requested = [...pending];
        pending.clear();
        if (options.isActive() && requested.length) owner.invalidate(requested);
      },
      () => {
        pending.clear();
        unavailable = true;
        if (!disposed && options.isActive()) options.handlers['all-invariant-recovery']?.();
      }
    )
    .catch((error: unknown) => {
      // Async replay has no render caller to receive an exception. Report it without retrying;
      // a successful import must never be reclassified as an unavailable owner.
      console.error('[ProductionStitchShell:section-invalidation]', error);
    });

  return {
    dispose() {
      disposed = true;
      pending.clear();
      owner?.dispose();
    },
    render(scopes) {
      if (disposed || !options.isActive()) return;
      const requested: SectionInvalidationScope[] =
        typeof scopes === 'string' ? [scopes] : [...scopes];
      if (!requested.length) throw new Error('SECTION_INVALIDATION_SCOPE_REQUIRED');
      requested.forEach((scope) => {
        if (!options.handlers[scope])
          throw new Error(`UNKNOWN_SECTION_INVALIDATION_SCOPE:${scope}`);
      });
      const initializeEmptyRoot =
        initialRequest &&
        requested.length === 1 &&
        requested[0] === 'all-invariant-recovery' &&
        !options.mountRoot.hasChildNodes();
      initialRequest = false;
      if (owner) return owner.invalidate(scopes);
      // Mount constructs an empty shell synchronously; it does not replace an existing panel.
      if (initializeEmptyRoot) return options.handlers['all-invariant-recovery']?.();
      if (unavailable) return options.handlers['all-invariant-recovery']?.();
      // Until the lazy owner is ready, replacing panels would bypass focus/selection restoration.
      requested.forEach((scope) => pending.add(scope));
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
  function createRenderContext(): RendererContext {
    return {
      ...options.createSchemaContext(),
      el,
      ui: previewUi,
      dispatch: (actionId, args, value, event) => options.dispatch(actionId, args, value, event),
      resolveAssetUrl: (path) => options.resolveAssetUrl(path),
      mountWidget: (widgetType, host) => options.widgetHost.mountWidget(widgetType, host)
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
      mutate: (mutator, mutationOptions) =>
        options.mutate(mutator, { ...mutationOptions, scope: 'output' }),
      requestRerender: () => options.render('output'),
      getWidgetFactory: (...args) => options.widgetHost.createWidgetFactory(...args)
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
