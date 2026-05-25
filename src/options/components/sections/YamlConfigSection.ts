import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { YamlConfigOverrides, YamlContentType } from '@shared/types/yamlConfig';
import type { IYamlRepository } from '@shared/repositories/IYamlRepository';
import { YamlConfigService } from '@shared/services/yamlConfigService';
import { getOptionsController, markPendingAutoSave } from '../../app/optionsControllerContext';
import { type FormSectionHandlers } from '../formSections/formSectionManager';
import type { YamlConfigView } from '@ui/domains/yaml-config';
import type { SectionRenderContext } from './BaseSection';
import { BaseSection } from './BaseSection';

const CONTENT_TYPE_ORDER: YamlContentType[] = ['article', 'clipper', 'video', 'ai_chat'];

interface YamlSectionDependencies {
  yamlRepository: IYamlRepository;
  yamlService?: YamlConfigService;
}

export class YamlConfigSection extends BaseSection<SectionRenderContext> {
  private yamlView: YamlConfigView | null = null;
  private yamlViewModulePromise: Promise<typeof import('@ui/domains/yaml-config')> | null = null;
  private readonly yamlRepository: IYamlRepository;
  private readonly yamlService: YamlConfigService;
  private unsubscribeYamlRepo: (() => void) | null = null;
  private currentOverrides: YamlConfigOverrides | null = null;
  private lastRenderedSerialized: string | null = null;
  private summaryEl: HTMLDivElement | null = null;
  private suppressRepoRender = false;

  constructor(container: HTMLElement, deps: YamlSectionDependencies) {
    super(container);
    this.yamlRepository = deps.yamlRepository;
    this.yamlService = deps.yamlService ?? new YamlConfigService();
  }

  protected override renderWithState(_context: SectionRenderContext): HTMLElement {
    this.disposeView();
    this.applySectionChrome();
    this.container.replaceChildren(this.buildHeader(), this.buildBody());
    void this.initializeYamlView();
    this.ensureYamlSubscription();
    void this.bootstrapOverrides();
    this.registerFormIntegration();
    return this.container;
  }

  override destroy(): void {
    this.unregisterManagedFormSection();
    if (this.unsubscribeYamlRepo) {
      this.unsubscribeYamlRepo();
      this.unsubscribeYamlRepo = null;
    }
    this.disposeView();
    super.destroy();
  }

  private async initializeYamlView(): Promise<void> {
    const host = this.container.querySelector<HTMLElement>('#yamlConfigViewHost');
    if (!host) {
      console.warn('[YamlConfigSection] Missing YAML config view host, view not initialized.');
      return;
    }

    const { YamlConfigView } = await this.loadYamlViewModule();
    this.yamlView = new YamlConfigView(host);
    if (this.messages) {
      this.yamlView.setMessages(this.messages);
    }
    this.yamlView.render({
      overrides: this.currentOverrides,
      onDirty: () => {
        markPendingAutoSave('yamlConfig');
        getOptionsController()?.scheduleAutoSave();
      }
    });
    this.renderViewIfNeeded(this.currentOverrides);
  }

  private loadYamlViewModule(): Promise<typeof import('@ui/domains/yaml-config')> {
    if (!this.yamlViewModulePromise) {
      this.yamlViewModulePromise = import('@ui/domains/yaml-config');
    }
    return this.yamlViewModulePromise;
  }

  private registerFormIntegration(): void {
    const binding: FormSectionHandlers = {
      applySnapshot: (options) => {
        this.applySnapshot(options);
      },
      collectChanges: (previous) => this.collectChanges(previous)
    };
    this.registerManagedFormSection('yamlConfig', binding);
  }

  private applySnapshot(options: StoredOptions): void {
    const overrides = options.yamlConfig ?? null;
    this.currentOverrides = overrides;
    this.updateResolvedSummary();
    this.renderViewIfNeeded(overrides);
  }

  private collectChanges(_previous: StoredOptions | null): Partial<CompleteOptions> {
    const overrides = this.yamlView?.collect() ?? null;
    this.currentOverrides = overrides;
    this.lastRenderedSerialized = JSON.stringify(overrides ?? null);
    this.updateResolvedSummary();
    return { yamlConfig: overrides };
  }

  private disposeView(): void {
    this.yamlView?.destroy();
    this.yamlView = null;
    this.lastRenderedSerialized = null;
  }

  private buildHeader(): HTMLElement {
    this.summaryEl = this.createElement('div', 'text-sm text-base-content/50');
    this.summaryEl.textContent = '…';
    return this.buildSectionHeader({
      title: this.messages?.yamlConfigTitle ?? 'YAML Configuration',
      description:
        this.messages?.yamlConfigHint ??
        this.messages?.yamlConfigNote ??
        'Control which YAML fields are exported for each content type.',
      actions: [this.summaryEl]
    });
  }

  private buildBody(): HTMLElement {
    const pad = this.createElement('div', 'mt-6');
    const host = this.createElement('div', 'space-y-6', {
      id: 'yamlConfigViewHost',
      'data-role': 'yaml-config-view-host'
    });
    pad.append(host);
    return pad;
  }

  private async bootstrapOverrides(): Promise<void> {
    try {
      const overrides = await this.yamlRepository.getOverrides();
      this.currentOverrides = overrides;
      this.updateResolvedSummary();
      this.renderViewIfNeeded(overrides);
    } catch (error) {
      console.warn('[YamlConfigSection] Failed to load YAML overrides from repository:', error);
    }
  }

  private ensureYamlSubscription(): void {
    if (this.unsubscribeYamlRepo) {
      return;
    }
    this.unsubscribeYamlRepo = this.yamlRepository.onChange((overrides) => {
      this.currentOverrides = overrides;
      this.updateResolvedSummary();
      if (this.suppressRepoRender) {
        return;
      }
      this.renderViewIfNeeded(overrides);
    });
  }

  private renderViewIfNeeded(overrides: YamlConfigOverrides | null): void {
    if (!this.yamlView) {
      return;
    }
    const serialized = JSON.stringify(overrides ?? null);
    if (serialized === this.lastRenderedSerialized) {
      return;
    }
    this.suppressRepoRender = true;
    this.yamlView.update(overrides);
    this.suppressRepoRender = false;
    this.lastRenderedSerialized = serialized;
  }

  private updateResolvedSummary(): void {
    if (!this.summaryEl) {
      return;
    }
    try {
      const overrides = this.currentOverrides;
      const summary = CONTENT_TYPE_ORDER.map((type) => {
        const resolved = this.yamlService.resolveConfig(type, overrides, {});
        return `${this.getContentTypeLabel(type)}: ${resolved.fields.length}`;
      }).join(' · ');
      this.summaryEl.textContent =
        summary ||
        (this.messages?.yamlConfigHint ?? 'Manage the YAML fields exported for each content type.');
    } catch (error) {
      console.warn('[YamlConfigSection] Failed to compute YAML preview summary:', error);
    }
  }

  private getContentTypeLabel(type: YamlContentType): string {
    switch (type) {
      case 'article':
        return this.messages?.yamlFieldArticleLabel ?? 'Article';
      case 'clipper':
        return this.messages?.yamlFieldClipperLabel ?? 'Clipper';
      case 'video':
        return this.messages?.yamlFieldVideoLabel ?? 'Video';
      case 'ai_chat':
        return this.messages?.yamlFieldAiLabel ?? 'AI Chat';
      default:
        return type;
    }
  }
}
