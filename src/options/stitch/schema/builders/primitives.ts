import type {
  ActionDescriptor,
  ActionReference,
  ButtonVariant,
  DynamicValue,
  GridColumns,
  NodeChild,
  NodeSchema,
  PreviewStyle
} from '../../types';
import { classNames } from './classNames';

type ElementTag = keyof HTMLElementTagNameMap;

interface ElementOptions {
  className?: DynamicValue<string>;
  text?: DynamicValue<string | number>;
  html?: DynamicValue<string>;
  src?: DynamicValue<string>;
  alt?: DynamicValue<string>;
  href?: DynamicValue<string>;
  target?: DynamicValue<string>;
  rel?: DynamicValue<string>;
  type?: DynamicValue<string>;
  role?: DynamicValue<string>;
  ariaPressed?: DynamicValue<string>;
  ariaLabel?: DynamicValue<string>;
  disabled?: DynamicValue<boolean>;
  title?: DynamicValue<string>;
  dataset?: DynamicValue<Record<string, string | number | boolean>>;
  style?: DynamicValue<PreviewStyle>;
  onClick?: DynamicValue<ActionDescriptor>;
}

export function element(
  tag: ElementTag,
  options: ElementOptions = {},
  children?: DynamicValue<NodeChild[]>
): NodeSchema {
  return {
    kind: 'element',
    tag,
    ...options,
    ...(children ? { children } : {})
  };
}

export function div(className: string, children: DynamicValue<NodeChild[]> = []): NodeSchema {
  return element('div', { className }, children);
}

export function span(className: string, text: DynamicValue<string | number>): NodeSchema {
  return element('span', { className, text });
}

export function textSpan(text: DynamicValue<string | number>): NodeSchema {
  return element('span', { text });
}

export function strong(text: DynamicValue<string | number>, className?: string): NodeSchema {
  return element('strong', { text, ...(className ? { className } : {}) });
}

export function paragraph(text: DynamicValue<string | number>, className?: string): NodeSchema {
  return element('p', { text, ...(className ? { className } : {}) });
}

export function htmlParagraph(html: DynamicValue<string>, className?: string): NodeSchema {
  return element('p', { html, ...(className ? { className } : {}) });
}

export function code(text: DynamicValue<string | number>): NodeSchema {
  return element('code', { text });
}

export function pre(text: DynamicValue<string | number>): NodeSchema {
  return element('pre', { text });
}

export function stack(
  children: DynamicValue<NodeChild[]>,
  className?: string,
  tag?: ElementTag
): NodeSchema {
  return {
    kind: 'stack',
    ...(className ? { className } : {}),
    ...(tag ? { tag } : {}),
    children
  };
}

export function grid(
  columns: GridColumns,
  children: DynamicValue<NodeChild[]>,
  className?: string
): NodeSchema {
  return {
    kind: 'grid',
    columns,
    ...(className ? { className } : {}),
    children
  };
}

export function toolbar(children: DynamicValue<NodeChild[]>, extraClass?: string): NodeSchema {
  return div(['toolbar', extraClass].filter(Boolean).join(' '), children);
}

export function state(text: DynamicValue<string | number>): NodeSchema {
  return span('state', text);
}

export function buttonNode(
  label: DynamicValue<string>,
  variant?: DynamicValue<ButtonVariant>,
  action?: DynamicValue<ActionReference>,
  disabled?: DynamicValue<boolean>,
  dataset?: DynamicValue<Record<string, string | number | boolean>>
): NodeSchema {
  return {
    kind: 'button',
    label,
    ...(variant ? { variant } : {}),
    ...(action ? { action } : {}),
    ...(disabled !== undefined ? { disabled } : {}),
    ...(dataset ? { dataset } : {})
  };
}

export function badgeNode(label: DynamicValue<string>, variant?: DynamicValue<string>): NodeSchema {
  return {
    kind: 'badge',
    label,
    ...(variant ? { variant } : {})
  };
}

export function emptyState(text: DynamicValue<string | number>): NodeSchema {
  return element('div', { className: classNames.common.emptyState, text });
}

export function classBlock(className: string, children: DynamicValue<NodeChild[]>): NodeSchema {
  return div(className, children);
}
