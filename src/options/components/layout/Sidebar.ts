import { BaseComponent } from '../shared/BaseComponent';
import { Navigation, type NavigationItem } from './Navigation';

export interface SidebarNavigationConfig {
  items?: NavigationItem[];
  activeId?: string;
  onNavigate?: (id: string) => void;
}

export interface SidebarConfig {
  navigation: SidebarNavigationConfig;
  brand?: {
    title: string;
    subtitle?: string;
    version?: string;
    logoUrl?: string;
  };
  footerLinks?: SidebarFooterLink[];
}

export interface SidebarFooterLink {
  label: string;
  href?: string;
  id?: string;
  external?: boolean;
}

const DEFAULT_NAV_ITEMS: NavigationItem[] = [
  { id: 'usage', label: 'Usage' },
  { id: 'language', label: 'Language' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'rest', label: 'REST' },
  { id: 'routing', label: 'Routing' },
  { id: 'yaml', label: 'YAML' },
  { id: 'templates', label: 'Templates' },
  { id: 'ai', label: 'AI' },
  { id: 'video', label: 'Video' },
  { id: 'reading', label: 'Reading' },
  { id: 'fragment', label: 'Fragments' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'diagnosis', label: 'Diagnosis' }
];

export class Sidebar extends BaseComponent<SidebarConfig | void> {
  private navigation: Navigation | null = null;

  render(config?: SidebarConfig): HTMLElement {
    this.assertActive();

    const resolvedConfig = config ?? {
      navigation: { items: this.getDefaultNavigationItems(), activeId: 'usage' }
    };

    const wrapper = this.createElement('aside', 'aobx-sidebar flex flex-col gap-5 h-full');
    const brand = this.buildBrand(resolvedConfig);
    const navigation = this.buildNavigation(resolvedConfig);
    const footer = this.buildFooter(resolvedConfig);

    wrapper.append(brand, navigation, footer);

    this.container.replaceChildren(wrapper);
    return wrapper;
  }

  destroy(): void {
    this.navigation?.destroy();
    this.navigation = null;
    super.destroy();
  }

  private buildBrand(config: SidebarConfig): HTMLElement {
    const brand = this.createElement('div', 'aobx-sidebar__brand grid gap-3');

    const headerTop = this.createElement('div', 'aobx-sidebar__brand-header flex items-center gap-3');

    if (config.brand?.logoUrl) {
      const logoImg = this.createElement('img');
      logoImg.src = config.brand.logoUrl;
      logoImg.alt = config.brand.title ?? 'All in Ob';
      logoImg.className = 'w-12 h-12 rounded-lg shadow-none';
      headerTop.append(logoImg);
    }

    const textWrap = this.createElement('div', 'aobx-sidebar__brand-text grid gap-1');

    const title = this.createElement('h1', 'aobx-sidebar__brand-title text-lg font-semibold');
    title.textContent = config.brand?.title ?? 'All in Ob';
    textWrap.append(title);

    if (config.brand?.version) {
      const tags = this.createElement('div', 'aobx-sidebar__brand-tags flex flex-wrap gap-2');
      const versionTag = this.createElement('span', 'aobx-sidebar__brand-version inline-flex items-center px-2.5 py-1 rounded-sm bg-accent/12 text-base-content text-sm');
      versionTag.textContent = config.brand.version;
      tags.append(versionTag);
      textWrap.append(tags);
    }

    headerTop.append(textWrap);
    brand.append(headerTop);
    return brand;
  }

  private buildNavigation(config: SidebarConfig): HTMLElement {
    const navHost = this.createElement('div');
    this.navigation = new Navigation(navHost);
    if (this.messages) {
      this.navigation.setMessages(this.messages);
    }
    const navElement = this.navigation.render({
      items: config.navigation.items ?? this.getDefaultNavigationItems(),
      ...(config.navigation.activeId !== undefined && { activeId: config.navigation.activeId }),
      onNavigate: (id) => {
        config.navigation.onNavigate?.(id);
      }
    });
    if (navElement) {
      navElement.classList.add('aobx-sidebar__navigation', 'space-y-1');
    }
    return navElement ?? navHost;
  }

  setActiveNavigation(id: string): void {
    this.navigation?.setActive(id);
  }

  private buildFooter(config: SidebarConfig): HTMLElement {
    const footer = this.createElement('div', 'aobx-sidebar__footer grid gap-2 mt-auto text-sm');
    const links = config.footerLinks ?? [];

    for (const linkConfig of links) {
      const anchor = this.createElement('a', 'aobx-sidebar__link inline-flex items-center gap-1 text-sm text-base-content no-underline transition-colors hover:text-accent');
      const href = linkConfig.href ?? '#';
      anchor.setAttribute('href', href);

      if (linkConfig.id) {
        anchor.id = linkConfig.id;
      }

      if (linkConfig.external ?? /^https?:\/\//.test(href)) {
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
      } else if (!linkConfig.href) {
        anchor.setAttribute('role', 'button');
        anchor.setAttribute('aria-haspopup', 'dialog');
      }

      anchor.textContent = linkConfig.label;
      footer.append(anchor);
    }

    return footer;
  }

  private getDefaultNavigationItems(): NavigationItem[] {
    if (!this.messages) {
      return DEFAULT_NAV_ITEMS;
    }

    return [
      { id: 'usage', label: this.messages.usageDashboardTitle },
      { id: 'language', label: this.messages.languageSettings },
      { id: 'privacy', label: this.messages.privacySettingsTitle },
      { id: 'rest', label: this.messages.apiConfigTitle },
      { id: 'routing', label: this.messages.routingRulesTitle },
      { id: 'yaml', label: this.messages.yamlConfigTitle ?? 'YAML 配置' },
      { id: 'templates', label: this.messages.templateConfigTitle },
      { id: 'ai', label: this.messages.aiChatConfigTitle },
      { id: 'video', label: this.messages.videoConfigTitle },
      { id: 'reading', label: this.messages.readingConfigTitle },
      { id: 'fragment', label: this.messages.fragmentConfigTitle },
      { id: 'transfer', label: this.messages.configTransferTitle },
      { id: 'diagnosis', label: this.messages.diagnosisTitle ?? '配置诊断' }
    ];
  }
}
