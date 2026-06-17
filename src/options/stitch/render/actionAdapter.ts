import { readPath } from '@options/schema-runtime/binding';
import type { el } from '../ui/dom';
import type { previewUi } from '../ui/components';
import type {
  ActionDescriptor,
  ActionReference,
  DynamicValue,
  InputNode,
  NodeChild,
  SchemaContext,
  SegmentedNavNode,
  SelectNode,
  SwitchNode,
  TextareaNode
} from '../types';

export interface RendererContext extends SchemaContext {
  el: typeof el;
  ui: typeof previewUi;
  dispatch: (id: string, args?: unknown[], value?: unknown, event?: Event) => void;
  resolveAssetUrl?: (path: string) => string;
  mountWidget?: (widgetType: string, host: HTMLElement, props?: Record<string, unknown>) => void;
}

export function runEventAction(
  action: DynamicValue<ActionDescriptor> | undefined,
  event: Event,
  ctx: RendererContext
): void {
  const resolved = resolveValue(action, ctx);
  if (!resolved) {
    return;
  }

  const extracted = resolved.valueFrom ? extractEventValue(event, resolved.valueFrom) : undefined;
  runAction(resolved, ctx, extracted, event);
}

export function runAction(
  action: DynamicValue<ActionReference> | undefined,
  ctx: RendererContext,
  runtimeValue?: unknown,
  event?: Event
): void {
  const resolved = resolveValue(action, ctx);
  if (!resolved) {
    return;
  }

  if (typeof resolved === 'string') {
    ctx.dispatch(resolved, [], runtimeValue, event);
    return;
  }

  const args = normalizeActionArgs(resolveValue(resolved.args, ctx));
  const transformedValue =
    typeof resolved.transform === 'function'
      ? resolved.transform(runtimeValue, ctx, event)
      : runtimeValue;

  ctx.dispatch(resolved.id, args, transformedValue === undefined ? event : transformedValue, event);
}

export function resolveNodeValue(
  node: InputNode | TextareaNode | SelectNode | SwitchNode | SegmentedNavNode,
  ctx: RendererContext
): unknown {
  if ('value' in node && node.value !== undefined) {
    return resolveValue(node.value, ctx);
  }
  if (node.bind !== undefined) {
    return resolveBinding(node.bind, ctx);
  }
  return undefined;
}

export function resolveBinding(
  binding: string | import('../types').StateBinding | undefined,
  ctx: RendererContext
): unknown {
  if (binding === undefined || binding === null) {
    return undefined;
  }
  if (typeof binding === 'string') {
    return readPath(ctx.state, binding);
  }

  const source = binding.source || 'state';
  const root = source === 'appData' ? ctx.appData : source === 'context' ? ctx : ctx.state;
  return readPath(root, binding.path);
}

export function normalizeNodes(
  nodes: DynamicValue<NodeChild[] | NodeChild> | undefined,
  ctx: RendererContext
): NodeChild[] {
  const resolved = resolveValue(nodes, ctx);
  if (resolved === undefined || resolved === null || resolved === false) {
    return [];
  }
  return Array.isArray(resolved) ? resolved : [resolved];
}

export function resolveValue<T>(
  value: DynamicValue<T> | undefined,
  ctx: RendererContext
): T | undefined {
  return typeof value === 'function' ? (value as (ctx: SchemaContext) => T)(ctx) : value;
}

function normalizeActionArgs(args: unknown[] | undefined | null): unknown[] {
  if (args === undefined || args === null) {
    return [];
  }
  return Array.isArray(args) ? args : [args];
}

function extractEventValue(
  event: Event | undefined,
  valueFrom: ActionDescriptor['valueFrom']
): unknown {
  switch (valueFrom) {
    case 'target.checked':
      return event?.target instanceof HTMLInputElement ? event.target.checked : undefined;
    case 'target.value':
    default:
      return event?.target instanceof HTMLInputElement ||
        event?.target instanceof HTMLSelectElement ||
        event?.target instanceof HTMLTextAreaElement
        ? event.target.value
        : undefined;
  }
}
