import type { PreviewStoreState, SchemaContext } from '@options/stitch/types';

interface CloseOptions {
  restoreFocus?: boolean;
}

interface MobileNavigationRuntime {
  bind(context: SchemaContext): void;
  cleanup(): void;
  close(options?: CloseOptions): void;
  completeModalResourceActivation(): void;
  completePageResourceActivation(): void;
  completeSectionActivation(panelId: string): void;
  restoreAfterModalClose(): void;
}

interface MobileNavigationModule {
  createProductionStitchMobileNavigation(mountRoot: HTMLElement): MobileNavigationRuntime;
}

const MOBILE_QUERY = '(max-width: 760px)';

function focusElement(element: HTMLElement | null): void {
  element?.focus();
}

export function createProductionStitchMobileNavigation(
  mountRoot: HTMLElement
): MobileNavigationRuntime {
  const media = window.matchMedia(MOBILE_QUERY);
  let runtime: MobileNavigationRuntime | null = null;
  let context: SchemaContext | null = null;
  let sidebar: HTMLElement | null = null;
  let disposed = false;

  const applyFallback = (): void => {
    if (!sidebar) return;
    mountRoot.toggleAttribute('data-mobile-navigation-fallback', media.matches);
    sidebar.removeAttribute('aria-hidden');
  };

  const releaseFallback = (): void => {
    if (sidebar) {
      mountRoot.removeAttribute('data-mobile-navigation-fallback');
      sidebar.removeAttribute('aria-hidden');
    }
    sidebar = null;
  };

  const bindFallback = (nextContext: SchemaContext): void => {
    releaseFallback();
    sidebar = mountRoot.querySelector<HTMLElement>('.sidebar');
    if (!sidebar) return;
    sidebar
      .querySelector('nav')
      ?.setAttribute(
        'aria-label',
        nextContext.t?.('schemaSidebarSettingsGroupTitle', 'Settings') ?? 'Settings'
      );
    applyFallback();
  };

  const focusFallbackNavigation = (): void =>
    focusElement(
      mountRoot.querySelector<HTMLElement>(
        '[data-nav-panel].is-active, [data-footer-panel].is-active'
      ) ?? mountRoot.querySelector<HTMLElement>('[data-nav-panel]')
    );

  const mediaChange = (): void => applyFallback();
  media.addEventListener?.('change', mediaChange);

  void import('./productionStitchMobileNavigation').then(
    (module: MobileNavigationModule) => {
      if (disposed) return;
      const keepOpen = sidebar?.contains(document.activeElement) === true && media.matches;
      releaseFallback();
      runtime = module.createProductionStitchMobileNavigation(mountRoot);
      if (context) runtime.bind(context);
      if (keepOpen) {
        mountRoot.querySelector<HTMLButtonElement>('[data-mobile-navigation-trigger]')?.click();
      }
    },
    () => {
      if (disposed) return;
      applyFallback();
    }
  );

  return {
    bind(nextContext): void {
      context = nextContext;
      if (runtime) runtime.bind(nextContext);
      else bindFallback(nextContext);
    },
    cleanup(): void {
      disposed = true;
      runtime?.cleanup();
      releaseFallback();
      media.removeEventListener?.('change', mediaChange);
    },
    close(options): void {
      if (runtime) runtime.close(options);
    },
    completeModalResourceActivation(): void {
      if (runtime) return runtime.completeModalResourceActivation();
      const dialog = mountRoot.querySelector<HTMLElement>(
        '.resource-modal-overlay [role="dialog"]'
      );
      if (dialog) {
        dialog.tabIndex = -1;
        focusElement(dialog);
      }
    },
    completePageResourceActivation(): void {
      if (runtime) runtime.completePageResourceActivation();
    },
    completeSectionActivation(panelId): void {
      if (runtime) return runtime.completeSectionActivation(panelId);
      if (!media.matches) return;
      const section = mountRoot.querySelector<HTMLElement>(`[data-panel-id="${panelId}"]`);
      const heading = section?.querySelector<HTMLElement>('h1, h2, h3') ?? section;
      if (heading) {
        heading.tabIndex = -1;
        heading.scrollIntoView({ block: 'start' });
        heading.focus({ preventScroll: true });
      } else {
        focusFallbackNavigation();
      }
    },
    restoreAfterModalClose(): void {
      if (runtime) runtime.restoreAfterModalClose();
      else if (media.matches) focusFallbackNavigation();
    }
  };
}

export function syncProductionNavigationActiveLinks(
  mountRoot: HTMLElement,
  state: PreviewStoreState
): void {
  mountRoot
    .querySelectorAll<HTMLElement>('[data-nav-panel], [data-footer-panel]')
    .forEach((button) => {
      const target = button.dataset.navPanel ?? button.dataset.footerPanel;
      const active =
        target === (button.dataset.navPanel ? state.activePanel : state.activeResource);
      button.classList.toggle('is-active', active);
      button.ariaCurrent = active ? 'page' : null;
    });
}
