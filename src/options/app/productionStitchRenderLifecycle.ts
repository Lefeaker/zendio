import {
  buildAppShell,
  buildPanelStack,
  buildScrollSection,
  buildSidebar
} from '@options/stitch/render/shellBuilders';
import { renderPreviewView } from '@options/stitch/render/renderStitchView';
import { clear, el } from '@options/stitch/ui/dom';
import { previewUi } from '@options/stitch/ui/components';
import { getFooterMeta, getFooterView, getSettingsView } from '@options/stitch/schema/registry';
import type { PreviewContent, PreviewStoreState, SchemaContext } from '@options/stitch/types';
import type { Language } from '@i18n';
import { RUNTIME_SURFACE_RESOURCE_IDS } from './productionStitchStateMapper';
import { setScrollTopImmediately } from './productionStitchScrollGuard';
import { createProductionStitchRenderControls } from './productionStitchRenderControls';
import { installLocalFolderDismissal } from './productionStitchLocalFolderDismissal';

interface ProductionStitchRenderWidgetHost {
  createWidgetFactory(widgetType: string): unknown;
  destroyWidgets(): void;
  flushDirtyWidgets(): void;
  mountWidget(widgetType: string, host: HTMLElement): void;
}

interface ProductionStitchSchemaRenderer {
  renderView(view: never): HTMLElement;
}

interface ProductionStitchRenderLifecycleOptions {
  mountRoot: HTMLElement;
  getAppData(): PreviewContent;
  getCurrentLanguage(): Language;
  getState(): PreviewStoreState;
  setState(state: PreviewStoreState): void;
  createSchemaContext(): SchemaContext;
  dispatch(actionId: string, args?: unknown[], value?: unknown, event?: Event): void;
  schemaRenderer: ProductionStitchSchemaRenderer;
  widgetHost: ProductionStitchRenderWidgetHost;
}

export interface ProductionStitchRenderLifecycle {
  applySystemThemePreferenceChange: () => void;
  cleanup: () => void;
  openResource: (resourceId: string) => void;
  render: () => void;
  renderActiveResourceModal: () => void;
  scrollToPanel: (panelId: string) => void;
  syncHighlightThemeControls: () => void;
  syncModifierControls: () => void;
  syncPreviewThemeControls: () => void;
}

export function createProductionStitchRenderLifecycle(
  options: ProductionStitchRenderLifecycleOptions
): ProductionStitchRenderLifecycle {
  const { mountRoot } = options;
  const controls = createProductionStitchRenderControls({
    mountRoot,
    getState: () => options.getState()
  });

  const setState = (state: PreviewStoreState): void => options.setState(state);
  const folderDismissal = installLocalFolderDismissal(mountRoot, getState, setState, render);

  function getState(): PreviewStoreState {
    return options.getState();
  }

  function createRenderContext() {
    return {
      ...options.createSchemaContext(),
      el,
      ui: previewUi,
      dispatch: (actionId: string, args?: unknown[], value?: unknown, event?: Event) =>
        options.dispatch(actionId, args, value, event),
      mountWidget: (widgetType: string, host: HTMLElement) =>
        options.widgetHost.mountWidget(widgetType, host)
    };
  }

  function renderSidebar(): HTMLElement {
    const context = options.createSchemaContext();
    const state = getState();
    return buildSidebar({
      el,
      brand: context.appData.brand,
      settingsTitle: '',
      resourcesTitle: '',
      runtimeTitle: options.getCurrentLanguage() === 'en' ? 'Runtime UI' : '运行时界面',
      navItems: context.appData.nav,
      sidebarLinks: context.appData.sidebarLinks,
      surfaceLinks: context.appData.surfaceLinks,
      activePanel: state.activePanel,
      activeResource: state.activeResource,
      onPanelClick: scrollToPanel,
      onFooterClick: openResource
    });
  }

  function renderSectionStack(): HTMLElement {
    return buildPanelStack({
      el,
      items: options.getAppData().nav,
      renderSection: (panelId) => {
        const view = getSettingsView(panelId, options.createSchemaContext());
        const content = view ? options.schemaRenderer.renderView(view as never) : el('div');
        return buildScrollSection({ el, panelId, content });
      }
    });
  }

  function render(): void {
    const previousMain = mountRoot.querySelector('.main');
    const previousScrollTop = previousMain instanceof HTMLElement ? previousMain.scrollTop : 0;
    const previousWindowScroll = {
      x: window.scrollX,
      y: window.scrollY
    };
    options.widgetHost.flushDirtyWidgets();
    options.widgetHost.destroyWidgets();
    clear(mountRoot).append(
      buildAppShell({
        el,
        sidebar: renderSidebar(),
        panelStack: renderSectionStack()
      })
    );
    const nextMain = mountRoot.querySelector('.main');
    const restoreScroll = () => {
      const currentMain = mountRoot.querySelector('.main');
      if (currentMain instanceof HTMLElement) {
        setScrollTopImmediately(currentMain, previousScrollTop);
      }
      if (window.scrollX !== previousWindowScroll.x || window.scrollY !== previousWindowScroll.y) {
        window.scrollTo(previousWindowScroll.x, previousWindowScroll.y);
      }
    };
    if (nextMain instanceof HTMLElement) {
      restoreScroll();
      bindScrollSync(nextMain);
      queueMicrotask(restoreScroll);
      window.requestAnimationFrame?.(() => restoreScroll());
    }
    const chartHost = mountRoot.querySelector<HTMLElement>('[data-role="usage-chart-shell"]');
    if (chartHost) {
      previewUi.renderUsageChart(chartHost, options.getAppData().overview.history);
    }
    controls.syncPreviewThemeControls();
    controls.syncHighlightThemeControls();
    controls.syncModifierControls();
    renderActiveResourceModal();
  }

  function openResource(resourceId: string): void {
    if (RUNTIME_SURFACE_RESOURCE_IDS.has(resourceId)) {
      return;
    }
    const meta = getFooterMeta(resourceId);
    if (!meta) {
      return;
    }
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
    if (!state.activeResource) {
      return;
    }
    const view = getFooterView(state.activeResource, options.createSchemaContext());
    const modal = view ? renderPreviewView(view, createRenderContext()) : null;
    if (modal) {
      mountRoot.querySelector<HTMLElement>('[data-modal-host="true"]')?.append(modal);
    }
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
    applySystemThemePreferenceChange: () => controls.applySystemThemePreferenceChange(),
    cleanup: () => folderDismissal.cleanup(),
    openResource,
    render,
    renderActiveResourceModal,
    scrollToPanel,
    syncHighlightThemeControls: () => controls.syncHighlightThemeControls(),
    syncModifierControls: () => controls.syncModifierControls(),
    syncPreviewThemeControls: () => controls.syncPreviewThemeControls()
  };
}
