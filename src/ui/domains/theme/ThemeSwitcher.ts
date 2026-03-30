import { createUiIcon, UI_ICONS } from '../../foundation/icons';
import { createToggleElement } from '../../primitives/toggle';

export class ThemeSwitcher {
  private toggle: HTMLInputElement | null = null;
  private currentTheme: 'light' | 'dark' = 'light';
  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  init(): void {
    this.currentTheme = this.loadTheme();
    this.createUI();
    this.applyTheme(this.currentTheme, false);
  }

  private createUI(): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center gap-2';

    const moonIcon = createUiIcon(UI_ICONS.Moon, {
      size: 20,
      className: 'text-base-content'
    });
    moonIcon.setAttribute('aria-hidden', 'true');

    this.toggle = createToggleElement({
      checked: this.currentTheme === 'dark',
      ariaLabel: 'Toggle dark mode'
    });

    const sunIcon = createUiIcon(UI_ICONS.Sun, {
      size: 20,
      className: 'text-base-content'
    });
    sunIcon.setAttribute('aria-hidden', 'true');

    const label = document.createElement('label');
    label.className = 'flex items-center gap-2 cursor-pointer select-none';
    label.append(moonIcon, this.toggle, sunIcon);

    const hint = document.createElement('span');
    hint.className = 'text-sm text-base-content/60 ml-2';
    hint.textContent = this.currentTheme === 'dark' ? 'Dark Mode' : 'Light Mode';
    hint.id = 'theme-hint';

    wrapper.append(label, hint);
    this.container.replaceChildren(wrapper);

    this.toggle.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      const theme = checked ? 'dark' : 'light';
      this.applyTheme(theme, true);
      this.saveTheme(theme);
      hint.textContent = theme === 'dark' ? 'Dark Mode' : 'Light Mode';
    });
  }

  private applyTheme(theme: 'light' | 'dark', animate: boolean): void {
    const html = document.documentElement;

    if (animate) {
      html.classList.add('theme-transitioning');
      setTimeout(() => {
        html.classList.remove('theme-transitioning');
      }, 300);
    }

    html.setAttribute('data-theme', theme);
    this.currentTheme = theme;

    window.dispatchEvent(
      new CustomEvent('theme-changed', {
        detail: { theme }
      })
    );
  }

  private saveTheme(theme: 'light' | 'dark'): void {
    try {
      localStorage.setItem('aob-theme', theme);
    } catch (error) {
      console.warn('[ThemeSwitcher] Failed to save theme preference:', error);
    }
  }

  private loadTheme(): 'light' | 'dark' {
    try {
      const saved = localStorage.getItem('aob-theme');
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }

      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'dark' : 'light';
    } catch (error) {
      console.warn('[ThemeSwitcher] Failed to load theme preference:', error);
      return 'light';
    }
  }

  destroy(): void {
    this.toggle = null;
    this.container.replaceChildren();
  }
}
