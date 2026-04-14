/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi, type SpyInstance } from 'vitest';
import { OptionsApp } from '../../src/options/components/layout/OptionsApp';
import { NavigationController } from '../../src/options/components/layout/NavigationController';
import { createOptionsStateManager, type OptionsStateManager } from '../../src/options/state/StateManager';
import { getMessagesForLanguage } from '../../src/i18n';
import { FormSectionRegistry } from '../../src/options/components/formSections/formSectionManager';
import { createDomEnvironment, type DomEnvironmentHandle } from '../utils/domEnvironment';
import { BaseSection, type SectionRenderContext } from '../../src/options/components/sections/BaseSection';

vi.mock('../../src/options/components/sections/UsageSection', () => {
  return {
    UsageSection: class extends BaseSection<SectionRenderContext> {
      protected renderWithState(): HTMLElement {
        this.container.innerHTML = '<div id="usage-mock">Usage Section Mock</div>';
        return this.container;
      }
    }
  };
});

class MockIntersectionObserver implements IntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly observedTargets = new Set<Element>();
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly thresholds: ReadonlyArray<number>;
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    const rootCandidate = options?.root ?? null;
    this.root = rootCandidate instanceof Element || rootCandidate instanceof Document ? rootCandidate : null;
    this.rootMargin = options?.rootMargin ?? '0px';
    const threshold = options?.threshold;
    this.thresholds = Array.isArray(threshold) ? [...threshold] : threshold === undefined ? [0] : [threshold];
    MockIntersectionObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observedTargets.add(target);
  }

  unobserve(target: Element): void {
    this.observedTargets.delete(target);
  }

  disconnect(): void {
    this.observedTargets.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  emit(target: Element, isIntersecting = true): void {
    const rect = target.getBoundingClientRect();
    const entry: IntersectionObserverEntry = {
      time: Date.now(),
      target,
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
      boundingClientRect: rect,
      intersectionRect: rect,
      rootBounds: null
    };
    this.callback([entry], this);
  }

  static reset(): void {
    MockIntersectionObserver.instances.splice(0, MockIntersectionObserver.instances.length);
  }
}

describe('options navigation + lazy load e2e', () => {
  let env: DomEnvironmentHandle;
  let app: OptionsApp | null = null;
  let stateManager: OptionsStateManager;
  let cleanupNavigation: (() => void) | null = null;
  let navigateSpy: SpyInstance<Parameters<OptionsApp['navigateTo']>, ReturnType<OptionsApp['navigateTo']>>;
  let formRegistry: FormSectionRegistry;
  let originalIntersectionObserver: typeof IntersectionObserver | undefined;

  async function flushTasks(): Promise<void> {
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  beforeEach(async () => {
    MockIntersectionObserver.reset();

    env = createDomEnvironment(
      `
          <!DOCTYPE html>
          <html lang="en">
            <body>
              <div id="optionsShellRoot"></div>
            </body>
          </html>
        `,
      {
        url: 'https://options.test/',
        globals: [
          'document',
          'navigator',
          'HTMLElement',
          'HTMLDivElement',
          'HTMLInputElement',
          'HTMLButtonElement',
          'HTMLAnchorElement',
          'Node'
        ]
      }
    );
    const domWindow = env.window;

    originalIntersectionObserver = globalThis.IntersectionObserver;
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: MockIntersectionObserver as unknown as typeof IntersectionObserver
    });
    domWindow.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

    domWindow.HTMLElement.prototype.scrollIntoView = vi.fn();
    domWindow.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn()
    }));

    const container = domWindow.document.getElementById('optionsShellRoot');
    if (!container) {
      throw new Error('optionsShellRoot container missing');
    }

    const messages = await getMessagesForLanguage('en');
    stateManager = createOptionsStateManager();
    app = new OptionsApp(container);
    app.setMessages(messages);
    formRegistry = new FormSectionRegistry();
    app.render({
      stateManager,
      initialSection: 'usage',
      formRegistry
    });
    await app.mountSection('usage', true);
    navigateSpy = vi.spyOn(app, 'navigateTo');

    const navigation = new NavigationController({
      document: domWindow.document,
      window: domWindow
    });
    cleanupNavigation = () => navigation.dispose();
    cleanupNavigation = () => navigation.dispose();
  });

  afterEach(() => {
    cleanupNavigation?.();
    cleanupNavigation = null;
    navigateSpy?.mockRestore();
    app?.destroy();
    app = null;
    formRegistry.clear();
    MockIntersectionObserver.reset();

    if (originalIntersectionObserver) {
      Object.defineProperty(globalThis, 'IntersectionObserver', {
        configurable: true,
        writable: true,
        value: originalIntersectionObserver
      });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (globalThis as Record<string, unknown>)['IntersectionObserver'];
    }
    env.restore();
  });

  it('仅在导航触发时挂载目标 Section，并同步导航激活状态', async () => {
    const domWindow = env.window;
    const usageContainer = domWindow.document.getElementById('section-usage');
    const restContainer = domWindow.document.getElementById('section-rest');
    expect(usageContainer).not.toBeNull();
    expect(restContainer).not.toBeNull();
    if (!usageContainer || !restContainer) {
      throw new Error('Missing section containers in DOM');
    }

    const observerInstance = MockIntersectionObserver.instances.at(-1);
    expect(observerInstance).toBeDefined();
    expect(observerInstance?.observedTargets.has(usageContainer)).toBe(true);
    expect(observerInstance?.observedTargets.has(restContainer)).toBe(false);

    expect(restContainer?.dataset.sectionMounted).toBeUndefined();
    expect(stateManager.getState().mountedSections).not.toHaveProperty('rest');

    const restLink = domWindow.document.querySelector<HTMLAnchorElement>('a[href="#section-rest"]');
    expect(restLink).not.toBeNull();
    if (!restLink) {
      throw new Error('Rest navigation link not found');
    }
    restLink.dispatchEvent(
      new domWindow.MouseEvent('click', {
        bubbles: true,
        cancelable: true
      })
    );

    expect(navigateSpy).toHaveBeenCalledWith('rest');
    const lastCall = navigateSpy.mock.results.at(-1);
    if (!lastCall || lastCall.type !== 'return') {
      throw new Error('navigateTo 未返回 Promise');
    }
    await lastCall.value;
    await flushTasks();

    expect(restContainer?.dataset.sectionMounted).toBe('true');
    expect(stateManager.getState().mountedSections).toHaveProperty('rest', true);
    expect(stateManager.getState().activeSection).toBe('rest');
    expect(observerInstance?.observedTargets.has(restContainer)).toBe(true);
    expect(restLink?.closest('li')?.classList.contains('is-active')).toBe(true);
    expect(app?.getMountedSection('rest')).not.toBeNull();
  });
});
