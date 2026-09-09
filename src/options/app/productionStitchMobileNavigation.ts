const MOBILE_NAVIGATION_QUERY = '(max-width: 760px)';
const FOCUSABLE_SELECTOR =
  'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
interface CloseOptions {
  restoreFocus?: boolean;
}
export interface ProductionStitchMobileNavigation {
  bind(context: SchemaContext): void;
  cleanup(): void;
  close(options?: CloseOptions): void;
  completeModalResourceActivation(): void;
  completePageResourceActivation(): void;
  completeSectionActivation(panelId: string): void;
  restoreAfterModalClose(): void;
}
function setInert(element: HTMLElement | null, inert: boolean): void {
  if (!element) return;
  (element as HTMLElement & { inert: boolean }).inert = inert;
  element.toggleAttribute('inert', inert);
}

function focusElement(element: HTMLElement | null): void {
  element?.focus({ preventScroll: true });
}

export function createProductionStitchMobileNavigation(
  mountRoot: HTMLElement
): ProductionStitchMobileNavigation {
  const media = window.matchMedia(MOBILE_NAVIGATION_QUERY);
  let trigger: HTMLButtonElement | null = null;
  let closeTrigger: HTMLButtonElement | null = null;
  let sidebar: HTMLElement | null = null;
  let backdrop: HTMLButtonElement | null = null;
  let main: HTMLElement | null = null;
  let open = false;
  let disposed = false;
  let bodyOverflow = '';
  let mainOverflow = '';

  function focusableItems(): HTMLElement[] {
    return sidebar
      ? Array.from(sidebar.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
          (item) => !item.hasAttribute('disabled') && item.getAttribute('aria-hidden') !== 'true'
        )
      : [];
  }

  function applyScrollLock(locked: boolean): void {
    if (locked) {
      bodyOverflow = document.body.style.overflow;
      mainOverflow = main?.style.overflow ?? '';
      document.body.style.overflow = 'hidden';
      if (main) main.style.overflow = 'hidden';
      return;
    }
    document.body.style.overflow = bodyOverflow;
    if (main) main.style.overflow = mainOverflow;
  }

  function applyState(): void {
    if (!trigger || !sidebar || !backdrop) return;
    const mobile = media.matches;
    const expanded = mobile && open;
    trigger.setAttribute('aria-expanded', String(expanded));
    sidebar.classList.toggle('is-mobile-open', expanded);
    backdrop.classList.toggle('is-visible', expanded);
    backdrop.setAttribute('aria-hidden', String(!expanded));
    if (!mobile) {
      open = false;
      sidebar.removeAttribute('aria-hidden');
      setInert(sidebar, false);
      setInert(main, false);
      applyScrollLock(false);
      return;
    }
    sidebar.setAttribute('aria-hidden', String(!expanded));
    setInert(sidebar, !expanded);
    setInert(main, expanded);
    applyScrollLock(expanded);
  }

  function close({ restoreFocus = true }: CloseOptions = {}): void {
    if (!open && media.matches) {
      applyState();
      return;
    }
    open = false;
    applyState();
    if (restoreFocus && media.matches) focusElement(trigger);
  }

  function openNavigation(): void {
    if (disposed || !media.matches || open) return;
    open = true;
    applyState();
    const active = sidebar?.querySelector<HTMLElement>(
      '[data-nav-panel].is-active, [data-footer-panel].is-active'
    );
    focusElement(active ?? focusableItems()[0] ?? sidebar);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!open || !media.matches) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusableItems();
    if (!items.length) {
      event.preventDefault();
      focusElement(sidebar);
      return;
    }
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      focusElement(last ?? first);
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      focusElement(first);
    }
  }

  const closeNavigation = (): void => close();

  function releaseBoundElements(): void {
    trigger?.removeEventListener('click', openNavigation);
    closeTrigger?.removeEventListener('click', closeNavigation);
    backdrop?.removeEventListener('click', closeNavigation);
    document.removeEventListener('keydown', handleKeydown, true);
    open = false;
    applyState();
    trigger = null;
    closeTrigger = null;
    sidebar = null;
    backdrop = null;
    main = null;
  }

  function bind(context: SchemaContext): void {
    releaseBoundElements();
    const labels = {
      close: context.t?.('contactModalCloseButton', 'Close') ?? 'Close',
      navigation: context.t?.('schemaSidebarSettingsGroupTitle', 'Settings') ?? 'Settings',
      open: context.t?.('settingsTitle', 'Settings') ?? 'Settings'
    };
    const app = mountRoot.querySelector<HTMLElement>('.app');
    sidebar = mountRoot.querySelector<HTMLElement>('.sidebar');
    if (app && sidebar) {
      sidebar.id = 'options-settings-navigation';
      sidebar.tabIndex = -1;
      sidebar.querySelector('nav')?.setAttribute('aria-label', labels.navigation);
      closeTrigger = document.createElement('button');
      closeTrigger.type = 'button';
      closeTrigger.className = 'mobile-navigation-close';
      closeTrigger.dataset.mobileNavigationClose = 'true';
      closeTrigger.textContent = labels.close;
      sidebar.prepend(closeTrigger);
      trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'mobile-navigation-trigger';
      trigger.dataset.mobileNavigationTrigger = 'true';
      trigger.textContent = labels.open;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', sidebar.id);
      backdrop = document.createElement('button');
      backdrop.type = 'button';
      backdrop.className = 'mobile-navigation-backdrop';
      backdrop.dataset.mobileNavigationBackdrop = 'true';
      backdrop.tabIndex = -1;
      backdrop.setAttribute('aria-label', labels.close);
      backdrop.setAttribute('aria-hidden', 'true');
      app.insertBefore(trigger, sidebar);
      sidebar.after(backdrop);
    }
    main = mountRoot.querySelector<HTMLElement>('.main');
    trigger?.addEventListener('click', openNavigation);
    closeTrigger?.addEventListener('click', closeNavigation);
    backdrop?.addEventListener('click', closeNavigation);
    document.addEventListener('keydown', handleKeydown, true);
    applyState();
  }

  function handleMediaChange(): void {
    const focusWasInSidebar = sidebar?.contains(document.activeElement) === true;
    open = false;
    applyState();
    if (media.matches && focusWasInSidebar) focusElement(trigger);
  }

  media.addEventListener?.('change', handleMediaChange);

  return {
    bind,
    cleanup(): void {
      disposed = true;
      releaseBoundElements();
      media.removeEventListener?.('change', handleMediaChange);
    },
    close,
    completeModalResourceActivation(): void {
      close({ restoreFocus: false });
      const dialog = mountRoot.querySelector<HTMLElement>(
        '.resource-modal-overlay [role="dialog"]'
      );
      if (dialog) {
        dialog.tabIndex = -1;
        focusElement(dialog);
      }
    },
    completePageResourceActivation(): void {
      close();
    },
    completeSectionActivation(panelId): void {
      close({ restoreFocus: false });
      if (!media.matches) return;
      const section = mountRoot.querySelector<HTMLElement>(`[data-panel-id="${panelId}"]`);
      const heading = section?.querySelector<HTMLElement>('h1, h2, h3') ?? section;
      if (heading) {
        heading.tabIndex = -1;
        focusElement(heading);
      } else {
        focusElement(trigger);
      }
    },
    restoreAfterModalClose(): void {
      if (media.matches) focusElement(trigger);
    }
  };
}

import type { SchemaContext } from '@options/stitch/types';
