import type { Messages } from '@i18n';

/**
 * Shared UI base component used by ui/domains and legacy Options classes during migration.
 */
export abstract class BaseComponent<TContext = void> {
  protected readonly container: HTMLElement;
  protected messages: Messages | null = null;
  private destroyed = false;

  constructor(container: HTMLElement) {
    if (!(container instanceof HTMLElement)) {
      throw new TypeError('[BaseComponent] A valid HTMLElement container is required.');
    }
    this.container = container;
  }

  setMessages(messages: Messages): void {
    this.messages = messages;
  }

  abstract render(context: TContext): HTMLElement | void;

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.container.replaceChildren();
    this.destroyed = true;
  }

  protected assertActive(): void {
    if (this.destroyed) {
      throw new Error('[BaseComponent] Component has already been destroyed.');
    }
  }

  protected createElement<T extends keyof HTMLElementTagNameMap>(
    tag: T,
    className?: string,
    attributes?: Record<string, string>
  ): HTMLElementTagNameMap[T] {
    this.assertActive();
    const element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
      }
    }
    return element;
  }
}

export type ComponentMessages = Messages;
