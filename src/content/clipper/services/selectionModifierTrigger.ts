import type { FragmentModifierKey } from '@shared/types/options';
import {
  isSelectionTriggerConfigured,
  type SelectionTriggerConfig
} from '@shared/config/selectionTriggerMode';

interface ModifierState {
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export type ModifierSource = Partial<ModifierState>;

function createModifierState(): ModifierState {
  return {
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false
  };
}

function isModifierKeyActive(key: FragmentModifierKey, state: ModifierState): boolean {
  switch (key) {
    case 'alt':
      return state.altKey;
    case 'meta':
      return state.metaKey;
    case 'ctrl':
      return state.ctrlKey;
    case 'shift':
      return state.shiftKey;
  }
}

function hasConfiguredModifiers(config: SelectionTriggerConfig): boolean {
  return config.selectionModifierKeys.length > 0;
}

function areConfiguredModifiersActive(
  config: SelectionTriggerConfig,
  state: ModifierState
): boolean {
  return (
    hasConfiguredModifiers(config) &&
    config.selectionModifierKeys.every((key) => isModifierKeyActive(key, state))
  );
}

export function modifierSourceFromEvent(event: Event): ModifierSource {
  const source: ModifierSource = {};
  if ('altKey' in event) source.altKey = Boolean(event.altKey);
  if ('metaKey' in event) source.metaKey = Boolean(event.metaKey);
  if ('ctrlKey' in event) source.ctrlKey = Boolean(event.ctrlKey);
  if ('shiftKey' in event) source.shiftKey = Boolean(event.shiftKey);
  return source;
}

/**
 * Owns modifier-key state and pointer-gesture latching for selection-triggered
 * capture. All content surfaces use this class so disabled, direct, and modifier
 * modes cannot drift apart.
 */
export class SelectionModifierTrigger {
  private readonly modifierState = createModifierState();
  private pointerGestureArmed = false;

  updateModifierState(source: ModifierSource): void {
    if ('altKey' in source) this.modifierState.altKey = Boolean(source.altKey);
    if ('metaKey' in source) this.modifierState.metaKey = Boolean(source.metaKey);
    if ('ctrlKey' in source) this.modifierState.ctrlKey = Boolean(source.ctrlKey);
    if ('shiftKey' in source) this.modifierState.shiftKey = Boolean(source.shiftKey);
  }

  beginPointerGesture(config: SelectionTriggerConfig, event: MouseEvent): boolean {
    this.pointerGestureArmed = false;
    if (event.button !== 0 || !isSelectionTriggerConfigured(config)) {
      return false;
    }

    this.updateModifierState(event);
    this.pointerGestureArmed =
      config.selectionTriggerMode === 'direct' ||
      areConfiguredModifiersActive(config, this.modifierState);
    return this.pointerGestureArmed;
  }

  canTrigger(config: SelectionTriggerConfig, source?: ModifierSource): boolean {
    if (source) {
      this.updateModifierState(source);
    }
    if (config.selectionTriggerMode === 'disabled') {
      return false;
    }
    if (config.selectionTriggerMode === 'direct') {
      return true;
    }
    return this.pointerGestureArmed || areConfiguredModifiersActive(config, this.modifierState);
  }

  shouldTrackSelection(config: SelectionTriggerConfig): boolean {
    return this.canTrigger(config);
  }

  completePointerGesture(): void {
    this.pointerGestureArmed = false;
  }

  reset(): void {
    this.modifierState.altKey = false;
    this.modifierState.metaKey = false;
    this.modifierState.ctrlKey = false;
    this.modifierState.shiftKey = false;
    this.pointerGestureArmed = false;
  }
}
