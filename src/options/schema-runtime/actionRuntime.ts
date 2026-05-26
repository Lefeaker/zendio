import type { ActionDescriptor, SchemaContext } from './contracts';

export interface ActionContext<State, AppData> {
  descriptor: ActionDescriptor;
  args: unknown[];
  value: unknown;
  getContext: () => SchemaContext<State, AppData>;
  mutate: (mutator: (state: State) => void, options?: { silent?: boolean }) => void;
  dispatch: (action: ActionDescriptor | string, payload?: unknown) => void;
}

export type ActionHandler<State, AppData> = (context: ActionContext<State, AppData>) => void;

export type ActionRegistry<State, AppData> = Record<string, ActionHandler<State, AppData>>;

interface ActionRuntimeOptions<State, AppData> {
  getContext: () => SchemaContext<State, AppData>;
  mutate: (mutator: (state: State) => void, options?: { silent?: boolean }) => void;
  handlers: ActionRegistry<State, AppData>;
  onUnhandledAction?: (descriptor: ActionDescriptor) => void;
}

function toDescriptor(action: ActionDescriptor | string): ActionDescriptor {
  if (typeof action === 'string') {
    return {
      id: action
    };
  }
  return action;
}

function isEvent(value: unknown): value is Event {
  return typeof Event !== 'undefined' && value instanceof Event;
}

function extractActionValue(descriptor: ActionDescriptor, payload?: unknown): unknown {
  if (!isEvent(payload)) {
    return payload;
  }

  const target = payload.target as
    | (EventTarget & { value?: unknown; checked?: unknown; dataset?: DOMStringMap })
    | null;

  switch (descriptor.valueFrom) {
    case 'target.value':
      return target?.value;
    case 'target.checked':
      return target?.checked;
    case 'dataset.value':
      return target?.dataset?.value;
    default:
      return payload;
  }
}

export interface ActionRuntime {
  dispatch: (action: ActionDescriptor | string, payload?: unknown) => void;
  has: (actionId: string) => boolean;
}

export function createActionRuntime<State, AppData>(
  options: ActionRuntimeOptions<State, AppData>
): ActionRuntime {
  const { handlers } = options;

  function dispatch(action: ActionDescriptor | string, payload?: unknown): void {
    const descriptor = toDescriptor(action);
    const handler = handlers[descriptor.id];
    if (!handler) {
      options.onUnhandledAction?.(descriptor);
      return;
    }

    const args = descriptor.args ?? [];
    const value = extractActionValue(descriptor, payload);

    handler({
      descriptor,
      args,
      value,
      getContext: options.getContext,
      mutate: options.mutate,
      dispatch
    });
  }

  return {
    dispatch,
    has(actionId: string) {
      return Boolean(handlers[actionId]);
    }
  };
}
