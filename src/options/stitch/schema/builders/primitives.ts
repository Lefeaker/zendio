import type {
  DynamicValue,
  GridColumns,
  NodeChild,
  NodeSchema,
  OptionsExtensionNode,
  SchemaContext
} from '../../types';
import { classNames } from './classNames';
import {
  buttonNode as runtimeButtonNode,
  div as runtimeDiv,
  element as runtimeElement,
  span as runtimeSpan,
  strong as runtimeStrong
} from '@ui/stitch-surfaces/builders/primitives';

export const buttonNode = runtimeButtonNode<SchemaContext>;
export const div = runtimeDiv<SchemaContext, OptionsExtensionNode>;
export const element = runtimeElement<SchemaContext, OptionsExtensionNode>;
export const span = runtimeSpan<SchemaContext>;
export const strong = runtimeStrong<SchemaContext>;

export function textSpan(text: DynamicValue<string | number>): NodeSchema {
  return element('span', { text });
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
  tag?: keyof HTMLElementTagNameMap
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
