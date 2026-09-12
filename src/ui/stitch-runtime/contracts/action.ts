export interface RuntimeActionDescriptor<TContext> {
  id: string;
  args?: unknown[] | ((ctx: TContext) => unknown[]);
  valueFrom?: 'target.value' | 'target.checked' | 'dataset.value';
}

export type RuntimeActionReference<TContext> = string | RuntimeActionDescriptor<TContext>;
