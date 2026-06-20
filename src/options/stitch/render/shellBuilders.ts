import type { PreviewContent } from '../types';
import type { el } from '../ui/dom';

type ElementFactory = typeof el;

interface BrandBlockOptions {
  el: ElementFactory;
  brand: PreviewContent['brand'];
}

interface NavGroupOptions {
  el: ElementFactory;
  title: string;
  items: PreviewContent['nav'];
  activePanel: string;
  onPanelClick: (panelId: string) => void;
}

interface FooterGroupOptions {
  el: ElementFactory;
  title: string;
  items: PreviewContent['sidebarLinks'];
  activeResource: string | null;
  onFooterClick: (resourceId: string) => void;
}

interface SidebarOptions {
  el: ElementFactory;
  brand: PreviewContent['brand'];
  settingsTitle: string;
  resourcesTitle: string;
  runtimeTitle: string;
  navItems: PreviewContent['nav'];
  sidebarLinks: PreviewContent['sidebarLinks'];
  surfaceLinks: PreviewContent['surfaceLinks'];
  activePanel: string;
  activeResource: string | null;
  onPanelClick: (panelId: string) => void;
  onFooterClick: (resourceId: string) => void;
}

interface ScrollSectionOptions {
  el: ElementFactory;
  panelId: string;
  content: Node;
}

interface PanelStackOptions {
  el: ElementFactory;
  items: PreviewContent['nav'];
  renderSection: (panelId: string) => HTMLElement;
}

interface AppShellOptions {
  el: ElementFactory;
  sidebar: HTMLElement;
  panelStack: HTMLElement;
}

export function buildBrandBlock({ el: createElement, brand }: BrandBlockOptions): HTMLElement {
  const title = createElement('strong', { text: brand.title });
  const titleNode = brand.websiteUrl
    ? createElement(
        'a',
        {
          className: 'brand-title-link',
          href: brand.websiteUrl,
          target: '_blank',
          rel: 'noopener noreferrer'
        },
        title
      )
    : title;

  return createElement(
    'div',
    { className: 'brand' },
    createElement(
      'div',
      { className: 'brand-mark' },
      createElement('img', { src: brand.logo, alt: brand.title })
    ),
    createElement(
      'div',
      { className: 'brand-copy' },
      titleNode,
      createElement('span', { text: brand.subtitle })
    )
  );
}

export function buildNavGroup({
  el: createElement,
  title,
  items,
  activePanel,
  onPanelClick
}: NavGroupOptions): HTMLElement {
  const navLabel = title || 'Settings';
  return createElement(
    'div',
    { className: 'nav-group' },
    title ? createElement('div', { className: 'nav-title', text: title }) : null,
    createElement(
      'nav',
      { className: 'nav', 'aria-label': navLabel },
      items.map((item) =>
        createElement(
          'button',
          {
            type: 'button',
            dataset: { navPanel: item.id },
            className: activePanel === item.id ? 'is-active' : '',
            onClick: () => onPanelClick(item.id)
          },
          createElement(
            'span',
            { className: 'nav-copy' },
            createElement('strong', { text: item.label }),
            createElement('span', { text: item.hint })
          )
        )
      )
    )
  );
}

export function buildFooterGroup({
  el: createElement,
  title,
  items,
  activeResource,
  onFooterClick
}: FooterGroupOptions): HTMLElement | null {
  if (!items.length) {
    return null;
  }

  return createElement(
    'div',
    { className: 'sidebar-footer-section' },
    title ? createElement('div', { className: 'nav-title', text: title }) : null,
    items.map((item) =>
      createElement(
        'button',
        {
          type: 'button',
          className: ['footer-link', activeResource === item.id ? 'is-active' : ''].join(' '),
          dataset: { footerPanel: item.id },
          title: item.hint,
          onClick: () => onFooterClick(item.id)
        },
        item.label
      )
    )
  );
}

export function buildSidebar({
  el: createElement,
  brand,
  settingsTitle,
  resourcesTitle,
  runtimeTitle,
  navItems,
  sidebarLinks,
  surfaceLinks,
  activePanel,
  activeResource,
  onPanelClick,
  onFooterClick
}: SidebarOptions): HTMLElement {
  return createElement(
    'aside',
    { className: 'sidebar' },
    buildBrandBlock({ el: createElement, brand }),
    buildNavGroup({
      el: createElement,
      title: settingsTitle,
      items: navItems,
      activePanel,
      onPanelClick
    }),
    createElement(
      'div',
      { className: 'sidebar-footer' },
      buildFooterGroup({
        el: createElement,
        title: resourcesTitle,
        items: sidebarLinks,
        activeResource,
        onFooterClick
      }),
      buildFooterGroup({
        el: createElement,
        title: runtimeTitle,
        items: surfaceLinks,
        activeResource,
        onFooterClick
      })
    )
  );
}

export function buildScrollSection({
  el: createElement,
  panelId,
  content
}: ScrollSectionOptions): HTMLElement {
  return createElement(
    'section',
    {
      className: 'panel-section',
      id: `section-${panelId}`,
      dataset: {
        panelId,
        scrollSection: 'true'
      }
    },
    content
  );
}

export function buildPanelStack({
  el: createElement,
  items,
  renderSection
}: PanelStackOptions): HTMLElement {
  return createElement(
    'div',
    { className: 'panel-stack' },
    items.map((item) => renderSection(item.id))
  );
}

export function buildAppShell({
  el: createElement,
  sidebar,
  panelStack
}: AppShellOptions): HTMLElement {
  return createElement(
    'div',
    { className: 'app' },
    sidebar,
    createElement(
      'div',
      { className: 'shell' },
      createElement(
        'main',
        { className: 'main' },
        createElement('div', { className: 'content' }, panelStack)
      )
    ),
    createElement('div', { className: 'modal-host', dataset: { modalHost: 'true' } })
  );
}
