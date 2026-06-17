/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asOptionsController,
  createController,
  createRepository,
  queryRequired,
  requireElement,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';
import { createProductionStitchActions } from '@options/app/productionStitchActions';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';

describe('mountProductionStitchShell theme', () => {
  beforeEach(setupProductionStitchShellTest);

  it('persists theme changes through the Stitch segmented control', () => {
    const controller = createController();
    const repository = createRepository();
    mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: null,
      messages: null,
      language: 'en',
      optionsRepository: repository
    });

    const main = document.querySelector<HTMLElement>('.main');
    const lightButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.chips button')
    ).find((button) => button.textContent === 'Light');
    lightButton?.click();

    expect(document.querySelector('.main')).toBe(main);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.previewTheme).toBe('light');
    expect(document.body.dataset.previewTheme).toBe('light');
    expect(window.localStorage.getItem('aob-theme')).toBe('light');
    expect(repository.set).toHaveBeenLastCalledWith({ interfaceTheme: 'light' });

    const darkButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.chips button')
    ).find((button) => button.textContent === 'Dark');
    darkButton?.click();

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.previewTheme).toBe('dark');
    expect(document.body.dataset.previewTheme).toBe('dark');
    expect(window.localStorage.getItem('aob-theme')).toBe('dark');
    expect(repository.set).toHaveBeenLastCalledWith({ interfaceTheme: 'dark' });
  });

  it('adds a system theme preference and resolves it immediately from media changes', () => {
    const controller = createController();
    const repository = createRepository();
    const mediaListeners = new Set<() => void>();
    const media = {
      matches: true,
      addEventListener: vi.fn((_event: string, callback: () => void) => {
        mediaListeners.add(callback);
      }),
      removeEventListener: vi.fn()
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(media as never);

    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: { interfaceTheme: 'system' },
      messages: null,
      language: 'en',
      optionsRepository: repository
    });

    const systemButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.chips button')
    ).find((button) => button.textContent === 'System');
    expect(systemButton).toBeTruthy();
    expect(document.documentElement.dataset.previewTheme).toBe('dark');
    expect(mounted.collectDraft().interfaceTheme).toBe('system');

    media.matches = false;
    mediaListeners.forEach((callback) => callback());

    expect(document.documentElement.dataset.previewTheme).toBe('light');
    expect(mounted.collectDraft().interfaceTheme).toBe('system');
    expect(window.localStorage.getItem('aob-theme')).toBe('system');
  });

  it('defaults the interface theme preference to system', () => {
    const controller = createController();
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as never);

    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      messages: null,
      language: 'en'
    });

    expect(mounted.collectDraft().interfaceTheme).toBe('system');
    expect(document.documentElement.dataset.previewTheme).toBe('light');
    expect(window.localStorage.getItem('aob-theme')).toBe('system');
  });

  it('routes theme dispatch through the production action owner', () => {
    const state = { interfaceThemePreference: 'dark', previewTheme: 'dark' };
    const persistThemePreference = vi.fn();
    const syncPreviewThemeControls = vi.fn();
    const actions = createProductionStitchActions({
      getCurrentLanguage: () => 'en',
      getMessages: () => null,
      getState: () => state,
      persistThemePreference,
      syncPreviewThemeControls
    } as never);

    actions['preview:setTheme']({
      value: 'light',
      mutate: (mutator: (next: typeof state) => void) => mutator(state)
    } as never);

    expect(state.interfaceThemePreference).toBe('light');
    expect(state.previewTheme).toBe('light');
    expect(persistThemePreference).toHaveBeenCalledWith('light');
    expect(syncPreviewThemeControls).toHaveBeenCalled();
  });

  it('updates the reading highlight theme without remounting the options page', () => {
    const controller = createController();
    const mounted = mountProductionStitchShell({
      controller: asOptionsController(controller),
      initialOptions: { readingSession: { highlightTheme: 'gradient' } },
      messages: null,
      language: 'en'
    });

    const main = queryRequired<HTMLElement>('.main');
    const purpleButton = requireElement(
      Array.from(document.querySelectorAll<HTMLButtonElement>('.chips button')).find(
        (button) => button.textContent === 'Solid purple'
      ),
      'Solid purple highlight chip'
    );

    purpleButton.click();

    expect(document.querySelector('.main')).toBe(main);
    expect(mounted.collectDraft().readingSession.highlightTheme).toBe('purple');
    expect(purpleButton?.getAttribute('aria-pressed')).toBe('true');
    expect(
      document.querySelector('.inline-highlight')?.classList.contains('highlight-purple')
    ).toBe(true);
  });
});
