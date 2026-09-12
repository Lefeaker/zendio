import type { Messages } from '@i18n';
import { syncSegmentedNav } from '@options/stitch/ui/components';
import type { PreviewStoreState } from '@options/stitch/types';
import {
  HIGHLIGHT_THEME_CLASSES,
  isHighlightTheme,
  persistTheme
} from './productionStitchStateMapper';
import {
  fragmentModifierStateWarning,
  normalizeFragmentModifierKeys
} from './fragmentModifierOptions';

interface RenderControlOptions {
  mountRoot: HTMLElement;
  getState(): PreviewStoreState;
  getMessages?(): Messages | null;
}

export function createProductionStitchRenderControls(options: RenderControlOptions) {
  const { mountRoot } = options;

  function syncHighlightThemeControls(): void {
    const state = options.getState();
    const theme = isHighlightTheme(state.highlightTheme) ? state.highlightTheme : 'gradient';
    mountRoot.querySelectorAll<HTMLElement>('.highlight-theme-control').forEach((group) => {
      syncSegmentedNav(group, theme);
    });

    const highlight = mountRoot.querySelector<HTMLElement>(
      '.highlight-inline-example .inline-highlight'
    );
    if (highlight) {
      highlight.classList.remove(...Object.values(HIGHLIGHT_THEME_CLASSES));
      highlight.classList.add(HIGHLIGHT_THEME_CLASSES[theme]);
    }
  }

  function syncModifierControls(): void {
    const state = options.getState();
    const activeKey = normalizeFragmentModifierKeys(state.modifierKeys)[0];
    mountRoot
      .querySelectorAll<HTMLElement>('.selection-trigger-inline > .segmented-control')
      .forEach((group) => {
        syncSegmentedNav(group, state.fragmentSelectionTriggerMode);
      });
    mountRoot.querySelectorAll<HTMLElement>('.modifier-key-choices').forEach((choices) => {
      choices.style.display = state.fragmentSelectionTriggerMode === 'modifier' ? 'grid' : 'none';
      const group = choices.querySelector<HTMLElement>('.segmented-control');
      if (group) syncSegmentedNav(group, activeKey);
    });
    const warning = fragmentModifierStateWarning(state, options.getMessages?.());
    mountRoot.querySelectorAll<HTMLElement>('.modifier-key-warning').forEach((node) => {
      node.textContent = warning;
      node.style.display = warning ? '' : 'none';
    });
  }

  function syncPreviewThemeControls(): void {
    const state = options.getState();
    const preference =
      state.interfaceThemePreference === 'light' || state.interfaceThemePreference === 'system'
        ? state.interfaceThemePreference
        : 'dark';
    mountRoot
      .querySelectorAll<HTMLElement>('.interface-theme-grid .segmented-control')
      .forEach((group) => {
        syncSegmentedNav(group, preference);
      });
  }

  function applySystemThemePreferenceChange(): void {
    const state = options.getState();
    if (state.interfaceThemePreference !== 'system') {
      return;
    }
    state.previewTheme = persistTheme('system');
    syncPreviewThemeControls();
  }

  return {
    applySystemThemePreferenceChange,
    syncHighlightThemeControls,
    syncModifierControls,
    syncPreviewThemeControls
  };
}
