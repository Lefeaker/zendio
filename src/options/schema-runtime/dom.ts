type PrimitiveChild = string | number | boolean | null | undefined;
type Child = PrimitiveChild | Node;

export interface ElementProps {
  className?: string;
  text?: string;
  html?: string;
  dataset?: Record<string, string | number | boolean>;
  style?: Partial<CSSStyleDeclaration> | Record<string, string | number>;
  [key: string]: unknown;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  ...children: Array<Child | Child[]>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  Object.entries(props).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (key === 'className' && typeof value === 'string') {
      node.className = value;
      return;
    }

    if (key === 'text' && typeof value === 'string') {
      node.textContent = value;
      return;
    }

    if (key === 'html' && typeof value === 'string') {
      node.innerHTML = value;
      return;
    }

    if (key === 'dataset' && typeof value === 'object') {
      Object.entries(value as Record<string, string | number | boolean>).forEach(
        ([dataKey, dataValue]) => {
          node.dataset[dataKey] = String(dataValue);
        }
      );
      return;
    }

    if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
      return;
    }

    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      return;
    }

    if (key in node) {
      (
        node as HTMLElement & {
          [prop: string]: unknown;
        }
      )[key] = value;
      return;
    }

    node.setAttribute(key, String(value));
  });

  children.flat().forEach((child) => {
    if (child === undefined || child === null || child === false) {
      return;
    }

    if (typeof child === 'string' || typeof child === 'number') {
      node.append(document.createTextNode(String(child)));
      return;
    }

    if (typeof child === 'boolean') {
      return;
    }

    node.append(child);
  });

  return node;
}

export function clear<T extends Element>(node: T): T {
  node.replaceChildren();
  return node;
}
