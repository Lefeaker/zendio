import { BaseComponent } from '../shared/BaseComponent';
import type { OptionsStateManager } from '../../state/StateManager';
import type { BaseSection, SectionRenderContext } from '../sections/BaseSection';
import type { FormSectionRegistry } from '../formSections/formSectionManager';

export interface MainContentConfig {
  stateManager: OptionsStateManager;
  initialSection?: string;
  formRegistry: FormSectionRegistry;
}

type SectionComponent = BaseSection<SectionRenderContext>;

type SectionCtor<T extends SectionComponent = SectionComponent> = new (container: HTMLElement) => T;

interface SectionDefinition {
  id: string;
  load: () => Promise<SectionCtor>;
}

interface SectionRecord {
  definition: SectionDefinition;
  container: HTMLElement;
  ctor: SectionCtor | null;
  instance: SectionComponent | null;
}

/**
 * Hosts the primary content area for the options refactor. Individual
 * section components are managed and toggled from here.
 */
export class MainContent extends BaseComponent<MainContentConfig> {
  private stateManager: OptionsStateManager | null = null;
  private formRegistry: FormSectionRegistry | null = null;
  private readonly sectionDefinitions: SectionDefinition[] = [
    { id: 'usage', load: async () => (await import('../sections/UsageSection')).UsageSection },
    { id: 'language', load: async () => (await import('../sections/LanguageSection')).LanguageSection },
    { id: 'privacy', load: async () => (await import('../sections/PrivacySection')).PrivacySection },
    { id: 'rest', load: async () => (await import('../sections/RestSection')).RestSection },
    { id: 'routing', load: async () => (await import('../sections/RoutingSection')).RoutingSection },
    { id: 'yaml', load: async () => (await import('../sections/YamlConfigSection')).YamlConfigSection },
    { id: 'templates', load: async () => (await import('../sections/TemplatesSection')).TemplatesSection },
    { id: 'ai', load: async () => (await import('../sections/AiSection')).AiSection },
    { id: 'video', load: async () => (await import('../sections/VideoSection')).VideoSection },
    { id: 'reading', load: async () => (await import('../sections/ReadingSection')).ReadingSection },
    { id: 'fragment', load: async () => (await import('../sections/FragmentSection')).FragmentSection },
    { id: 'transfer', load: async () => (await import('../sections/TransferSection')).TransferSection },
    { id: 'diagnosis', load: async () => (await import('../sections/DiagnosisSection')).DiagnosisSection }
  ];
  private sectionRecords = new Map<string, SectionRecord>();
  private pendingMounts = new Map<string, Promise<SectionComponent | null>>();

  render(config: MainContentConfig): HTMLElement {
    this.assertActive();
    this.stateManager = config.stateManager;
    this.formRegistry = config.formRegistry;

    const main = this.createElement('main', 'aobx-content grid gap-[clamp(24px,3vw,36px)]');
    main.append(this.buildStatusBar());
    this.initializeSectionHosts(main);

    const initialSection = config.initialSection ?? this.sectionDefinitions[0]?.id ?? 'usage';
    void this.mountSection(initialSection, true);

    this.container.replaceChildren(main);
    return main;
  }

  async preloadSections(sectionIds: string[]): Promise<void> {
    const preloadTasks = sectionIds.map(async (sectionId) => {
      const record = this.sectionRecords.get(sectionId);
      if (!record || record.ctor) {
        return;
      }
      record.ctor = await record.definition.load();
    });
    await Promise.all(preloadTasks);
  }

  async navigateTo(sectionId: string): Promise<void> {
    const record = this.sectionRecords.get(sectionId);
    if (!record) {
      console.warn('[MainContent] Attempted to navigate to unknown section:', sectionId);
      return;
    }
    // 确保懒加载场景下目标 Section 已经挂载
    await this.mountSection(sectionId, true);
    const target = this.container.querySelector<HTMLElement>(`#section-${sectionId}`);
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  destroy(): void {
    this.pendingMounts.clear();
    for (const definition of this.sectionDefinitions) {
      this.unmountSection(definition.id);
    }
    this.sectionRecords.clear();
    this.stateManager = null;
    this.formRegistry = null;
    super.destroy();
  }

  /**
   * 按照定义顺序创建 Section 宿主容器，避免未来懒加载时再改 DOM 结构。
   */
  private initializeSectionHosts(host: HTMLElement): void {
    this.sectionRecords.clear();
    this.pendingMounts.clear();
    for (const definition of this.sectionDefinitions) {
      const container = this.createElement('section', [
        'aobx-panel',
        'grid',
        'gap-3',
        'p-0',
        'rounded-lg',
        'border',
        'border-base-300',
        'shadow-none',
        'bg-base-100'
      ].join(' '), {
        id: `section-${definition.id}`,
        'data-nav-section': ''
      });
      host.append(container);
      this.sectionRecords.set(definition.id, {
        definition,
        container,
        ctor: null,
        instance: null
      });
    }
  }

  /**
   * 手动挂载指定 Section，返回当前实例。重复挂载将复用已有实例。
   */
  async mountSection(sectionId: string, markActive: boolean = false): Promise<SectionComponent | null> {
    const record = this.sectionRecords.get(sectionId);
    if (!record) {
      console.warn('[MainContent] Attempted to mount unknown section:', sectionId);
      return null;
    }
    if (record.instance) {
      if (markActive) {
        this.setActiveSection(sectionId);
      }
      return record.instance;
    }
    const pending = this.pendingMounts.get(sectionId);
    if (pending !== undefined) {
      const instance = await pending;
      if (markActive && instance) {
        this.setActiveSection(sectionId);
      }
      return instance;
    }
    const stateManager = this.stateManager;
    const formRegistry = this.formRegistry;
    if (!stateManager) {
      throw new Error('[MainContent] State manager unavailable during section mount.');
    }
    if (!formRegistry) {
      throw new Error('[MainContent] Form registry unavailable during section mount.');
    }
    const mountTask = (async (): Promise<SectionComponent | null> => {
      let ctor = record.ctor;
      if (!ctor) {
        ctor = await record.definition.load();
        record.ctor = ctor;
      }
      const section = new ctor(record.container);
      if (this.messages) {
        section.setMessages(this.messages);
      }
      section.render({ stateManager, formRegistry });
      record.instance = section;
      record.container.dataset.sectionMounted = 'true';
      record.container.dispatchEvent(
        new CustomEvent('aob:sectionmounted', {
          bubbles: true,
          detail: { sectionId }
        })
      );
      this.updateMountedSections(sectionId, true);
      return section;
    })();

    this.pendingMounts.set(sectionId, mountTask);
    try {
      const instance = await mountTask;
      if (markActive && instance) {
        this.setActiveSection(sectionId);
      }
      return instance;
    } finally {
      this.pendingMounts.delete(sectionId);
    }
  }

  /**
   * 卸载指定 Section，释放资源但保留宿主容器。
   */
  unmountSection(sectionId: string): void {
    const record = this.sectionRecords.get(sectionId);
    this.pendingMounts.delete(sectionId);
    if (!record || !record.instance) {
      return;
    }
    try {
      record.instance.destroy();
    } finally {
      record.instance = null;
    }
    delete record.container.dataset.sectionMounted;
    record.container.dispatchEvent(
      new CustomEvent('aob:sectionunmounted', {
        bubbles: true,
        detail: { sectionId }
      })
    );
    this.updateMountedSections(sectionId, false);
    if (this.stateManager && this.stateManager.getState().activeSection === sectionId) {
      this.setActiveSection(null);
    }
  }

  getSectionInstance(sectionId: string): SectionComponent | null {
    return this.sectionRecords.get(sectionId)?.instance ?? null;
  }

  isSectionMounted(sectionId: string): boolean {
    return this.getSectionInstance(sectionId) !== null;
  }

  forEachSection(callback: (sectionId: string, section: SectionComponent | null) => void): void {
    for (const [id, record] of this.sectionRecords.entries()) {
      callback(id, record.instance);
    }
  }

  private buildStatusBar(): HTMLElement {
    const bar = this.createElement('div', 'aobx-status-bar m-4 mt-6 p-3 rounded-md border border-base-300 bg-base-100/90 min-h-[40px] flex items-center');
    const message = this.createElement('span', 'aobx-status-message text-sm text-base-content/60');
    message.id = 'msg';
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    bar.append(message);
    return bar;
  }

  private updateMountedSections(sectionId: string, mounted: boolean): void {
    if (!this.stateManager) {
      return;
    }
    this.stateManager.update((draft) => {
      const current = { ...draft.mountedSections };
      if (mounted) {
        if (!current[sectionId]) {
          current[sectionId] = true;
          draft.mountedSections = current;
        }
      } else if (current[sectionId]) {
        delete current[sectionId];
        draft.mountedSections = current;
      }
    });
  }

  private setActiveSection(sectionId: string | null): void {
    if (!this.stateManager) {
      return;
    }
    this.stateManager.update((draft) => {
      draft.activeSection = sectionId;
    });
  }
}
