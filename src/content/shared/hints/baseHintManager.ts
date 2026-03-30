export interface HintResult<State> {
  state: State;
  hint: string;
}

export abstract class BaseHintManager<State, Context> {
  private currentState: State;

  protected constructor(initialState: State) {
    this.currentState = initialState;
  }

  apply(state: State, context: Context): HintResult<State> {
    const resolved = this.resolveState(state, context);
    this.currentState = resolved;
    return {
      state: resolved,
      hint: this.getHint(resolved)
    };
  }

  refresh(context: Context): HintResult<State> {
    return this.apply(this.currentState, context);
  }

  getCurrentState(): State {
    return this.currentState;
  }

  protected abstract resolveState(state: State, context: Context): State;
  protected abstract getHint(state: State): string;
}
