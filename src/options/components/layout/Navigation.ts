import { BaseComponent } from '../../../ui/foundation/lifecycle/BaseComponent';

export interface NavigationItem {
  id: string;
  label: string;
  icon?: string;
}

export interface NavigationConfig {
  items: NavigationItem[];
  activeId?: string;
  onNavigate?: (id: string) => void;
}

/**
 * Navigation presenter that renders the sidebar tree.
 */
export class Navigation extends BaseComponent<NavigationConfig> {
  private onNavigate: ((id: string) => void) | undefined;
  private currentActiveId: string | undefined;

  render(config: NavigationConfig): HTMLElement {
    this.assertActive();
    this.onNavigate = config.onNavigate;
    this.currentActiveId = config.activeId;

    const nav = this.createElement('nav', 'aobx-navigation aobx-nav grid gap-3');
    const ariaLabel =
      this.messages?.settingsTitle ?? this.messages?.extensionSubtitle ?? '设置导航';
    nav.setAttribute('aria-label', ariaLabel);

    const list = this.createElement(
      'ul',
      'aobx-navigation__list aobx-tree list-none p-0 m-0 grid gap-0.5'
    );
    list.setAttribute('role', 'list');

    for (const item of config.items) {
      const listItem = this.createElement(
        'li',
        'aobx-navigation__item aobx-tree-item rounded-md transition-colors duration-150 hover:bg-accent/6'
      );
      listItem.dataset.sectionId = item.id;

      const link = this.createElement(
        'a',
        'aobx-navigation__link aobx-nav__link flex items-center gap-2 px-2 py-1.5 rounded-inherit text-md cursor-pointer no-underline leading-snug text-base-content hover:text-accent'
      );
      link.setAttribute('href', `#section-${item.id}`);
      link.textContent = item.label;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        this.handleNavigate(item.id);
      });

      if (item.id === this.currentActiveId) {
        listItem.classList.add('is-current', 'is-active', 'bg-accent/12');
      }

      listItem.append(link);
      list.append(listItem);
    }

    nav.append(list);
    this.container.replaceChildren(nav);
    return nav;
  }

  destroy(): void {
    this.container.replaceChildren();
    super.destroy();
  }

  setActive(sectionId: string): void {
    this.currentActiveId = sectionId;
    this.highlightActive(sectionId);
  }

  private handleNavigate(sectionId: string): void {
    if (sectionId === this.currentActiveId) {
      this.onNavigate?.(sectionId);
      return;
    }
    this.currentActiveId = sectionId;
    this.highlightActive(sectionId);
    this.onNavigate?.(sectionId);
  }

  private highlightActive(sectionId: string): void {
    const items = this.container.querySelectorAll<HTMLElement>(
      '.aobx-navigation__item, .aobx-tree-item'
    );
    items.forEach((item) => {
      const link = item.querySelector<HTMLAnchorElement>('a');
      if (item.dataset.sectionId === sectionId) {
        item.classList.add(
          'is-current',
          'is-active',
          'aobx-navigation__item--active',
          'bg-accent/12'
        );
        link?.setAttribute('aria-current', 'true');
      } else {
        item.classList.remove(
          'is-current',
          'is-active',
          'aobx-navigation__item--active',
          'bg-accent/12'
        );
        link?.removeAttribute('aria-current');
      }
    });
  }
}
