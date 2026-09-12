import { readPath } from '@options/schema-runtime/binding';
import {
  extractRuntimeEventValue,
  normalizeRuntimeNodes,
  resolveRuntimeBinding,
  resolveRuntimeValue,
  runRuntimeAction,
  type el
} from '@ui/stitch-runtime';
import type { previewUi } from '../ui/components';
import type {
  ActionDescriptor,
  ActionReference,
  DynamicValue,
  InputNode,
  NodeChild,
  OptionsExtensionNode,
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
  if (!resolved) return;
  const extracted = resolved.valueFrom
    ? extractRuntimeEventValue(event, resolved.valueFrom)
    : undefined;
  runAction(resolved, ctx, extracted, event);
}

export function runAction(
  action: DynamicValue<ActionReference> | undefined,
  ctx: RendererContext,
  runtimeValue?: unknown,
  event?: Event
): void {
  const resolved = resolveValue(action, ctx);
  if (!resolved) return;
  if (typeof resolved === 'string') {
    runRuntimeAction(resolved, ctx, runtimeValue, event);
    return;
  }
  const transformedValue =
    typeof resolved.transform === 'function'
      ? resolved.transform(runtimeValue, ctx, event)
      : runtimeValue;
  runRuntimeAction(resolved, ctx, transformedValue, event);
}

export function resolveNodeValue(
  node: InputNode | TextareaNode | SelectNode | SwitchNode | SegmentedNavNode,
  ctx: RendererContext
): unknown {
  if ('value' in node && node.value !== undefined) {
    return resolveValue(node.value, ctx);
  }
  return node.bind === undefined ? undefined : resolveBinding(node.bind, ctx);
}

export function resolveBinding(
  binding: string | import('../types').StateBinding | undefined,
  ctx: RendererContext
): unknown {
  if (binding === undefined) return undefined;
  if (typeof binding === 'string') {
    return readPath(ctx.state, binding);
  }
  const source = binding.source ?? 'state';
  if (source === 'context') {
    return readPath(ctx, binding.path) ?? binding.fallback;
  }
  return resolveRuntimeBinding(
    {
      source,
      path: binding.path,
      ...(binding.fallback !== undefined ? { fallback: binding.fallback } : {})
    },
    ctx
  );
}

export function normalizeNodes(
  nodes: DynamicValue<NodeChild[] | NodeChild> | undefined,
  ctx: RendererContext
): NodeChild[] {
  return normalizeRuntimeNodes<SchemaContext, OptionsExtensionNode>(nodes, ctx);
}

export function resolveValue<T>(
  value: DynamicValue<T> | undefined,
  ctx: RendererContext
): T | undefined {
  return resolveRuntimeValue(value, ctx);
}
