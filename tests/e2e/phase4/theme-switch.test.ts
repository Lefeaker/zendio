/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeSwitcher } from '../../../src/ui/domains/theme';
import { withDomEnvironment, type DomGlobalKey } from '../../utils/domEnvironment';

const DOM_GLOBALS: DomGlobalKey[] = [
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLDivElement',
  'HTMLSpanElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent',
  'MutationObserver'
] as const;

describe('phase4/theme switcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads persisted theme settings and reflects them in UI state', async () => {
    await withDomEnvironment(
      '<!DOCTYPE html><html><body><div id="theme-switcher"></div></body></html>',
      { globals: DOM_GLOBALS },
      async ({ document, window }) => {
        await withGlobalLocalStorage(window, () => {
          stubMatchMedia(window, false);
          window.localStorage.setItem('aob-theme', 'dark');
          const container = document.getElementById('theme-switcher');
          if (!container) {
            throw new Error('missing theme switcher container');
          }

          const switcher = new ThemeSwitcher(container);
          try {
            switcher.init();

            expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
            const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
            expect(toggle?.checked).toBe(true);
          } finally {
            switcher.destroy();
          }
        });
      }
    );
  });

  it('updates dataset, dispatches theme-changed, and persists preference on toggle', async () => {
    await withDomEnvironment(
      '<!DOCTYPE html><html><body><div id="theme-switcher"></div></body></html>',
      { globals: DOM_GLOBALS },
      async ({ document, window }) => {
        await withGlobalLocalStorage(window, async () => {
          vi.useFakeTimers();
          try {
            stubMatchMedia(window, true);
            window.localStorage.setItem('aob-theme', 'dark');

            const container = document.getElementById('theme-switcher');
            if (!container) {
              throw new Error('missing theme switcher container');
            }

            const switcher = new ThemeSwitcher(container);
            try {
              switcher.init();

              const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
              if (!toggle) {
                throw new Error('toggle missing');
              }

              const events: CustomEvent<{ theme: string }>[] = [];
              const handler = (event: Event) => {
                events.push(event as CustomEvent<{ theme: string }>);
              };
              window.addEventListener('theme-changed', handler);

              toggle.checked = false;
              toggle.dispatchEvent(new window.Event('change', { bubbles: true }));
              await vi.runOnlyPendingTimersAsync();

              expect(document.documentElement.getAttribute('data-theme')).toBe('light');
              expect(window.localStorage.getItem('aob-theme')).toBe('light');
              expect(events.length).toBeGreaterThan(0);
              const lastEvent = events.at(-1);
              expect(lastEvent?.detail.theme).toBe('light');
              expect(document.documentElement.classList.contains('theme-transitioning')).toBe(
                false
              );
            } finally {
              switcher.destroy();
            }
          } finally {
            vi.useRealTimers();
          }
        });
      }
    );
  });
});

function stubMatchMedia(window: Window & typeof globalThis, matches: boolean): void {
  const mediaQueryList: MediaQueryList = {
    matches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false
  };
  window.matchMedia = vi
    .fn()
    .mockReturnValue(mediaQueryList) as unknown as typeof window.matchMedia;
}

async function withGlobalLocalStorage<T>(
  window: Window & typeof globalThis,
  run: () => Promise<T> | T
): Promise<T> {
  const globals = globalThis as typeof globalThis & { localStorage?: Storage };
  const previous = globals.localStorage;
  globals.localStorage = window.localStorage;
  try {
    return await run();
  } finally {
    if (typeof previous === 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete globals.localStorage;
    } else {
      globals.localStorage = previous;
    }
  }
}
