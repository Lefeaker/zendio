import { replaceChildrenWithSafeRichText } from '@shared/i18n/richTextDom';

type PrimitiveChild = string | number | boolean | null | undefined;
type Child = PrimitiveChild | Node;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'g', 'path', 'line', 'circle', 'text']);

export interface ElementProps {
  className?: string | undefined;
  text?: string | undefined;
  html?: string | undefined;
  dataset?: Record<string, string | number | boolean> | undefined;
  style?: Partial<CSSStyleDeclaration> | Record<string, string | number> | undefined;
  [key: string]: unknown;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  ...children: Array<Child | Child[]>
): HTMLElementTagNameMap[K] {
  const isSvg = SVG_TAGS.has(tag);
  const node = (
    isSvg ? document.createElementNS(SVG_NAMESPACE, tag) : document.createElement(tag)
  ) as HTMLElementTagNameMap[K];

  Object.entries(props).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (key === 'className' && typeof value === 'string') {
      if (isSvg) {
        node.setAttribute('class', value);
      } else {
        node.className = value;
      }
      return;
    }

    if (key === 'text' && typeof value === 'string') {
      node.textContent = value;
      return;
    }

    if (key === 'html' && typeof value === 'string') {
      replaceChildrenWithSafeRichText(node, value);
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
      Object.entries(value as Record<string, string | number>).forEach(([styleKey, styleValue]) => {
        if (styleKey.startsWith('--')) {
          node.style.setProperty(styleKey, String(styleValue));
          return;
        }

        (
          node.style as CSSStyleDeclaration & {
            [prop: string]: string | number;
          }
        )[styleKey] = styleValue;
      });
      return;
    }

    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      return;
    }

    if (!isSvg && key in node) {
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
