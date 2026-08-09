export interface RuntimeStateBinding<TContext> {
  source?: Extract<keyof TContext, 'state' | 'appData'>;
  path: string;
  fallback?: unknown;
}

export function readRuntimePath(root: unknown, bindingPath: string): unknown {
  if (!bindingPath.trim()) {
    return root;
  }
  return bindingPath.split('.').reduce<unknown>((cursor, segment) => {
    if (cursor === null || cursor === undefined || typeof cursor !== 'object') {
      return undefined;
    }
    return Reflect.get(cursor, segment);
  }, root);
}
