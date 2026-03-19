import type { Messages } from '@i18n/messages';

/**
 * Base class for the upcoming options page component system.
 * Provides a shared container reference, lifecycle guards,
 * and lightweight helpers for DOM authoring.
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

  /**
   * Assigns the active i18n messages resource so subclasses can render with translations.
   */
  setMessages(messages: Messages): void {
    this.messages = messages;
  }

  /**
   * Render the component into its container.
   * Subclasses should avoid side effects if the component has been destroyed.
   */
  abstract render(context: TContext): HTMLElement | void;

  /**
   * Tears down any DOM authored by the component.
   * The default implementation clears the container children.
   */
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
