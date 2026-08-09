import { readRuntimePath, type RuntimeStateBinding } from '../contracts/binding';
import type { RuntimeActionDescriptor, RuntimeActionReference } from '../contracts/action';
import type {
  RuntimeDynamicValue,
  RuntimeNodeChild,
  RuntimeRendererComponents,
  RuntimeSchemaContext
} from '../contracts/schema';
import type { el } from '../dom';

export type RuntimeRendererContext<TContext> = TContext & {
  el: typeof el;
  ui: RuntimeRendererComponents;
  dispatch: (id: string, args?: unknown[], value?: unknown, event?: Event) => void;
  resolveBinding?: (binding: string | RuntimeStateBinding<TContext> | undefined) => unknown;
  transformActionValue?: (
    action: RuntimeActionDescriptor<TContext>,
    value: unknown,
    event?: Event
  ) => unknown;
};

function isRuntimeResolver<T, TContext>(
  value: RuntimeDynamicValue<T, TContext>
): value is (ctx: TContext) => T {
  return typeof value === 'function';
}

export function resolveRuntimeValue<T, TContext>(
  value: RuntimeDynamicValue<T, TContext> | undefined,
  ctx: TContext
): T | undefined {
  if (value === undefined) return undefined;
  return isRuntimeResolver(value) ? value(ctx) : value;
}

export function resolveRuntimeBinding<TContext extends RuntimeSchemaContext<unknown, unknown>>(
  binding: string | RuntimeStateBinding<TContext> | undefined,
  ctx: TContext
): unknown {
  if (binding === undefined) {
    return undefined;
  }
  if (typeof binding === 'string') {
    return readRuntimePath(ctx.state, binding);
  }
  const root = binding.source === 'appData' ? ctx.appData : ctx.state;
  return readRuntimePath(root, binding.path) ?? binding.fallback;
}

export function normalizeRuntimeNodes<TContext, TExtensionNode>(
  nodes:
    | RuntimeDynamicValue<
        RuntimeNodeChild<TContext, TExtensionNode>[] | RuntimeNodeChild<TContext, TExtensionNode>,
        TContext
      >
    | undefined,
  ctx: TContext
): RuntimeNodeChild<TContext, TExtensionNode>[] {
  const resolved = resolveRuntimeValue(nodes, ctx);
  if (resolved === undefined || resolved === null || resolved === false) {
    return [];
  }
  return Array.isArray(resolved) ? resolved : [resolved];
}

export function runRuntimeEventAction<TContext>(
  action: RuntimeDynamicValue<RuntimeActionDescriptor<TContext>, TContext> | undefined,
  event: Event,
  ctx: RuntimeRendererContext<TContext>
): void {
  const resolved = resolveRuntimeValue(action, ctx);
  if (!resolved) return;
  const value = resolved.valueFrom
    ? extractRuntimeEventValue(event, resolved.valueFrom)
    : undefined;
  runRuntimeAction(resolved, ctx, value, event);
}

export function runRuntimeAction<TContext>(
  action: RuntimeDynamicValue<RuntimeActionReference<TContext>, TContext> | undefined,
  ctx: RuntimeRendererContext<TContext>,
  runtimeValue?: unknown,
  event?: Event
): void {
  const resolved = resolveRuntimeValue(action, ctx);
  if (!resolved) return;
  if (typeof resolved === 'string') {
    ctx.dispatch(resolved, [], runtimeValue, event);
    return;
  }
  const transformedValue = ctx.transformActionValue
    ? ctx.transformActionValue(resolved, runtimeValue, event)
    : runtimeValue;
  ctx.dispatch(
    resolved.id,
    resolveRuntimeValue(resolved.args, ctx) ?? [],
    transformedValue === undefined ? event : transformedValue,
    event
  );
}

export function extractRuntimeEventValue(
  event: Event,
  valueFrom: RuntimeActionDescriptor<unknown>['valueFrom']
): unknown {
  if (valueFrom === 'target.checked') {
    return event.target instanceof HTMLInputElement ? event.target.checked : undefined;
  }
  if (valueFrom === 'dataset.value') {
    return event.target instanceof HTMLElement ? event.target.dataset.value : undefined;
  }
  return event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLSelectElement ||
    event.target instanceof HTMLTextAreaElement
    ? event.target.value
    : undefined;
}
