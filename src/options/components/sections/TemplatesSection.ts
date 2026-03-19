import type { CompleteOptions, StoredOptions, TemplateOptions } from '@shared/types/options';
import type { IOptionsRepository } from '@shared/repositories';
import { resolveRepository } from '@shared/di/serviceRegistry';
import { DI_TOKENS } from '@shared/di/tokens';
import { configProvider } from '@shared/config';
import { DEFAULT_DOMAIN_MAPPINGS } from '../../utils/defaults';
import { getOptionsController, markPendingAutoSave } from '../../app/optionsControllerContext';
import { DomainMappingsController } from '../controls/domainMappings';
import { createReadingTemplateController, type ReadingTemplateController } from '../controls/readingTemplateControls';
import { type FormSectionHandlers } from '../formSections/formSectionManager';
import { DaisyButton } from '../shared/DaisyButton';
import { DaisyCard } from '../shared/DaisyCard';
import { DaisyInput } from '../shared/DaisyInput';
import type { SectionRenderContext } from './BaseSection';
import { BaseSection } from './BaseSection';

const TEMPLATE_DEFAULTS = configProvider.getTemplates();

interface EventBinding {
  target: EventTarget;
  type: string;
  handler: EventListener;
}

const resolveTemplateValue = (
  current: string | undefined,
  previous: string | undefined,
  fallback: string
): string => {
  const trimmed = current?.trim() ?? '';
  if (trimmed) {
    return trimmed;
  }
  if (previous && previous.trim().length > 0) {
    return previous;
  }
  return fallback;
};

export class TemplatesSection extends BaseSection<SectionRenderContext> {
  private readonly optionsRepo: IOptionsRepository;
  private articleInput: HTMLInputElement | null = null;
  private fragmentInput: HTMLInputElement | null = null;
  private aiInput: HTMLInputElement | null = null;
  private readingModeSelect: HTMLSelectElement | null = null;
  private readingCustomInput: HTMLInputElement | null = null;
  private domainMappingsHost: HTMLElement | null = null;

  private readingController: ReadingTemplateController | null = null;
  private domainMappingsController: DomainMappingsController | null = null;
  private formSectionBinding: FormSectionHandlers | null = null;

  private eventBindings: EventBinding[] = [];
  private unsubscribeRepo: (() => void) | null = null;

  constructor(container: HTMLElement, optionsRepo?: IOptionsRepository) {
    super(container);
    this.optionsRepo = optionsRepo ?? resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
  }

  protected renderWithState(_context: SectionRenderContext): HTMLElement {
    this.disposeControllers();
    this.container.classList.add('aobx-section', 'bg-base-100', 'border', 'border-base-300', 'rounded-lg', 'p-[clamp(22px,2.5vw,32px)]', 'shadow-card', 'transition-opacity', 'duration-200');

    const header = this.buildHeader();
    const body = this.buildBody();

    this.container.replaceChildren(header, body);
    this.setupControllers();
    this.applyInitialSnapshot();
    this.registerFormIntegration();
    this.subscribeToRepository();
    return this.container;
  }

  override destroy(): void {
    this.disposeControllers();
    if (this.formSectionBinding) {
      const registry = this.requireFormRegistry();
      registry.unregister('templates', this.formSectionBinding);
      this.formSectionBinding = null;
    }
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;
    super.destroy();
  }

  private buildHeader(): HTMLElement {
    const header = this.createElement('div', 'grid gap-2 mb-6');

    const titleWrapper = this.createElement('div', 'flex items-center gap-2 text-base-content');
    const title = document.createElement('h2');
    title.className = 'm-0 text-2xl font-semibold tracking-tight';
    title.textContent = this.messages?.templateConfigTitle ?? '文章、视频路径配置';
    titleWrapper.append(title);

    const subtitle = this.createElement('div', 'text-base-content/60 text-md');
    subtitle.textContent =
      this.messages?.templateConfigHint ?? '为不同类型的剪藏指定文件命名';

    header.append(titleWrapper, subtitle);
    return header;
  }

  private buildBody(): HTMLElement {
    const body = this.createElement('div', 'mt-6 space-y-6');
    body.append(this.buildTemplateSettings(), this.buildDomainMappingsSection());
    return body;
  }

  private buildTemplateSettings(): HTMLElement {
    const settings = this.createElement('div', 'grid gap-6');

    const articleSetting = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)]');
    const articleLabel = this.createElement('div', 'text-sm font-medium text-base-content/60');
    articleLabel.textContent = this.messages?.articleTemplateLabel ?? '文章、视频路径模板';
    const articleControl = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    const articleHost = this.createElement('div', 'w-full');
    // ✅ Stage 3 Week 4: Migrated article template input to DaisyInput (TemplatesSection)
    const articleInput = new DaisyInput(articleHost).render({
      type: 'text',
      variant: 'bordered',
      size: 'md',
      placeholder: 'Articles/{domain}/{yyyy}/{slug}.md'
    });
    articleInput.dataset.templateRole = 'article';
    articleControl.append(articleHost);
    this.articleInput = articleInput;
    this.bindEvent(articleInput, 'input', this.handleFieldChanged);
    const articleVars = this.buildTemplateVars();
    const articleHint = this.createElement('div', 'text-sm text-base-content/60 mt-2');
    articleHint.textContent =
      this.messages?.templateVariableNote ??
      '{slug} 表示标题的短链写法；{HHmmss}/{HHmm} 可插入保存时间，{mm} 仍代表月份。';
    articleSetting.append(articleLabel, articleControl, articleVars, articleHint);
    settings.append(articleSetting);

    const fragmentSetting = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)]');
    const fragmentLabel = this.createElement('div', 'text-sm font-medium text-base-content/60');
    fragmentLabel.textContent = this.messages?.fragmentTemplateLabel ?? '片段路径模板';
    const fragmentControl = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    const fragmentHost = this.createElement('div', 'w-full');
    // ✅ Stage 3 Week 4: Migrated fragment template input to DaisyInput (TemplatesSection)
    const fragmentInput = new DaisyInput(fragmentHost).render({
      type: 'text',
      variant: 'bordered',
      size: 'md',
      placeholder: 'Clippings/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md'
    });
    fragmentInput.dataset.templateRole = 'fragment';
    fragmentControl.append(fragmentHost);
    this.fragmentInput = fragmentInput;
    this.bindEvent(fragmentInput, 'input', this.handleFieldChanged);
    fragmentSetting.append(fragmentLabel, fragmentControl, this.buildTemplateVars());
    settings.append(fragmentSetting);

    const readingSetting = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)]');
    const readingLabel = this.createElement('div', 'text-sm font-medium text-base-content/60');
    readingLabel.textContent = this.messages?.readingTemplateLabel ?? '阅读模式路径模板';
    const readingControl = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    const readingSelect = document.createElement('select');
    readingSelect.className = 'w-full min-h-[40px] px-3 rounded-md border border-base-300 bg-base-100 text-base-content transition-colors hover:border-base-300 focus-visible:outline-none focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/20';
    const optionArticle = document.createElement('option');
    optionArticle.value = 'article';
    optionArticle.textContent = this.messages?.readingTemplateOptionArticle ?? '与文章路径相同';
    const optionFragment = document.createElement('option');
    optionFragment.value = 'fragment';
    optionFragment.textContent = this.messages?.readingTemplateOptionFragment ?? '与片段路径相同';
    const optionCustom = document.createElement('option');
    optionCustom.value = 'custom';
    optionCustom.textContent = this.messages?.readingTemplateOptionCustom ?? '自定义';
    readingSelect.append(optionArticle, optionFragment, optionCustom);
    const readingInputHost = this.createElement('div', 'w-full');
    // ✅ Stage 3 Week 4: Migrated reading template input to DaisyInput (TemplatesSection)
    const readingInput = new DaisyInput(readingInputHost).render({
      type: 'text',
      variant: 'bordered',
      size: 'md',
      placeholder: 'Reading/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
      disabled: true
    });
    readingInput.dataset.templateRole = 'reading-custom';
    readingSelect.dataset.templateRole = 'reading-mode';
    readingControl.append(readingSelect, readingInputHost);
    readingSetting.append(readingLabel, readingControl);
    this.readingModeSelect = readingSelect;
    this.readingCustomInput = readingInput;
    settings.append(readingSetting);

    const aiSetting = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)]');
    const aiLabel = this.createElement('div', 'text-sm font-medium text-base-content/60');
    aiLabel.textContent = this.messages?.aiTemplateLabel ?? 'AI 对话路径模板';
    const aiControl = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    const aiHost = this.createElement('div', 'w-full');
    const aiInput = new DaisyInput(aiHost).render({
      type: 'text',
      variant: 'bordered',
      size: 'md',
      placeholder: 'AI/{platform}/{yyyy}/{yyyy}-{mm}-{dd}_{title}.md'
    });
    aiInput.dataset.templateRole = 'ai';
    aiControl.append(aiHost);
    this.aiInput = aiInput;
    this.bindEvent(aiInput, 'input', this.handleFieldChanged);
    aiSetting.append(aiLabel, aiControl, this.buildTemplateVars());
    settings.append(aiSetting);

    return settings;
  }

  private buildDomainMappingsSection(): HTMLElement {
    const host = this.createElement('div');
    const body = this.createElement('div', 'space-y-3');
    const hint = this.createElement('div', 'text-sm text-base-content/60');
    hint.textContent =
      this.messages?.domainMappingHint ?? '为常见站点配置更友好的名称，例如将 mp.weixin.qq.com 映射为 “公众号”。';

    const listContainer = this.createElement('div', 'grid gap-2');
    this.domainMappingsHost = listContainer;
    body.append(hint, listContainer);

    const addButtonHost = this.createElement('div');
    new DaisyButton(addButtonHost).render({
      label: this.messages?.addMappingButton ?? '+ 添加映射',
      variant: 'primary',
      size: 'sm',
      iconName: 'Plus',
      onClick: this.handleAddMappingClick
    });

    const card = new DaisyCard(host);
    card.render({
      title: this.messages?.domainMappingTitle ?? '域名映射配置',
      body,
      actions: [addButtonHost]
    });
    // ⏸️ Stage 3 Month 3: Template/domain mapping drag handles pending Zag.js list integration
    return host;
  }

  private setupControllers(): void {
    if (this.readingController) {
      this.readingController.dispose();
    }
    if (
      this.readingModeSelect &&
      this.readingCustomInput &&
      this.articleInput &&
      this.fragmentInput
    ) {
      this.readingController = createReadingTemplateController(
        {
          modeSelect: this.readingModeSelect,
          customInput: this.readingCustomInput,
          articleInput: this.articleInput,
          fragmentInput: this.fragmentInput,
          onChange: this.handleFieldChanged
        },
        {
          defaultTemplate: TEMPLATE_DEFAULTS.reading,
          articleDefault: TEMPLATE_DEFAULTS.article,
          fragmentDefault: TEMPLATE_DEFAULTS.fragment
        }
      );
    }

    if (this.domainMappingsController) {
      this.domainMappingsController.dispose();
    }
    if (this.domainMappingsHost) {
      this.domainMappingsController = new DomainMappingsController(this.domainMappingsHost);
      if (this.messages) {
        this.domainMappingsController.setMessages(this.messages);
      }
      this.domainMappingsController.render({
        maxEmptyRows: 3,
        onChange: this.handleFieldChanged
      });
    }
  }

  private registerFormIntegration(): void {
    const registry = this.requireFormRegistry();
    if (this.formSectionBinding) {
      registry.unregister('templates', this.formSectionBinding);
    }

    const binding: FormSectionHandlers = {
      applySnapshot: (options) => {
        this.applySnapshot(options);
      },
      collectChanges: (previous) => this.collectChanges(previous)
    };

    registry.register('templates', binding);
    this.formSectionBinding = binding;
  }

  private applyInitialSnapshot(): void {
    const defaultsOnly: StoredOptions = {
      templates: { ...TEMPLATE_DEFAULTS },
      domainMappings: { ...DEFAULT_DOMAIN_MAPPINGS }
    } as StoredOptions;
    this.applySnapshot(defaultsOnly);
  }

  private applySnapshot(options: StoredOptions): void {
    const templates = (options.templates ?? {}) as Partial<TemplateOptions>;

    if (this.articleInput) {
      this.articleInput.value = templates.article ?? TEMPLATE_DEFAULTS.article;
    }
    if (this.fragmentInput) {
      this.fragmentInput.value = templates.fragment ?? TEMPLATE_DEFAULTS.fragment;
    }
    if (this.aiInput) {
      this.aiInput.value = templates.ai ?? TEMPLATE_DEFAULTS.ai;
    }

    this.readingController?.apply(templates.reading ?? undefined);

    const mappings =
      options.domainMappings && Object.keys(options.domainMappings).length > 0
        ? { ...options.domainMappings }
        : { ...DEFAULT_DOMAIN_MAPPINGS };
    this.domainMappingsController?.setMappings(mappings);
  }

  private collectChanges(previous: StoredOptions | null): Partial<CompleteOptions> {
    const previousTemplates = previous?.templates;
    const previousMappings = previous?.domainMappings ?? null;

    const article = resolveTemplateValue(
      this.articleInput?.value,
      previousTemplates?.article,
      TEMPLATE_DEFAULTS.article
    );
    const fragment = resolveTemplateValue(
      this.fragmentInput?.value,
      previousTemplates?.fragment,
      TEMPLATE_DEFAULTS.fragment
    );
    const readingCollected = this.readingController?.collect() ?? '';
    const reading = resolveTemplateValue(
      readingCollected,
      previousTemplates?.reading,
      TEMPLATE_DEFAULTS.reading
    );
    const ai = resolveTemplateValue(
      this.aiInput?.value,
      previousTemplates?.ai,
      TEMPLATE_DEFAULTS.ai
    );

    const collectedMappings = this.domainMappingsController?.collect() ?? {};
    const finalMappings =
      Object.keys(collectedMappings).length > 0
        ? collectedMappings
        : previousMappings && Object.keys(previousMappings).length > 0
          ? { ...previousMappings }
          : { ...DEFAULT_DOMAIN_MAPPINGS };

    const partial: Partial<CompleteOptions> = {
      templates: {
        article,
        fragment,
        reading,
        ai
      },
      domainMappings: { ...finalMappings }
    };
    this.persistTemplates(partial);
    return partial;
  }

  private buildTemplateVars(): HTMLElement {
    const wrapper = this.createElement('div', 'mt-2 text-xs text-base-content/60 break-all');
    wrapper.textContent = `${this.messages?.availableVariables ?? '可用变量：'} `;
    [
      '{platform}',
      '{domain}',
      '{yyyy}',
      '{mm}',
      '{dd}',
      '{HHmmss}',
      '{HHmm}',
      '{HH}',
      '{ss}',
      '{slug}',
      '{title}'
    ].forEach((token) => {
      const code = document.createElement('code');
      code.className = 'mx-1 px-1 py-0.5 rounded bg-base-200 border border-base-300/50 font-mono text-[10px] text-accent';
      code.textContent = token;
      wrapper.append(code);
    });
    return wrapper;
  }

  private handleAddMappingClick = (): void => {
    this.domainMappingsController?.addRow('', '', { autoFocus: true });
  };

  private handleFieldChanged = (): void => {
    markPendingAutoSave('templates');
    const controller = getOptionsController();
    controller?.scheduleAutoSave();
  };

  private bindEvent(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler);
    this.eventBindings.push({ target, type, handler });
  }

  private disposeControllers(): void {
    this.eventBindings.forEach(({ target, type, handler }) => {
      target.removeEventListener(type, handler);
    });
    this.eventBindings = [];

    this.readingController?.dispose();
    this.readingController = null;

    this.domainMappingsController?.dispose();
    this.domainMappingsController = null;
  }

  private subscribeToRepository(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = this.optionsRepo.onChange((options) => {
      this.applySnapshot(options);
    });
  }

  private persistTemplates(partial: Partial<CompleteOptions>): void {
    void this.optionsRepo
      .set(partial)
      .catch((error) => {
        console.error('[TemplatesSection] Failed to persist template options via repository:', error);
      });
  }
}
