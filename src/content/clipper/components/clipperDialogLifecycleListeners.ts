interface ClipperDialogLifecycleListenerOptions {
  getDocument(): Document;
  getWindow(): Window;
  getHost(): HTMLElement | null;
  getShadowRoot(): ShadowRoot | null;
  getDialogSurface(): HTMLElement | null;
  getTextarea(): HTMLTextAreaElement | null;
  onTextareaKeydown(event: KeyboardEvent): void;
  onTextareaInput(): void;
  onWindowKeydown(event: KeyboardEvent): void;
  closeRegisteredPopups(): void;
}

export interface ClipperDialogLifecycleListeners {
  attachDialogEventListeners(): void;
  detachDialogEventListeners(): void;
  attachLifecycleEventListeners(): void;
  detachLifecycleEventListeners(): void;
}

export function createClipperDialogLifecycleListeners(
  options: ClipperDialogLifecycleListenerOptions
): ClipperDialogLifecycleListeners {
  const onPageHide = (): void => {
    options.closeRegisteredPopups();
  };

  const onVisibilityChange = (): void => {
    if (options.getDocument().hidden) {
      options.closeRegisteredPopups();
    }
  };

  const onFocusTrapKeydown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || event.key !== 'Tab') {
      return;
    }

    const focusables = getFocusableElements(options.getShadowRoot());
    if (!focusables.length) {
      event.preventDefault();
      return;
    }

    const active = options.getShadowRoot()?.activeElement;
    const first = focusables[0];
    const last = focusables.at(-1) ?? first;
    if (event.shiftKey) {
      if (active === first || !focusables.includes(active as HTMLElement)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (active === last || !focusables.includes(active as HTMLElement)) {
      event.preventDefault();
      first.focus();
    }
  };

  const onDocumentFocusIn = (event: FocusEvent): void => {
    const host = options.getHost();
    const textarea = options.getTextarea();
    if (!host || !options.getShadowRoot() || !textarea) {
      return;
    }

    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const target = event.target instanceof Node ? event.target : null;
    if (path.includes(host) || (target && host.contains(target))) {
      return;
    }

    queueMicrotask(() => {
      const currentTextarea = options.getTextarea();
      if (currentTextarea && options.getHost()?.isConnected) {
        currentTextarea.focus();
      }
    });
  };
  const onTextareaKeydown = (event: KeyboardEvent): void => {
    options.onTextareaKeydown(event);
  };
  const onTextareaInput = (): void => {
    options.onTextareaInput();
  };
  const onWindowKeydown = (event: KeyboardEvent): void => {
    options.onWindowKeydown(event);
  };

  return {
    attachDialogEventListeners(): void {
      options.getTextarea()?.addEventListener('keydown', onTextareaKeydown);
      options.getTextarea()?.addEventListener('input', onTextareaInput);
      options.getWindow().addEventListener('keydown', onWindowKeydown);
      options.getDocument().addEventListener('focusin', onDocumentFocusIn, true);
      options.getShadowRoot()?.addEventListener('keydown', onFocusTrapKeydown);
      options.getDialogSurface()?.addEventListener('keydown', onWindowKeydown);
    },
    detachDialogEventListeners(): void {
      options.getTextarea()?.removeEventListener('keydown', onTextareaKeydown);
      options.getTextarea()?.removeEventListener('input', onTextareaInput);
      options.getWindow().removeEventListener('keydown', onWindowKeydown);
      options.getDocument().removeEventListener('focusin', onDocumentFocusIn, true);
      options.getShadowRoot()?.removeEventListener('keydown', onFocusTrapKeydown);
      options.getDialogSurface()?.removeEventListener('keydown', onWindowKeydown);
    },
    attachLifecycleEventListeners(): void {
      options.getWindow().addEventListener('pagehide', onPageHide, { passive: true });
      options.getDocument().addEventListener('visibilitychange', onVisibilityChange);
    },
    detachLifecycleEventListeners(): void {
      options.getWindow().removeEventListener('pagehide', onPageHide);
      options.getDocument().removeEventListener('visibilitychange', onVisibilityChange);
    }
  };
}

function getFocusableElements(root: ShadowRoot | null): HTMLElement[] {
  if (!root) {
    return [];
  }
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}
