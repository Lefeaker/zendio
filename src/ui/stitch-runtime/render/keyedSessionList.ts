export interface KeyedSessionListMetrics {
  created: number;
  moved: number;
  removed: number;
  updated: number;
}

export interface KeyedSessionListOptions<T> {
  container: HTMLElement;
  keyOf(item: T): string;
  create(item: T): HTMLElement;
  update(element: HTMLElement, item: T): void;
  before?: ChildNode | null;
  initial?: ReadonlyArray<{ key: string; element: HTMLElement }>;
}

export interface KeyedSessionList<T> {
  reconcile(items: readonly T[]): KeyedSessionListMetrics;
  get(key: string): HTMLElement | null;
  dispose(): void;
}

export function createKeyedSessionList<T>(
  options: KeyedSessionListOptions<T>
): KeyedSessionList<T> {
  const elements = new Map<string, HTMLElement>(
    (options.initial ?? []).map(({ key, element }) => [key, element])
  );
  let disposed = false;

  return {
    reconcile(items) {
      if (disposed) throw new Error('Cannot reconcile a disposed keyed session list');
      const keys = validateKeys(items, (item) => options.keyOf(item));
      const retained = new Set(keys);
      const metrics: KeyedSessionListMetrics = { created: 0, moved: 0, removed: 0, updated: 0 };

      elements.forEach((element, key) => {
        if (retained.has(key)) return;
        element.remove();
        elements.delete(key);
        metrics.removed += 1;
      });

      let cursor: ChildNode | null = options.before ?? null;
      for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index];
        if (item === undefined) continue;
        const key = keys[index];
        if (key === undefined) continue;
        let element = elements.get(key);
        if (!element) {
          element = options.create(item);
          elements.set(key, element);
          metrics.created += 1;
        } else {
          options.update(element, item);
          metrics.updated += 1;
        }
        if (element.parentNode !== options.container || element.nextSibling !== cursor) {
          options.container.insertBefore(element, cursor);
          metrics.moved += 1;
        }
        cursor = element;
      }
      return metrics;
    },
    get(key) {
      return elements.get(key) ?? null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      elements.clear();
    }
  };
}

export function patchSessionElement(current: HTMLElement, next: HTMLElement): void {
  const previewState = capturePreviewInteractionState(current, next);
  syncAttributes(current, next);
  restorePreviewInteractionState(current, previewState);
  const currentChildren = Array.from(current.childNodes);
  const nextChildren = Array.from(next.childNodes);
  const length = Math.max(currentChildren.length, nextChildren.length);
  for (let index = 0; index < length; index += 1) {
    const currentChild = currentChildren[index];
    const nextChild = nextChildren[index];
    if (!nextChild) {
      currentChild?.remove();
      continue;
    }
    if (!currentChild) {
      current.append(nextChild.cloneNode(true));
      continue;
    }
    if (currentChild.nodeType === Node.TEXT_NODE && nextChild.nodeType === Node.TEXT_NODE) {
      if (currentChild.textContent !== nextChild.textContent) {
        currentChild.textContent = nextChild.textContent;
      }
      continue;
    }
    if (
      currentChild instanceof HTMLElement &&
      nextChild instanceof HTMLElement &&
      currentChild.tagName === nextChild.tagName
    ) {
      patchSessionElement(currentChild, nextChild);
      continue;
    }
    currentChild.replaceWith(nextChild.cloneNode(true));
  }

  if (current instanceof HTMLInputElement && next instanceof HTMLInputElement) {
    const focused = current.ownerDocument.activeElement === current;
    if (!focused && current.value !== next.value) current.value = next.value;
    current.defaultValue = next.defaultValue;
  }
}

interface PreviewInteractionState {
  expanded: boolean;
  role: string | null;
  tabIndex: string | null;
  ariaExpanded: string | null;
}

function capturePreviewInteractionState(
  element: HTMLElement,
  next: HTMLElement
): PreviewInteractionState | null {
  if (
    !element.matches('.session-item-primary-line') ||
    !next.matches('.session-item-primary-line') ||
    !element.hasAttribute('role') ||
    !element.hasAttribute('tabindex') ||
    !element.hasAttribute('aria-expanded')
  ) {
    return null;
  }
  return {
    expanded: element.classList.contains('is-expanded'),
    role: element.getAttribute('role'),
    tabIndex: element.getAttribute('tabindex'),
    ariaExpanded: element.getAttribute('aria-expanded')
  };
}

function restorePreviewInteractionState(
  element: HTMLElement,
  state: PreviewInteractionState | null
): void {
  if (!state) return;
  element.classList.toggle('is-expanded', state.expanded);
  restoreAttribute(element, 'role', state.role);
  restoreAttribute(element, 'tabindex', state.tabIndex);
  restoreAttribute(element, 'aria-expanded', state.ariaExpanded);
}

function restoreAttribute(element: HTMLElement, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

function validateKeys<T>(items: readonly T[], keyOf: (item: T) => string): string[] {
  const seen = new Set<string>();
  return items.map((item) => {
    const key = keyOf(item).trim();
    if (!key) throw new Error('Keyed session items require a non-empty key');
    if (seen.has(key)) throw new Error(`Duplicate keyed session item: ${key}`);
    seen.add(key);
    return key;
  });
}

function syncAttributes(current: HTMLElement, next: HTMLElement): void {
  Array.from(current.attributes).forEach((attribute) => {
    if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  });
  Array.from(next.attributes).forEach((attribute) => {
    if (current.getAttribute(attribute.name) !== attribute.value) {
      current.setAttribute(attribute.name, attribute.value);
    }
  });
}
