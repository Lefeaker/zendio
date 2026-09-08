import {
  buildAppShell,
  buildPanelStack,
  buildScrollSection,
  buildSidebar
} from '@options/stitch/render/shellBuilders';
import { renderPreviewView, type RendererContext } from '@options/stitch/render/renderStitchView';
import { clear, el } from '@ui/stitch-runtime';
import type { SectionInvalidationRequest } from '@ui/stitch-runtime/render/sectionInvalidation';
import { previewUi } from '@options/stitch/ui/components';
import { RUNTIME_SURFACE_RESOURCE_IDS } from './productionStitchStateMapper';
import { setScrollTopImmediately } from './productionStitchScrollGuard';
import { createProductionStitchRenderControls } from './productionStitchRenderControls';
import { installLocalFolderDismissal } from './productionStitchLocalFolderDismissal';
import {
  createProductionStitchInvalidationBridge,
  type ProductionStitchSectionHandlers
} from './productionStitchShellRenderDelegates';
import type {
  ProductionStitchRenderLifecycle,
  ProductionStitchRenderLifecycleOptions,
  ProductionStitchTestAssets
} from './productionStitchRenderLifecycleTypes';
import {
  createProductionStitchMobileNavigation,
  syncProductionNavigationActiveLinks
} from './productionStitchMobileNavigation';

export function createProductionStitchRenderLifecycle(
  options: ProductionStitchRenderLifecycleOptions
): ProductionStitchRenderLifecycle {
  const testAssets = (
    globalThis as typeof globalThis & {
      __AIIINOB_TEST_STITCH_ASSETS__?: ProductionStitchTestAssets;
    }
  ).__AIIINOB_TEST_STITCH_ASSETS__;
  const getFooterMeta: NonNullable<ProductionStitchRenderLifecycleOptions['getFooterMeta']> =
    options.getFooterMeta ?? testAssets?.getFooterMeta ?? (() => null);
  const getFooterView: NonNullable<ProductionStitchRenderLifecycleOptions['getFooterView']> =
    options.getFooterView ?? testAssets?.getFooterView ?? (() => null);
  const getSettingsView: NonNullable<ProductionStitchRenderLifecycleOptions['getSettingsView']> =
    options.getSettingsView ?? testAssets?.getSettingsView ?? (() => null);
  const { mountRoot } = options;
  const getState = () => options.getState();
  const setState: ProductionStitchRenderLifecycleOptions['setState'] = (state) =>
    options.setState(state);
  const controls = createProductionStitchRenderControls({
    mountRoot,
    getState
  });
  const mobileNavigation = createProductionStitchMobileNavigation(mountRoot);
  const folderDismissal = installLocalFolderDismissal(mountRoot, getState, setState, () =>
    render('storage')
  );
  const syncActiveLinks = (): void => syncProductionNavigationActiveLinks(mountRoot, getState());
  const handlers: ProductionStitchSectionHandlers = {
    theme: controls.syncPreviewThemeControls,
    sidebar: syncActiveLinks,
    'resource-modal': renderActiveResourceModal,
    'overview-usage': () => {
      replacePanel('overview');
      renderUsageChart();
    },
    storage: () => replacePanel('storage'),
    'capture-sources': () => replacePanel('capture-sources'),
    'capture-behavior': () => {
      replacePanel('capture-behavior');
      controls.syncHighlightThemeControls();
      controls.syncModifierControls();
    },
    output: () => replacePanel('output'),
    maintenance: () => replacePanel('maintenance'),
    'locale-schema': renderAll,
    'all-invariant-recovery': renderAll
  };
  let disposed = false;
  const invalidation = createProductionStitchInvalidationBridge({
    handlers,
    isActive: () => !disposed,
    mountRoot
  });
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

  function renderSidebar(): HTMLElement {
    const context = options.createSchemaContext();
    const state = getState();
    return buildSidebar({
      el,
      brand: {
        ...context.appData.brand,
        logo: options.resolveAssetUrl(context.appData.brand.logo)
      },
      settingsTitle: '',
      resourcesTitle: '',
      runtimeTitle: '',
      navItems: context.appData.nav,
      sidebarLinks: context.appData.sidebarLinks,
      surfaceLinks: [],
      activePanel: state.activePanel,
      activeResource: state.activeResource,
      onPanelClick: scrollToPanel,
      onFooterClick: openResource
    });
  }

  function renderSection(panelId: string): HTMLElement {
    const view = getSettingsView(panelId, options.createSchemaContext());
    const content = view ? options.schemaRenderer.renderView(view as never) : el('div');
    return buildScrollSection({ el, panelId, content });
  }

  function renderUsageChart(): void {
    const chartHost = mountRoot.querySelector<HTMLElement>('[data-role="usage-chart-shell"]');
    if (chartHost) previewUi.renderUsageChart(chartHost, options.getAppData().overview.history);
  }

  function renderAll(): void {
    mobileNavigation.close({ restoreFocus: false });
    options.widgetHost.flushDirtyWidgets();
    options.widgetHost.destroyWidgets();
    clear(mountRoot).append(
      buildAppShell({
        el,
        sidebar: renderSidebar(),
        panelStack: buildPanelStack({ el, items: options.getAppData().nav, renderSection })
      })
    );
    mobileNavigation.bind(options.createSchemaContext());
    const main = mountRoot.querySelector<HTMLElement>('.main');
    if (main) bindScrollSync(main);
    renderUsageChart();
    controls.syncPreviewThemeControls();
    controls.syncHighlightThemeControls();
    controls.syncModifierControls();
    renderActiveResourceModal();
  }

  function replacePanel(panelId: string): void {
    if (panelId === 'output') {
      options.widgetHost.flushDirtyWidgets();
      options.widgetHost.destroyWidgets();
    }
    const panel = mountRoot.querySelector(`[data-panel-id="${panelId}"]`);
    if (!panel) return render('all-invariant-recovery');
    panel.replaceWith(renderSection(panelId));
  }
  const render = (scopes: SectionInvalidationRequest): void => {
    invalidation.render(scopes);
  };
  function openResource(resourceId: string): void {
    if (RUNTIME_SURFACE_RESOURCE_IDS.has(resourceId)) return;
    const meta = getFooterMeta(resourceId);
    if (!meta) return;
    if (meta.openMode === 'page') {
      const href = resourceId === 'onboarding' ? '../onboarding/index.html' : meta.href;
      options.setState({ ...getState(), activeResource: null });
      window.open(href ?? `./${resourceId}.html`, '_blank', 'noopener,noreferrer');
      syncActiveLinks();
      mobileNavigation.completePageResourceActivation();
      return;
    }
    options.setState({
      ...getState(),
      activeResource: resourceId
    });
    renderActiveResourceModal();
    mobileNavigation.completeModalResourceActivation();
  }

  function renderActiveResourceModal(): void {
    const hadModal = Boolean(mountRoot.querySelector('.resource-modal-overlay'));
    mountRoot.querySelectorAll('.resource-modal-overlay').forEach((modal) => modal.remove());
    const state = getState();
    syncActiveLinks();
    if (!state.activeResource) {
      if (hadModal) mobileNavigation.restoreAfterModalClose();
      return;
    }
    const view = getFooterView(state.activeResource, options.createSchemaContext());
    const modal = view ? renderPreviewView(view, createRenderContext()) : null;
    const host = mountRoot.querySelector<HTMLElement>('[data-modal-host="true"]');
    if (modal && !host) return render('all-invariant-recovery');
    if (modal) host?.append(modal);
  }

  function scrollToPanel(panelId: string): void {
    options.setState({
      ...getState(),
      activePanel: panelId
    });
    const main = mountRoot.querySelector<HTMLElement>('.main');
    const section = mountRoot.querySelector<HTMLElement>(`[data-panel-id="${panelId}"]`);
    if (main && section) {
      const top = Math.max(section.offsetTop - 12, 0);
      setScrollTopImmediately(main, top);
    }
    syncActiveLinks();
    mobileNavigation.completeSectionActivation(panelId);
  }

  function bindScrollSync(main: HTMLElement): void {
    main.addEventListener(
      'scroll',
      () => {
        const sections = Array.from(
          mountRoot.querySelectorAll<HTMLElement>('[data-scroll-section="true"]')
        );
        const threshold = main.scrollTop + 120;
        let nextActive = sections[0]?.dataset.panelId ?? getState().activePanel;
        sections.forEach((section) => {
          if (section.offsetTop <= threshold) {
            nextActive = section.dataset.panelId ?? nextActive;
          }
        });
        if (nextActive !== getState().activePanel) {
          options.setState({
            ...getState(),
            activePanel: nextActive
          });
          syncActiveLinks();
        }
      },
      { passive: true }
    );
  }

  return {
    applySystemThemePreferenceChange: controls.applySystemThemePreferenceChange,
    cleanup: () => {
      disposed = true;
      invalidation.dispose();
      folderDismissal.cleanup();
      mobileNavigation.cleanup();
    },
    openResource,
    render,
    renderAndWait: (scopes) => invalidation.renderAndWait(scopes),
    renderActiveResourceModal,
    scrollToPanel,
    syncHighlightThemeControls: controls.syncHighlightThemeControls,
    syncModifierControls: controls.syncModifierControls,
    syncPreviewThemeControls: controls.syncPreviewThemeControls
  };
}
