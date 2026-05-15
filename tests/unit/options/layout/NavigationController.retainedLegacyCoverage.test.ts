/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NavigationController } from '@options/components/layout/NavigationController';

class MockIntersectionObserver implements IntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly thresholds: ReadonlyArray<number>;
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();
  readonly takeRecords = vi.fn(() => []);
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    const rootCandidate = options?.root ?? null;
    this.root =
      rootCandidate instanceof Element || rootCandidate instanceof Document ? rootCandidate : null;
    this.rootMargin = options?.rootMargin ?? '';
    const threshold = options?.threshold;
    this.thresholds = Array.isArray(threshold)
      ? [...threshold]
      : threshold === undefined
        ? [0]
        : [threshold];
    MockIntersectionObserver.instances.push(this);
  }

  emit(
    target: Element,
    isIntersecting: boolean = true,
    intersectionRatio: number = isIntersecting ? 1 : 0
  ): void {
    const rect = target.getBoundingClientRect();
    const entry: IntersectionObserverEntry = {
      time: Date.now(),
      target,
      isIntersecting,
      intersectionRatio,
      boundingClientRect: rect,
      intersectionRect: rect,
      rootBounds: null
    };
    this.callback([entry], this);
  }

  emitEntries(
    entries: Array<{ target: Element; isIntersecting?: boolean; intersectionRatio?: number }>
  ): void {
    this.callback(
      entries.map(
        ({ target, isIntersecting = true, intersectionRatio = isIntersecting ? 1 : 0 }) => {
          const rect = target.getBoundingClientRect();
          return {
            time: Date.now(),
            target,
            isIntersecting,
            intersectionRatio,
            boundingClientRect: rect,
            intersectionRect: rect,
            rootBounds: null
          } satisfies IntersectionObserverEntry;
        }
      ),
      this
    );
  }
}

describe('NavigationController', () => {
  const originalObserver = globalThis.IntersectionObserver;

  const originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollIntoView'
  );

  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    (
      globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver }
    ).IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
    HTMLElement.prototype.scrollIntoView = function () {};

    document.body.innerHTML = `
      <nav class="aobx-navigation aobx-nav">
        <div class="aobx-tree-item">
          <a href="#section-usage" id="usageLink">Usage</a>
        </div>
        <div class="aobx-tree-item">
          <a href="#section-rest" id="restLink">Rest</a>
        </div>
      </nav>
      <main>
        <section id="section-usage" data-section-mounted="true"></section>
        <section id="section-rest"></section>
      </main>
    `;
  });

  afterEach(() => {
    window.location.hash = '';
    document.body.innerHTML = '';
    if (originalObserver) {
      (globalThis as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
        originalObserver;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (globalThis as Record<string, unknown>).IntersectionObserver;
    }
    if (originalScrollIntoViewDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        'scrollIntoView',
        originalScrollIntoViewDescriptor
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });

  it('activates section when navigation link is clicked', async () => {
    const usageSection = document.getElementById('section-usage');
    if (!(usageSection instanceof HTMLElement)) {
      throw new Error('Usage section not found');
    }
    const scrollSpy = vi.spyOn(usageSection, 'scrollIntoView');

    const controller = new NavigationController({ document, window });
    expect(MockIntersectionObserver.instances.length).toBeGreaterThan(0);

    const usageLink = document.getElementById('usageLink');
    if (!(usageLink instanceof HTMLAnchorElement)) {
      throw new Error('Usage link not found');
    }
    usageLink.click();
    await Promise.resolve();

    expect(scrollSpy).toHaveBeenCalled();
    expect(usageLink.getAttribute('aria-current')).toBe('true');

    controller.dispose();
  });

  it('disconnects observer on dispose', () => {
    const controller = new NavigationController({ document, window });
    const instance = MockIntersectionObserver.instances.at(-1);
    expect(instance).toBeDefined();

    controller.dispose();
    expect(instance?.disconnect).toHaveBeenCalled();
  });

  it('constructs as no-op when navigation container or observer factory is missing', () => {
    document.body.innerHTML = '<main><section id="section-usage"></section></main>';
    const noNavController = new NavigationController({ document, window });
    noNavController.dispose();

    document.body.innerHTML =
      '<nav class="aobx-navigation"></nav><main><section id="section-usage"></section></main>';
    const noObserverController = new NavigationController({
      document,
      window,
      observerFactory: null as unknown as typeof IntersectionObserver
    });
    noObserverController.dispose();
    expect(MockIntersectionObserver.instances).toHaveLength(0);
  });

  it('picks the highest-ratio visible entry and reacts to section mount lifecycle', () => {
    const controller = new NavigationController({ document, window });
    const instance = MockIntersectionObserver.instances.at(-1);
    const usageSection = document.getElementById('section-usage');
    const restSection = document.getElementById('section-rest');
    if (
      !(usageSection instanceof HTMLElement) ||
      !(restSection instanceof HTMLElement) ||
      !instance
    ) {
      throw new Error('Required navigation elements missing');
    }

    restSection.dataset.sectionMounted = 'true';
    document.dispatchEvent(
      new CustomEvent('aob:sectionmounted', { detail: { sectionId: 'rest' } })
    );
    expect(instance.observe).toHaveBeenCalledWith(restSection);

    instance.emitEntries([
      { target: usageSection, isIntersecting: true, intersectionRatio: 0.2 },
      { target: restSection, isIntersecting: true, intersectionRatio: 0.8 }
    ]);

    expect(document.getElementById('restLink')?.getAttribute('aria-current')).toBe('true');

    document.dispatchEvent(
      new CustomEvent('aob:sectionunmounted', { detail: { sectionId: 'rest' } })
    );
    expect(instance.unobserve).toHaveBeenCalledWith(restSection);
    expect(document.getElementById('restLink')?.getAttribute('aria-current')).toBeNull();
    controller.dispose();
  });

  it('uses auto scroll when reduced motion is preferred and keeps preset active item without hash', () => {
    const restItem = document.getElementById('restLink')?.closest('.aobx-tree-item');
    restItem?.classList.add('is-current');
    window.history.replaceState({}, '', '/options.html');
    const matchMediaSpy = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation(() => ({ matches: true }) as MediaQueryList);
    const restSection = document.getElementById('section-rest');
    if (!(restSection instanceof HTMLElement)) {
      throw new Error('Rest section not found');
    }
    const scrollSpy = vi.spyOn(restSection, 'scrollIntoView');

    const controller = new NavigationController({ document, window });
    restSection.dataset.sectionMounted = 'true';
    document.dispatchEvent(
      new CustomEvent('aob:sectionmounted', { detail: { sectionId: 'rest' } })
    );
    (document.getElementById('restLink') as HTMLAnchorElement).click();

    expect(document.getElementById('restLink')?.getAttribute('aria-current')).toBe('true');
    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
    controller.dispose();
    controller.dispose();
    matchMediaSpy.mockRestore();
  });

  it('syncs active link from hashchange events', async () => {
    const controller = new NavigationController({ document, window });
    window.location.hash = '#section-rest';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await Promise.resolve();

    const restLink = document.getElementById('restLink');
    const usageLink = document.getElementById('usageLink');
    expect(restLink?.getAttribute('aria-current')).toBe('true');
    expect(usageLink?.getAttribute('aria-current')).toBeNull();
    controller.dispose();
  });
});
