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
}

export function createProductionStitchRenderControls(options: RenderControlOptions) {
  const { mountRoot } = options;

  function syncHighlightThemeControls(): void {
    const state = options.getState();
    const theme = isHighlightTheme(state.highlightTheme) ? state.highlightTheme : 'gradient';
    const themeValues = new Set(Object.keys(HIGHLIGHT_THEME_CLASSES));
    mountRoot.querySelectorAll<HTMLButtonElement>('.chips button[data-value]').forEach((button) => {
      if (!themeValues.has(button.dataset.value ?? '')) {
        return;
      }
      const isActive = button.dataset.value === theme;
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.classList.toggle('is-active', isActive);
      button.closest<HTMLElement>('.chips')?.setAttribute('data-active-value', theme);
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
      .querySelectorAll<HTMLInputElement>('.modifier-key-inline .switch input[type="checkbox"]')
      .forEach((input) => {
        input.checked = state.fragmentModifierEnabled;
      });
    mountRoot
      .querySelectorAll<HTMLButtonElement>('.modifier-key-inline .chips button[data-value]')
      .forEach((button) => {
        const isActive = button.dataset.value === activeKey;
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        button.classList.toggle('is-active', isActive);
        button.closest<HTMLElement>('.chips')?.setAttribute('data-active-value', activeKey);
      });
    mountRoot
      .querySelectorAll<HTMLElement>('.modifier-key-inline .modifier-key-warning')
      .forEach((node) => {
        node.textContent = fragmentModifierStateWarning(state);
      });
  }

  function syncPreviewThemeControls(): void {
    const state = options.getState();
    const preference =
      state.interfaceThemePreference === 'light' || state.interfaceThemePreference === 'system'
        ? state.interfaceThemePreference
        : 'dark';
    mountRoot.querySelectorAll<HTMLButtonElement>('.chips button[data-value]').forEach((button) => {
      if (!['light', 'dark', 'system'].includes(button.dataset.value ?? '')) {
        return;
      }
      const isActive = button.dataset.value === preference;
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.classList.toggle('is-active', isActive);
      button.closest<HTMLElement>('.chips')?.setAttribute('data-active-value', preference);
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
