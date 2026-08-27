import {
  buildAppShell,
  buildPanelStack,
  buildScrollSection,
  buildSidebar
} from '@options/stitch/render/shellBuilders';
import { renderPreviewView } from '@options/stitch/render/renderStitchView';
import { clear, el } from '@ui/stitch-runtime';
import type {
  SectionInvalidationOwner,
  SectionInvalidationRequest
} from '@ui/stitch-runtime/render/sectionInvalidation';
import { previewUi } from '@options/stitch/ui/components';
import type { PreviewStoreState } from '@options/stitch/types';
import { RUNTIME_SURFACE_RESOURCE_IDS } from './productionStitchStateMapper';
import { setScrollTopImmediately } from './productionStitchScrollGuard';
import { createProductionStitchRenderControls } from './productionStitchRenderControls';
import { installLocalFolderDismissal } from './productionStitchLocalFolderDismissal';
import { type ProductionStitchSectionHandlers } from './productionStitchShellRenderDelegates';
import type {
  ProductionStitchRenderLifecycle,
  ProductionStitchRenderLifecycleOptions,
  ProductionStitchTestAssets
} from './productionStitchRenderLifecycleTypes';

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
  const { getState, mountRoot, setState } = options;
  const controls = createProductionStitchRenderControls({
    mountRoot,
    getState
  });
  const folderDismissal = installLocalFolderDismissal(mountRoot, getState, setState, () =>
    render('storage')
  );
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
  let invalidation: SectionInvalidationOwner | null = null;
  void import('@ui/stitch-runtime/render/sectionInvalidation').then((owner) => {
    if (!disposed)
      invalidation = owner.createSectionInvalidationOwner({
        handlers,
        capture: () => owner.captureSectionDomSnapshot(mountRoot),
        restore: (snapshot) => owner.restoreSectionDomSnapshot(mountRoot, snapshot)
      });
  });
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
    options.widgetHost.flushDirtyWidgets();
    options.widgetHost.destroyWidgets();
    clear(mountRoot).append(
      buildAppShell({
        el,
        sidebar: renderSidebar(),
        panelStack: buildPanelStack({ el, items: options.getAppData().nav, renderSection })
      })
    );
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
    mountRoot.querySelector(`[data-panel-id="${panelId}"]`)?.replaceWith(renderSection(panelId));
  }

  const render = (scopes: SectionInvalidationRequest): void => {
    if (disposed) return;
    if (invalidation) return invalidation.invalidate(scopes);
    (typeof scopes === 'string' ? [scopes] : scopes).forEach((scope) => {
      const handler = handlers[scope];
      if (!handler) throw new Error(`UNKNOWN_SECTION_INVALIDATION_SCOPE:${scope}`);
      handler();
    });
  };

  function openResource(resourceId: string): void {
    if (RUNTIME_SURFACE_RESOURCE_IDS.has(resourceId)) return;
    const meta = getFooterMeta(resourceId);
    if (!meta) return;
    if (meta.openMode === 'page') {
      const href = resourceId === 'onboarding' ? '../onboarding/index.html' : meta.href;
      window.open(href ?? `./${resourceId}.html`, '_blank', 'noopener,noreferrer');
      return;
    }
    options.setState({
      ...getState(),
      activeResource: resourceId
    });
    renderActiveResourceModal();
  }

  function renderActiveResourceModal(): void {
    mountRoot.querySelectorAll('.resource-modal-overlay').forEach((modal) => modal.remove());
    const state = getState();
    if (!state.activeResource) return;
    const view = getFooterView(state.activeResource, options.createSchemaContext());
    const modal = view ? renderPreviewView(view, createRenderContext()) : null;
    if (modal) mountRoot.querySelector<HTMLElement>('[data-modal-host="true"]')?.append(modal);
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

  function syncActiveLinks(): void {
    const state = getState();
    mountRoot.querySelectorAll<HTMLElement>('[data-nav-panel]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.navPanel === state.activePanel);
    });
    mountRoot.querySelectorAll<HTMLElement>('[data-footer-panel]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.footerPanel === state.activeResource);
    });
  }

  return {
    applySystemThemePreferenceChange: controls.applySystemThemePreferenceChange,
    cleanup: () => {
      disposed = true;
      invalidation?.dispose();
      folderDismissal.cleanup();
    },
    openResource,
    render,
    renderActiveResourceModal,
    scrollToPanel,
    syncHighlightThemeControls: controls.syncHighlightThemeControls,
    syncModifierControls: controls.syncModifierControls,
    syncPreviewThemeControls: controls.syncPreviewThemeControls
  };
}
