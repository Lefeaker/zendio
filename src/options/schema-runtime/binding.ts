import type { SchemaContext, SchemaValue, StateBinding } from './contracts';

function isBinding(value: unknown): value is StateBinding {
  return (
    Boolean(value) && typeof value === 'object' && typeof (value as StateBinding).path === 'string'
  );
}

export function readPath(root: unknown, path: string): unknown {
  if (!path.trim()) {
    return root;
  }

  return path.split('.').reduce<unknown>((cursor, segment) => {
    if (cursor === null || cursor === undefined) {
      return undefined;
    }
    if (typeof cursor !== 'object') {
      return undefined;
    }
    const record = cursor as Record<string, unknown>;
    return record[segment];
  }, root);
}

export function setPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) {
    return;
  }

  let cursor: Record<string, unknown> = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const nextValue = cursor[segment];
    if (!nextValue || typeof nextValue !== 'object') {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }

  cursor[segments[segments.length - 1]] = value;
}

export function resolveBinding<State, AppData>(
  binding: StateBinding,
  ctx: SchemaContext<State, AppData>
): unknown {
  const source = binding.source ?? 'state';
  const root = source === 'appData' ? ctx.appData : ctx.state;
  const resolved = readPath(root, binding.path);
  return resolved ?? binding.fallback;
}

export function resolveSchemaValue<State, AppData, T>(
  value: SchemaValue<T, State, AppData> | undefined,
  ctx: SchemaContext<State, AppData>
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'function') {
    return (value as (context: SchemaContext<State, AppData>) => T)(ctx);
  }

  if (isBinding(value)) {
    return resolveBinding(value, ctx) as T;
  }

  return value as T;
}
