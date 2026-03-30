import { BaseComponent } from '../../../ui/foundation/lifecycle/BaseComponent';
import type { OptionsStateManager } from '../../state/StateManager';
import type { BaseSection, SectionRenderContext } from '../sections/BaseSection';
import type { FormSectionRegistry } from '../formSections/formSectionManager';
import { getService } from '@shared/di';
import { resolveRepository } from '@shared/di/serviceRegistry';
import { DI_TOKENS, TOKENS } from '@shared/di/tokens';
import type {
  IMessagingRepository,
  IOptionsRepository,
  IYamlRepository
} from '@shared/repositories';
import type { StorageService } from '@platform/interfaces/storage';
import type { PlatformServices } from '@platform/types';
import {
  createOptionsMainHost,
  createOptionsSectionHost,
  markOptionsSectionMounted
} from '../../../ui/hosts/options';
import type { UiMountable } from '../../../ui/hosts/shared/contract';

export interface MainContentConfig {
  stateManager: OptionsStateManager;
  initialSection?: string;
  formRegistry: FormSectionRegistry;
}

type SectionComponent = BaseSection<SectionRenderContext>;

type SectionCtor<T extends SectionComponent = SectionComponent> = new (...args: any[]) => T;

interface OptionsSectionDependencies {
  optionsRepository: IOptionsRepository;
  messagingRepository: IMessagingRepository;
  yamlRepository: IYamlRepository;
  storage: StorageService;
}

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
export class MainContent
  extends BaseComponent<MainContentConfig>
  implements UiMountable<MainContentConfig>
{
  private stateManager: OptionsStateManager | null = null;
  private formRegistry: FormSectionRegistry | null = null;
  private sectionDependencies: OptionsSectionDependencies | null = null;
  private readonly sectionDefinitions: SectionDefinition[] = [
    { id: 'usage', load: async () => (await import('../sections/UsageSection')).UsageSection },
    {
      id: 'language',
      load: async () => (await import('../sections/LanguageSection')).LanguageSection
    },
    {
      id: 'privacy',
      load: async () => (await import('../sections/PrivacySection')).PrivacySection
    },
    { id: 'rest', load: async () => (await import('../sections/RestSection')).RestSection },
    {
      id: 'routing',
      load: async () => (await import('../sections/RoutingSection')).RoutingSection
    },
    {
      id: 'yaml',
      load: async () => (await import('../sections/YamlConfigSection')).YamlConfigSection
    },
    {
      id: 'templates',
      load: async () => (await import('../sections/TemplatesSection')).TemplatesSection
    },
    { id: 'ai', load: async () => (await import('../sections/AiSection')).AiSection },
    {
      id: 'deepResearch',
      load: async () => (await import('../sections/DeepResearchSection')).DeepResearchSection
    },
    {
      id: 'classifier',
      load: async () => (await import('../sections/ClassifierSection')).ClassifierSection
    },
    { id: 'video', load: async () => (await import('../sections/VideoSection')).VideoSection },
    {
      id: 'reading',
      load: async () => (await import('../sections/ReadingSection')).ReadingSection
    },
    {
      id: 'fragment',
      load: async () => (await import('../sections/FragmentSection')).FragmentSection
    },
    {
      id: 'transfer',
      load: async () => (await import('../sections/TransferSection')).TransferSection
    },
    {
      id: 'diagnosis',
      load: async () => (await import('../sections/DiagnosisSection')).DiagnosisSection
    }
  ];
  private sectionRecords = new Map<string, SectionRecord>();
  private pendingMounts = new Map<string, Promise<SectionComponent | null>>();

  render(config: MainContentConfig): HTMLElement {
    this.assertActive();
    this.stateManager = config.stateManager;
    this.formRegistry = config.formRegistry;
    this.sectionDependencies = this.createSectionDependencies();

    const main = createOptionsMainHost();
    main.append(this.buildStatusBar());
    this.initializeSectionHosts(main);

    const initialSection = config.initialSection ?? this.sectionDefinitions[0]?.id ?? 'usage';
    void this.mountSection(initialSection, true);

    this.container.replaceChildren(main);
    return main;
  }

  mount(config: MainContentConfig): HTMLElement {
    return this.render(config);
  }

  update(config: MainContentConfig): HTMLElement {
    return this.render(config);
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
    this.sectionDependencies = null;
    super.destroy();
  }

  /**
   * 按照定义顺序创建 Section 宿主容器，避免未来懒加载时再改 DOM 结构。
   */
  private initializeSectionHosts(host: HTMLElement): void {
    this.sectionRecords.clear();
    this.pendingMounts.clear();
    for (const definition of this.sectionDefinitions) {
      const container = createOptionsSectionHost(definition.id);
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
  async mountSection(
    sectionId: string,
    markActive: boolean = false
  ): Promise<SectionComponent | null> {
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
    const sectionDependencies = this.sectionDependencies;
    if (!sectionDependencies) {
      throw new Error('[MainContent] Section dependencies unavailable during section mount.');
    }
    const mountTask = (async (): Promise<SectionComponent | null> => {
      let ctor = record.ctor;
      if (!ctor) {
        ctor = await record.definition.load();
        record.ctor = ctor;
      }
      const section = this.instantiateSection(
        record.definition.id,
        ctor,
        record.container,
        sectionDependencies
      );
      if (this.messages) {
        section.setMessages(this.messages);
      }
      section.render({ stateManager, formRegistry });
      record.instance = section;
      markOptionsSectionMounted(record.container, true);
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
    markOptionsSectionMounted(record.container, false);
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
    const bar = this.createElement(
      'div',
      'aobx-status-bar m-4 mt-6 p-3 rounded-md border border-base-300 bg-base-100/90 min-h-[40px] flex items-center'
    );
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

  private createSectionDependencies(): OptionsSectionDependencies {
    const optionsRepository = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
    const messagingRepository = resolveRepository<IMessagingRepository>(
      DI_TOKENS.IMessagingRepository
    );
    const yamlRepository = resolveRepository<IYamlRepository>(DI_TOKENS.IYamlRepository);
    const storage = getService<PlatformServices>(TOKENS.platformServices).storage;

    return {
      optionsRepository,
      messagingRepository,
      yamlRepository,
      storage
    };
  }

  private instantiateSection(
    sectionId: string,
    ctor: SectionCtor,
    container: HTMLElement,
    deps: OptionsSectionDependencies
  ): SectionComponent {
    switch (sectionId) {
      case 'usage':
        return new ctor(container, deps.optionsRepository, deps.messagingRepository, deps.storage);
      case 'rest':
        return new ctor(container, deps.optionsRepository, deps.messagingRepository);
      case 'yaml':
        return new ctor(container, {
          yamlRepository: deps.yamlRepository
        });
      case 'language':
      case 'privacy':
      case 'routing':
      case 'templates':
      case 'ai':
      case 'classifier':
      case 'video':
      case 'reading':
      case 'fragment':
      case 'transfer':
        return new ctor(container, deps.optionsRepository);
      case 'deepResearch':
      case 'diagnosis':
        return new ctor(container);
      default:
        return new ctor(container);
    }
  }
}
