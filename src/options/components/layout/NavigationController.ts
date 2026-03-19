type CleanupFn = () => void;

interface NavigationEntry {
  link: HTMLAnchorElement;
  item: HTMLElement | null;
  target: HTMLElement;
  sectionId: string;
  isObserved: boolean;
}

export interface NavigationControllerOptions {
  root?: ParentNode | null;
  document?: Document | null;
  window?: Window | null;
  navSelector?: string;
  linkSelector?: string;
  observerFactory?: typeof IntersectionObserver;
}

const ACTIVE_ITEM_CLASS = 'is-current';
const LEGACY_ACTIVE_CLASS = 'aobx-navigation__item--active';
const ACTIVE_LINK_ATTR = 'aria-current';
const NAV_CONTAINER_SELECTOR = '.aobx-navigation, .aobx-nav';
const NAV_LINK_SELECTOR = '.aobx-navigation .aobx-tree-item > a[href^="#"], .aobx-nav .aobx-tree-item > a[href^="#"]';
const ITEM_SELECTOR = '.aobx-tree-item, .aobx-navigation__item';
const SCROLL_BLOCK: ScrollLogicalPosition = 'start';
const SCROLL_BEHAVIOR: ScrollBehavior = 'smooth';

/**
 * 控制侧边导航与内容区高亮联动，并负责事件清理。
 */
export class NavigationController {
  private readonly document: Document | null;
  private readonly window: Window | null;
  private readonly observerFactory: typeof IntersectionObserver | null;
  private readonly navContainer: Element | null;
  private readonly cleanupFns: CleanupFn[] = [];
  private readonly targetMap = new Map<Element, NavigationEntry>();
  private readonly entryBySection = new Map<string, NavigationEntry>();
  private entries: NavigationEntry[] = [];
  private observer: IntersectionObserver | null = null;
  private activeEntry: NavigationEntry | null = null;
  private disposed = false;

  constructor(options: NavigationControllerOptions = {}) {
    const root = options.root ?? null;
    this.document =
      options.document ??
      (root instanceof Document
        ? root
        : root instanceof HTMLElement
          ? root.ownerDocument
          : typeof document !== 'undefined'
            ? document
            : null);
    this.window = options.window ?? this.document?.defaultView ?? (typeof window !== 'undefined' ? window : null);
    const windowWithObserver = this.window as (Window & { IntersectionObserver?: typeof IntersectionObserver }) | null;
    this.observerFactory = options.observerFactory ?? windowWithObserver?.IntersectionObserver ?? null;

    const queryRoot =
      (root as Document | Element | null) ??
      this.document ??
      null;

    const selector = options.navSelector ?? NAV_CONTAINER_SELECTOR;
    this.navContainer =
      (queryRoot && 'querySelector' in queryRoot ? queryRoot.querySelector(selector) : null) ??
      this.document?.querySelector(selector) ??
      null;

    if (!this.document || !this.window || !this.navContainer || !this.observerFactory) {
      return;
    }

    this.initialize(options);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    while (this.cleanupFns.length) {
      try {
        this.cleanupFns.pop()?.();
      } catch (error) {
        console.error('[options][navigation] 清理导航事件时出错:', error);
      }
    }

    this.entries.forEach((entry) => {
      if (entry.isObserved) {
        this.observer?.unobserve(entry.target);
      }
    });

    this.observer?.disconnect();
    this.observer = null;
    this.entries = [];
    this.targetMap.clear();
    this.entryBySection.clear();
    this.activeEntry = null;
  }

  private initialize(options: NavigationControllerOptions): void {
    const windowRef = this.window;
    const documentRef = this.document;
    const observerFactory = this.observerFactory;
    if (!windowRef || !documentRef || !observerFactory) {
      return;
    }
    const linkSelector = options.linkSelector ?? NAV_LINK_SELECTOR;
    const linkElements = Array.from(
      this.navContainer?.querySelectorAll<HTMLAnchorElement>(linkSelector) ?? []
    );
    if (linkElements.length === 0) {
      return;
    }

    const entries: NavigationEntry[] = [];
    const targetMap = this.targetMap;
    const entryBySection = this.entryBySection;

    for (const link of linkElements) {
      const href = link.getAttribute('href');
      if (!href || !href.startsWith('#')) {
        continue;
      }
      const targetId = href.slice(1);
      if (!targetId) {
        continue;
      }
      const target = documentRef.getElementById(targetId);
      if (!target) {
        continue;
      }
      const item = link.closest<HTMLElement>(ITEM_SELECTOR);
      const sectionId = targetId.startsWith('section-') ? targetId.slice('section-'.length) : targetId;
      const entry: NavigationEntry = { link, item, target, sectionId, isObserved: false };
      entries.push(entry);
      targetMap.set(target, entry);
      entryBySection.set(sectionId, entry);
    }

    if (entries.length === 0) {
      return;
    }

    this.entries = entries;
    const prefersReducedMotion =
      typeof windowRef.matchMedia === 'function' && windowRef.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const observer = new observerFactory(
      (observerEntries) => {
        const visible = observerEntries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible.length === 0) {
          return;
        }

        const topEntry = targetMap.get(visible[0].target);
        if (topEntry) {
          this.setActiveEntry(topEntry);
        }
      },
      {
        root: null,
        threshold: [0.15, 0.4, 0.65],
        rootMargin: '-35% 0px -40% 0px'
      }
    );

    this.observer = observer;
    this.cleanupFns.push(() => observer.disconnect());

    const observeIfMounted = (entry: NavigationEntry | null | undefined): void => {
      if (!entry || entry.isObserved) {
        return;
      }
      if (this.isDomSectionMounted(entry)) {
        observer.observe(entry.target);
        entry.isObserved = true;
      }
    };

    const unobserveEntry = (entry: NavigationEntry | null | undefined): void => {
      if (!entry || !entry.isObserved) {
        return;
      }
      observer.unobserve(entry.target);
      entry.isObserved = false;
    };

    entries.forEach((entry) => observeIfMounted(entry));

    entries.forEach((entry) => {
      const handleClick = (event: Event): void => {
        event.preventDefault();
        observeIfMounted(entry);
        entry.target.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : SCROLL_BEHAVIOR,
          block: SCROLL_BLOCK
        });

        this.setActiveEntry(entry);
      };

      entry.link.addEventListener('click', handleClick);
      this.cleanupFns.push(() => entry.link.removeEventListener('click', handleClick));
    });

    const syncWithHash = (): void => {
      const hash = this.window?.location.hash.replace('#', '') ?? '';
      if (!hash) {
        return;
      }
      const entry = entries.find((item) => item.target.id === hash);
      if (entry) {
        observeIfMounted(entry);
        this.setActiveEntry(entry);
        entry.target.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : SCROLL_BEHAVIOR,
          block: SCROLL_BLOCK
        });
      }
    };

    if (windowRef.location.hash) {
      syncWithHash();
    } else {
      const presetEntry = entries.find((entry) => entry.item?.classList.contains(ACTIVE_ITEM_CLASS)) ?? entries[0];
      if (presetEntry) {
        observeIfMounted(presetEntry);
        this.setActiveEntry(presetEntry);
      }
    }

    const hashListener = (): void => {
      syncWithHash();
    };

    windowRef.addEventListener('hashchange', hashListener);
    this.cleanupFns.push(() => windowRef.removeEventListener('hashchange', hashListener));

    const mountedListener = (event: Event): void => {
      const { detail } = event as CustomEvent<{ sectionId?: string }>;
      if (!detail?.sectionId) {
        return;
      }
      observeIfMounted(entryBySection.get(detail.sectionId));
    };

    const unmountedListener = (event: Event): void => {
      const { detail } = event as CustomEvent<{ sectionId?: string }>;
      if (!detail?.sectionId) {
        return;
      }
      const entry = entryBySection.get(detail.sectionId);
      if (!entry) {
        return;
      }
      unobserveEntry(entry);
      if (this.activeEntry === entry) {
        this.setActiveEntry(null);
      }
    };

    documentRef.addEventListener('aob:sectionmounted', mountedListener);
    documentRef.addEventListener('aob:sectionunmounted', unmountedListener);
    this.cleanupFns.push(() => {
      documentRef.removeEventListener('aob:sectionmounted', mountedListener);
      documentRef.removeEventListener('aob:sectionunmounted', unmountedListener);
    });
  }

  private isDomSectionMounted(entry: NavigationEntry): boolean {
    return entry.target.dataset.sectionMounted === 'true';
  }

  private setActiveEntry(entry: NavigationEntry | null): void {
    if (entry === this.activeEntry) {
      return;
    }

    if (this.activeEntry) {
      this.activeEntry.item?.classList.remove(ACTIVE_ITEM_CLASS, LEGACY_ACTIVE_CLASS, 'is-active');
      this.activeEntry.link.removeAttribute(ACTIVE_LINK_ATTR);
    }

    if (entry) {
      entry.item?.classList.add(ACTIVE_ITEM_CLASS, LEGACY_ACTIVE_CLASS, 'is-active');
      entry.link.setAttribute(ACTIVE_LINK_ATTR, 'true');
    }

    this.activeEntry = entry;
  }
}
