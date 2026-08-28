import type { ActionRegistry } from '@options/schema-runtime/actionRuntime';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';
import { isFragmentSelectionTriggerMode } from '@shared/config/selectionTriggerMode';
import type { CompleteOptions } from '@shared/types/options';
import {
  normalizeFragmentModifierKey,
  normalizeFragmentModifierKeys
} from './fragmentModifierOptions';
import type { SectionInvalidationScope } from '@ui/stitch-runtime/render/sectionInvalidation';

interface ProductionSelectionTriggerActionContext {
  getDraft(): CompleteOptions;
  getState(): PreviewStoreState;
  scheduleDraftSave(): void;
  render(scope: SectionInvalidationScope): void;
  syncModifierControls(): void;
}

export function createProductionSelectionTriggerActions(
  context: ProductionSelectionTriggerActionContext
): ActionRegistry<PreviewStoreState, PreviewContent> {
  return {
    'selection-trigger:setMode': ({ value }) => {
      const draft = context.getDraft();
      const state = context.getState();
      const mode = isFragmentSelectionTriggerMode(value) ? value : 'disabled';
      const selectedKeys = normalizeFragmentModifierKeys(
        state.modifierKeys.length ? state.modifierKeys : draft.fragmentClipper.selectionModifierKeys
      );
      draft.fragmentClipper.selectionTriggerMode = mode;
      draft.fragmentClipper.selectionModifierKeys = selectedKeys;
      state.fragmentSelectionTriggerMode = mode;
      state.modifierKeys = selectedKeys;
      context.scheduleDraftSave();
      context.render('capture-behavior');
    },
    'modifier:setKey': ({ value }) => {
      const draft = context.getDraft();
      const state = context.getState();
      const key = normalizeFragmentModifierKey(typeof value === 'string' ? value : undefined);
      state.modifierKeys = [key];
      state.fragmentSelectionTriggerMode = 'modifier';
      draft.fragmentClipper.selectionTriggerMode = 'modifier';
      draft.fragmentClipper.selectionModifierKeys = [key];
      context.scheduleDraftSave();
      context.syncModifierControls();
    }
  };
}
