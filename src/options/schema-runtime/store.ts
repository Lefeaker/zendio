export interface SchemaStore<State> {
  getState: () => State;
  mutate: (mutator: (state: State) => void, options?: { silent?: boolean }) => void;
  subscribe: (listener: (state: State) => void) => () => void;
}

export function createSchemaStore<State>(
  initialState: State,
  onChange?: (state: State) => void
): SchemaStore<State> {
  const state = initialState;
  const listeners = new Set<(state: State) => void>();

  function emit(): void {
    onChange?.(state);
    listeners.forEach((listener) => {
      listener(state);
    });
  }

  return {
    getState() {
      return state;
    },
    mutate(mutator, options = {}) {
      mutator(state);
      if (!options.silent) {
        emit();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
