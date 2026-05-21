import { BaseComponent } from '@ui/foundation/lifecycle/BaseComponent';
import { Sidebar, type SidebarConfig, type SidebarFooterLink } from './Sidebar';
import { MainContent } from './MainContent';
import type { NavigationItem } from './Navigation';
import type { OptionsStateManager } from '../../state/StateManager';
import { NavigationController } from './NavigationController';
import { ModalController, type ModalBindingConfig } from '../infrastructure/ModalController';
import type { FormSectionRegistry } from '../formSections/formSectionManager';

export interface OptionsAppConfig {
  stateManager: OptionsStateManager;
  initialSection?: string;
  navigationItems?: NavigationItem[];
  brand?: SidebarConfig['brand'];
  footerLinks?: SidebarConfig['footerLinks'];
  modalBindings?: ModalBindingConfig[];
  formRegistry: FormSectionRegistry;
}

export interface OptionsAppUIConfig {
  modalBindings?: ModalBindingConfig[];
}

/**
 * Root composition component that wires the sidebar and primary content area together.
 */
export class OptionsApp extends BaseComponent<OptionsAppConfig> {
  private stateManager: OptionsStateManager | null = null;
  private sidebar: Sidebar | null = null;
  private content: MainContent | null = null;
  private navigationController: NavigationController | null = null;
  private modalController: ModalController | null = null;
  private formRegistry: FormSectionRegistry | null = null;

  render(config: OptionsAppConfig): HTMLElement {
    this.assertActive();
    this.stateManager = config.stateManager;
    this.formRegistry = config.formRegistry;

    const shell = this.createElement(
      'div',
      'aobx-shell grid grid-cols-1 lg:grid-cols-[252px_minmax(0,1fr)] h-screen min-h-screen overflow-hidden'
    );

    const sidebarHost = this.createElement('div');
    this.sidebar = new Sidebar(sidebarHost);
    if (this.messages) {
      this.sidebar.setMessages(this.messages);
    }
    const sidebarElement = this.sidebar.render(this.buildSidebarConfig(config));
    const sidebarNode = sidebarElement ?? sidebarHost.firstElementChild ?? sidebarHost;
    sidebarNode.classList.add(
      'aobx-shell__sidebar',
      'border-b',
      'lg:border-b-0',
      'lg:border-r',
      'border-base-300',
      'bg-base-100',
      'p-6',
      'pb-4',
      'flex',
      'flex-col',
      'gap-5',
      'lg:sticky',
      'lg:top-0',
      'lg:h-screen',
      'lg:max-h-screen',
      'lg:self-start',
      'lg:overflow-y-auto'
    );

    if (!this.stateManager) {
      throw new Error('[OptionsApp] State manager missing during render.');
    }
    const contentHost = this.createElement('div');
    this.content = new MainContent(contentHost);
    if (this.messages) {
      this.content.setMessages(this.messages);
    }
    const contentElement = this.content.render({
      stateManager: this.stateManager,
      ...(config.initialSection !== undefined && { initialSection: config.initialSection }),
      formRegistry: this.formRegistry
    });
    const contentNode = contentElement ?? contentHost.firstElementChild ?? contentHost;
    contentNode.classList.add(
      'aobx-shell__content',
      'min-h-screen',
      'h-auto',
      'lg:h-screen',
      'lg:overflow-y-auto',
      'bg-base-200',
      'p-6',
      'px-[clamp(24px,4vw,48px)]'
    );

    shell.append(sidebarNode, contentNode);
    this.container.classList.add(
      'aobx-options-app',
      'min-h-screen',
      'bg-surface',
      'text-text',
      'font-ui',
      'text-md',
      'leading-[1.56]'
    );
    this.container.replaceChildren(shell);

    this.attachNavigationController(shell);
    if (config.modalBindings) {
      this.configureUI({ modalBindings: config.modalBindings });
    }

    return shell;
  }

  destroy(): void {
    this.navigationController?.dispose();
    this.navigationController = null;
    this.modalController?.dispose();
    this.modalController = null;
    this.sidebar?.destroy();
    this.content?.destroy();
    this.sidebar = null;
    this.content = null;
    this.stateManager = null;
    this.formRegistry = null;
    super.destroy();
  }

  async mountSection(sectionId: string, markActive: boolean = false): Promise<void> {
    await this.content?.mountSection(sectionId, markActive);
  }

  async preloadSections(sectionIds: string[]): Promise<void> {
    await this.content?.preloadSections(sectionIds);
  }

  unmountSection(sectionId: string): void {
    this.content?.unmountSection(sectionId);
  }

  async navigateTo(sectionId: string): Promise<void> {
    await this.content?.navigateTo(sectionId);
    this.sidebar?.setActiveNavigation(sectionId);
  }

  getMountedSection(sectionId: string): ReturnType<MainContent['getSectionInstance']> {
    return this.content?.getSectionInstance(sectionId) ?? null;
  }

  forEachSection(callback: Parameters<MainContent['forEachSection']>[0]): void {
    this.content?.forEachSection(callback);
  }

  configureUI(config: OptionsAppUIConfig = {}): void {
    this.assertActive();
    const doc = this.container.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
    const win = doc?.defaultView ?? (typeof window !== 'undefined' ? window : null);

    this.modalController?.dispose();
    this.modalController = null;

    if (doc) {
      this.modalController = new ModalController({
        document: doc,
        window: win,
        ...(config.modalBindings !== undefined && { bindings: config.modalBindings })
      });
    }
  }

  private buildSidebarConfig(config: OptionsAppConfig): SidebarConfig {
    const navigation: SidebarConfig['navigation'] = {
      activeId: config.initialSection ?? 'usage',
      onNavigate: (id: string) => {
        void this.navigateTo(id);
      }
    };

    if (config.navigationItems && config.navigationItems.length > 0) {
      navigation.items = config.navigationItems;
    }

    const brand = config.brand ?? this.buildDefaultBrand();
    return {
      footerLinks: config.footerLinks ?? this.buildDefaultFooterLinks(),
      navigation,
      ...(brand !== undefined && { brand })
    };
  }

  private buildDefaultBrand(): SidebarConfig['brand'] | undefined {
    if (!this.messages) {
      return undefined;
    }

    return {
      title: this.messages.extensionName ?? 'All in Obsidian',
      ...(this.messages.extensionSubtitle !== undefined && {
        subtitle: this.messages.extensionSubtitle
      }),
      ...(this.messages.versionNumber !== undefined && { version: this.messages.versionNumber }),
      logoUrl: '../icons/bannerlogo-128.png'
    };
  }

  private buildDefaultFooterLinks(): SidebarFooterLink[] {
    const links: SidebarFooterLink[] = [];
    if (this.messages?.onboardingLinkText) {
      links.push({
        label: this.messages.onboardingLinkText,
        href: '../onboarding/index.html',
        external: true
      });
    }

    links.push({
      label: this.messages?.footerSupportLink ?? 'Support',
      id: 'supportLink'
    });

    links.push({
      label: this.messages?.footerSuggestionsLink ?? 'Suggestions',
      id: 'suggestionsLink'
    });

    links.push({
      label: this.messages?.footerContactLink ?? 'Contact',
      id: 'contactLink'
    });

    return links;
  }

  private attachNavigationController(root: HTMLElement): void {
    this.navigationController?.dispose();
    const doc = root.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
    const win = doc?.defaultView ?? (typeof window !== 'undefined' ? window : null);
    this.navigationController = new NavigationController({
      root,
      document: doc,
      window: win
    });
  }
}
