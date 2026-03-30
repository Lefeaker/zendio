export function getElementById<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element as T;
}

export function getOptionalElementById<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export function querySelector<T extends Element>(selector: string, root: Document | Element = document): T | null {
  return root.querySelector(selector);
}

export function createElement<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
  return document.createElement(tag);
}
