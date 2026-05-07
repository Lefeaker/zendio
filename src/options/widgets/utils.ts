import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { OptionsSnapshotLike, WidgetRuntime } from './contracts';

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  attributes?: Record<string, string>
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
  }
  return element;
}

export function asOptionsSnapshot(snapshot: OptionsSnapshotLike): StoredOptions | CompleteOptions {
  return (snapshot ?? {}) as StoredOptions | CompleteOptions;
}

export function clearWidgetContainer(container: HTMLElement | null): void {
  container?.replaceChildren();
}

export function notifyWidgetDirty(
  runtime: WidgetRuntime | undefined,
  keys: string[],
  meta?: { invalid?: boolean }
): void {
  runtime?.notifyDirty?.(keys, meta);
}

export function bindWidgetEvent<K extends keyof HTMLElementEventMap>(
  target: HTMLElement | null,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void
): (() => void) | null {
  if (!target) {
    return null;
  }
  target.addEventListener(type, handler as EventListener);
  return () => target.removeEventListener(type, handler as EventListener);
}
