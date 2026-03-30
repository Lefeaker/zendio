/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/utils/iconHelpers', () => ({
  Icons: { Moon: 'moon', Sun: 'sun' },
  createIcon: vi.fn((_icon: string, _opts: unknown) => document.createElement('span'))
}));

import { ThemeSwitcher } from '../../../src/ui/domains/theme';

function installLocalStorageMock(): void {
  const storage = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      }
    }
  });
}

describe('ThemeSwitcher', () => {
  beforeEach(() => {
    installLocalStorageMock();
    document.body.innerHTML = '<div id="theme"></div>';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('theme-transitioning');
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads saved theme and renders matching hint text', () => {
    localStorage.setItem('aob-theme', 'dark');
    const container = document.getElementById('theme');
    if (!container) throw new Error('missing container');

    const switcher = new ThemeSwitcher(container);
    switcher.init();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(container.textContent).toContain('Dark Mode');
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
  });

  it('falls back to matchMedia and toggles theme with persistence and event dispatch', () => {
    const matchMediaMock = vi.fn().mockReturnValue({ matches: true });
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMediaMock });
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    vi.useFakeTimers();

    const container = document.getElementById('theme');
    if (!container) throw new Error('missing container');
    const switcher = new ThemeSwitcher(container);
    switcher.init();

    const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!toggle) throw new Error('missing toggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('aob-theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(container.textContent).toContain('Light Mode');
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'theme-changed' }));

    vi.advanceTimersByTime(300);
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(false);
    vi.useRealTimers();
  });

  it('handles storage failures and destroys mounted ui', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const container = document.getElementById('theme');
    if (!container) throw new Error('missing container');
    const switcher = new ThemeSwitcher(container);
    switcher.init();

    const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!toggle) throw new Error('missing toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(setItemSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[ThemeSwitcher] Failed to save theme preference:',
      expect.any(Error)
    );

    switcher.destroy();
    expect(container.childElementCount).toBe(0);
  });
});
