import { deepClone } from '../utils/clone';
import type { OptionsState, OptionsStateUpdate, StateListener, StateManager } from './types';
import { defaultOptionsState } from './types';

export class OptionsStateManager implements StateManager {
  private state: OptionsState;
  private readonly initialState: OptionsState;
  private readonly listeners = new Set<StateListener>();

  constructor(initialState: OptionsState = defaultOptionsState) {
    this.initialState = deepClone(initialState);
    this.state = deepClone(initialState);
  }

  getState(): OptionsState {
    return deepClone(this.state);
  }

  setState(update: OptionsStateUpdate): void {
    const nextState: OptionsState = {
      ...this.state,
      ...update,
      mountedSections: this.cloneMountedSections(update.mountedSections ?? this.state.mountedSections)
    };
    this.replaceState(nextState);
  }

  update(mutator: (draft: OptionsState) => void): void {
    const draft = deepClone(this.state);
    mutator(draft);
    this.replaceState(draft);
  }

  reset(nextState?: OptionsState): void {
    const baseline = nextState ? deepClone(nextState) : deepClone(this.initialState);
    this.replaceState(baseline);
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private replaceState(next: OptionsState): void {
    const hasChanged = !this.areStatesEqual(this.state, next);
    if (!hasChanged) {
      return;
    }
    this.state = deepClone(next);
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.getState());
    }
  }

  private areStatesEqual(current: OptionsState, next: OptionsState): boolean {
    // Fast path: reference equality
    if (current === next) {
      return true;
    }

    // Primitive fields
    if (
      current.language !== next.language ||
      current.isInitialized !== next.isInitialized ||
      current.activeSection !== next.activeSection
    ) {
      return false;
    }

    if (!this.areMountedSectionsEqual(current.mountedSections, next.mountedSections)) {
      return false;
    }

    // For complex fields fall back to JSON string comparison to avoid deep dependency.
    try {
      return (
        JSON.stringify(current.options) === JSON.stringify(next.options) &&
        JSON.stringify(current.usage) === JSON.stringify(next.usage)
      );
    } catch {
      return false;
    }
  }

  private areMountedSectionsEqual(
    current: Record<string, boolean>,
    next: Record<string, boolean>
  ): boolean {
    const currentKeys = Object.keys(current);
    const nextKeys = Object.keys(next);
    if (currentKeys.length !== nextKeys.length) {
      return false;
    }
    for (const key of currentKeys) {
      if (current[key] !== next[key]) {
        return false;
      }
    }
    return true;
  }

  private cloneMountedSections(sections: Record<string, boolean>): Record<string, boolean> {
    return { ...sections };
  }
}

export function createOptionsStateManager(initialState?: OptionsState): OptionsStateManager {
  return new OptionsStateManager(initialState ?? defaultOptionsState);
}
