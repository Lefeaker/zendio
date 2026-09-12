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
  SectionInvalidationAcknowledgement,
  SectionInvalidationFailure,
  SectionInvalidationOwner,
  SectionInvalidationRequest,
  SectionInvalidationScope
} from '@ui/stitch-runtime/render/sectionInvalidation';

export type ProductionStitchSectionHandlers = Partial<Record<SectionInvalidationScope, () => void>>;

export function createProductionStitchInvalidationBridge(options: {
  handlers: ProductionStitchSectionHandlers;
  isActive(): boolean;
  mountRoot: HTMLElement;
}): {
  dispose(): void;
  render(scopes: SectionInvalidationRequest): void;
  renderAndWait(scopes: SectionInvalidationRequest): Promise<SectionInvalidationAcknowledgement>;
} {
  let disposed = false;
  let unavailable = false;
  let initialRequest = true;
  let pendingFireAndForget = false;
  let owner: SectionInvalidationOwner | null = null;
  const pending = new Set<SectionInvalidationScope>();
  const waiters = new Set<(result: SectionInvalidationAcknowledgement) => void>();

  function validate(scopes: SectionInvalidationRequest): SectionInvalidationScope[] {
    const requested = typeof scopes === 'string' ? [scopes] : [...scopes];
    if (!requested.length) throw new Error('SECTION_INVALIDATION_SCOPE_REQUIRED');
    requested.forEach((scope) => {
      if (!options.handlers[scope]) throw new Error(`UNKNOWN_SECTION_INVALIDATION_SCOPE:${scope}`);
    });
    return requested;
  }

  function settlePending(result: SectionInvalidationAcknowledgement): void {
    waiters.forEach((resolve) => resolve(result));
    waiters.clear();
  }

  function fallback(): SectionInvalidationAcknowledgement {
    try {
      options.handlers['all-invariant-recovery']?.();
      return disposed || !options.isActive() ? { status: 'cancelled' } : { status: 'rendered' };
    } catch (error) {
      return { status: 'failed', error: error as SectionInvalidationFailure };
    }
  }

  function queue(requested: readonly SectionInvalidationScope[]): void {
    requested.forEach((scope) => pending.add(scope));
  }

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
        const reportFailure = pendingFireAndForget;
        pendingFireAndForget = false;
        if (!options.isActive()) return settlePending({ status: 'cancelled' });
        if (!requested.length) return;
        void owner.invalidateAndWait(requested).then((result) => {
          settlePending(result);
          if (reportFailure && result.status === 'failed')
            console.error('[ProductionStitchShell:section-invalidation]', result.error);
        });
      },
      () => {
        pending.clear();
        unavailable = true;
        const reportFailure = pendingFireAndForget;
        pendingFireAndForget = false;
        if (disposed || !options.isActive()) return settlePending({ status: 'cancelled' });
        const result = fallback();
        settlePending(result);
        if (reportFailure && result.status === 'failed') throw result.error;
      }
    )
    .catch((error: unknown) => {
      // Async replay has no render caller to receive an exception. Report it without retrying;
      // a successful import must never be reclassified as an unavailable owner.
      settlePending({ status: 'failed', error: error as SectionInvalidationFailure });
      console.error('[ProductionStitchShell:section-invalidation]', error);
    });

  return {
    dispose() {
      disposed = true;
      pending.clear();
      pendingFireAndForget = false;
      settlePending({ status: 'cancelled' });
      owner?.dispose();
    },
    render(scopes) {
      if (disposed || !options.isActive()) return;
      const requested = validate(scopes);
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
      pendingFireAndForget = true;
      queue(requested);
    },
    renderAndWait(scopes) {
      const requested = validate(scopes);
      if (disposed || !options.isActive()) return Promise.resolve({ status: 'cancelled' });
      const initializeEmptyRoot =
        initialRequest &&
        requested.length === 1 &&
        requested[0] === 'all-invariant-recovery' &&
        !options.mountRoot.hasChildNodes();
      initialRequest = false;
      if (owner) return owner.invalidateAndWait(requested);
      if (initializeEmptyRoot || unavailable) return Promise.resolve(fallback());
      queue(requested);
      return new Promise((resolve) => waiters.add(resolve));
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
    renderAndWait: (scopes) =>
      getRenderLifecycle()?.renderAndWait(scopes) ?? Promise.resolve({ status: 'cancelled' }),
    renderActiveResourceModal: () => getRenderLifecycle()?.renderActiveResourceModal(),
    scrollToPanel: (panelId) => getRenderLifecycle()?.scrollToPanel(panelId),
    syncHighlightThemeControls: () => getRenderLifecycle()?.syncHighlightThemeControls(),
    syncModifierControls: () => getRenderLifecycle()?.syncModifierControls(),
    syncPreviewThemeControls: () => getRenderLifecycle()?.syncPreviewThemeControls()
  };
}
