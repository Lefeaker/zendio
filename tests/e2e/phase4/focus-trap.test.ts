/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FocusTrap as FocusTrapInstance, Options as FocusTrapOptions } from 'focus-trap';
import { FocusTrapController } from '@content/shared/focusTrap';
import { withDomEnvironment, type DomGlobalKey } from '../../utils/domEnvironment';

const focusTrapStubModule = vi.hoisted(() => {
  class FakeFocusTrap implements FocusTrapInstance {
    public active = false;
    public paused = false;
    private previousFocus: HTMLElement | null = null;
    private keydownHandler = (event: KeyboardEvent) => {
      if (!this.active || this.paused || event.key !== 'Tab') {
        return;
      }
      const focusables = this.getFocusableElements();
      if (!focusables.length) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const current = document.activeElement as HTMLElement | null;
      const currentIndex = current ? focusables.indexOf(current) : -1;
      const nextIndex = event.shiftKey
        ? (currentIndex - 1 + focusables.length) % focusables.length
        : (currentIndex + 1) % focusables.length;
      const target = focusables[nextIndex];
      target?.focus();
    };

    constructor(
      private container: HTMLElement,
      private options: FocusTrapOptions
    ) {}

    activate(): FocusTrapInstance {
      if (this.active) {
        return this;
      }
      this.active = true;
      this.paused = false;
      this.previousFocus = document.activeElement as HTMLElement | null;
      this.container.addEventListener('keydown', this.keydownHandler);
      this.focusInitialTarget();
      this.options.onActivate?.();
      return this;
    }

    deactivate(): FocusTrapInstance {
      if (!this.active) {
        return this;
      }
      this.active = false;
      this.container.removeEventListener('keydown', this.keydownHandler);
      this.options.onDeactivate?.();
      if (this.options.returnFocusOnDeactivate !== false) {
        const target = this.previousFocus;
        this.previousFocus = null;
        target?.focus();
      }
      return this;
    }

    pause(): FocusTrapInstance {
      this.paused = true;
      return this;
    }

    unpause(): FocusTrapInstance {
      this.paused = false;
      return this;
    }

    private focusInitialTarget(): void {
      const target =
        this.resolveFocusTarget(this.options.initialFocus) ?? this.pickFirstFocusable();
      (target ?? this.resolveFocusTarget(this.options.fallbackFocus) ?? this.container).focus();
    }

    private pickFirstFocusable(): HTMLElement | null {
      const focusables = this.getFocusableElements();
      return focusables[0] ?? null;
    }

    private resolveFocusTarget(target?: FocusTrapOptions['initialFocus']): HTMLElement | null {
      if (target == null) {
        return null;
      }
      if (typeof target === 'function') {
        const resolved = target();
        return this.resolveFocusTarget(resolved as FocusTrapOptions['initialFocus']);
      }
      if (typeof target === 'string') {
        return this.container.querySelector<HTMLElement>(target);
      }
      if (target instanceof HTMLElement) {
        return target;
      }
      return null;
    }

    updateContainerElements(
      containerElements:
        | HTMLElement
        | SVGElement
        | string
        | Array<HTMLElement | SVGElement | string>
    ): FocusTrapInstance {
      const candidate = Array.isArray(containerElements) ? containerElements[0] : containerElements;
      if (typeof candidate === 'string') {
        const resolved = document.querySelector<HTMLElement>(candidate);
        if (resolved) {
          this.container = resolved;
        }
      } else if (candidate instanceof HTMLElement) {
        this.container = candidate;
      }
      return this;
    }

    private getFocusableElements(): HTMLElement[] {
      const selector = 'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';
      return Array.from(this.container.querySelectorAll<HTMLElement>(selector)).filter(
        (element) => !element.hasAttribute('disabled')
      );
    }
  }

  return {
    createFocusTrap: (container: HTMLElement, options: FocusTrapOptions) =>
      new FakeFocusTrap(container, options)
  };
});

vi.mock('focus-trap', () => focusTrapStubModule);

const DOM_GLOBALS: DomGlobalKey[] = [
  'document',
  'navigator',
  'HTMLElement',
  'HTMLDivElement',
  'HTMLSpanElement',
  'HTMLButtonElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent',
  'MutationObserver'
] as const;

describe('phase4/focus trap keyboard flow', () => {
  beforeEach(() => {
    // ensure no leaked focus state before each test
    document?.body?.replaceChildren();
  });

  afterEach(() => {
    document?.body?.replaceChildren();
  });

  it('keeps focus cycling inside the dialog with Tab / Shift+Tab', async () => {
    await withDomEnvironment(
      '<!DOCTYPE html><html><body></body></html>',
      { globals: DOM_GLOBALS },
      async ({ document, window }) => {
        const outside = document.createElement('button');
        outside.textContent = 'Outside';
        document.body.append(outside);
        outside.focus();

        const dialogContainer = document.createElement('div');
        dialogContainer.id = 'clipper-dialog';
        dialogContainer.innerHTML = `
        <button id="first">Comment</button>
        <button id="second">Reader</button>
        <button id="third">Save</button>
      `;
        document.body.append(dialogContainer);

        const controller = new FocusTrapController(dialogContainer, {
          initialFocus: '#first',
          fallbackFocus: dialogContainer,
          returnFocusOnDeactivate: true
        });
        controller.activate();
        await nextTick();

        const first = document.getElementById('first') as HTMLButtonElement;
        const second = document.getElementById('second') as HTMLButtonElement;
        const third = document.getElementById('third') as HTMLButtonElement;

        first.focus();
        await nextTick();
        expect(document.activeElement).toBe(first);

        await pressTab(first, window);
        expect(document.activeElement).toBe(second);

        await pressTab(second, window);
        expect(document.activeElement).toBe(third);

        // wrap to first when reaching the last element
        await pressTab(third, window);
        expect(document.activeElement).toBe(first);

        // reverse direction with Shift+Tab
        await pressTab(first, window, { shiftKey: true });
        expect(document.activeElement).toBe(third);

        controller.deactivate();
        expect(document.activeElement).toBe(outside);
      }
    );
  });
});

async function pressTab(
  element: HTMLElement,
  window: Window & typeof globalThis,
  options: { shiftKey?: boolean } = {}
): Promise<void> {
  const event = new window.KeyboardEvent('keydown', {
    key: 'Tab',
    bubbles: true,
    cancelable: true,
    shiftKey: options.shiftKey ?? false
  });
  element.dispatchEvent(event);
  await nextTick();
}

async function nextTick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
