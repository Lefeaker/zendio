import { createFocusTrap, type FocusTrap, type Options } from 'focus-trap';

export interface FocusTrapOptions {
  initialFocus?: string | HTMLElement | (() => HTMLElement | null);
  fallbackFocus?: string | HTMLElement;
  escapeDeactivates?: boolean;
  clickOutsideDeactivates?: boolean;
  returnFocusOnDeactivate?: boolean;
  onActivate?: () => void;
  onDeactivate?: () => void;
}

/**
 * Focus Trap 包装器，提供更友好的 API，并兼容 Shadow DOM。
 */
export class FocusTrapController {
  private trap: FocusTrap | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly options: FocusTrapOptions = {}
  ) {}

  activate(): void {
    if (this.trap) {
      return;
    }

    const focusTrapOptions: Options = {
      escapeDeactivates: this.options.escapeDeactivates ?? true,
      clickOutsideDeactivates: this.options.clickOutsideDeactivates ?? true,
      returnFocusOnDeactivate: this.options.returnFocusOnDeactivate ?? true,
      fallbackFocus: this.resolveElement(this.options.fallbackFocus) ?? this.container,
      ...(this.options.onActivate !== undefined && { onActivate: this.options.onActivate }),
      ...(this.options.onDeactivate !== undefined && { onDeactivate: this.options.onDeactivate })
    };

    const initialFocus = this.options.initialFocus;
    if (typeof initialFocus === 'string') {
      const target = this.container.querySelector<HTMLElement>(initialFocus);
      if (target) {
        focusTrapOptions.initialFocus = target;
      }
    } else if (typeof initialFocus === 'function') {
      const target = initialFocus();
      if (target) {
        focusTrapOptions.initialFocus = target;
      }
    } else if (initialFocus instanceof HTMLElement) {
      focusTrapOptions.initialFocus = initialFocus;
    }

    const fallback = this.options.fallbackFocus;
    if (fallback && typeof fallback !== 'string') {
      focusTrapOptions.fallbackFocus = fallback;
    }

    this.trap = createFocusTrap(this.container, focusTrapOptions);
    this.trap.activate();
  }

  deactivate(): void {
    if (!this.trap) {
      return;
    }
    this.trap.deactivate();
    this.trap = null;
  }

  pause(): void {
    this.trap?.pause();
  }

  unpause(): void {
    this.trap?.unpause();
  }

  isActive(): boolean {
    return Boolean(this.trap);
  }

  private resolveElement(target?: string | HTMLElement): HTMLElement | null {
    if (!target) {
      return null;
    }
    if (typeof target === 'string') {
      return this.container.querySelector<HTMLElement>(target);
    }
    return target;
  }
}
