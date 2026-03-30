import type { CompleteOptions, StoredOptions, ClassifierOptions } from '@shared/types/options';
import type { IOptionsRepository } from '@shared/repositories';
import { DEFAULT_OPTIONS } from '@shared/config';
import { parseClassifierTaxonomy } from '../../services/validation';
import { resolveTaxonomy } from '@shared/config/taxonomyMigration';
import { getOptionsController } from '../../app/optionsControllerContext';
import { type FormSectionHandlers } from '../formSections/formSectionManager';
import { createCheckboxElement as createDaisyCheckboxElement } from '../../../ui/primitives/checkbox';
import { createInputElement as createDaisyInputElement } from '../../../ui/primitives/input';
import { createSelectElement as createDaisySelectElement } from '../../../ui/primitives/select';
import { createTextareaElement as createDaisyTextareaElement } from '../../../ui/primitives/textarea';
import type { SectionRenderContext } from './BaseSection';
import { BaseSection } from './BaseSection';

interface EventBinding {
  target: EventTarget;
  type: string;
  handler: EventListener;
}

const DEFAULT_PROVIDER: ClassifierOptions['provider'] = 'ollama';
const DEFAULT_ENDPOINT = 'http://localhost:11434/api/chat';
const DEFAULT_MODEL = 'llama3.1';
const DEFAULT_TAXONOMY = DEFAULT_OPTIONS.classifier?.taxonomy ?? resolveTaxonomy(undefined);

export class ClassifierSection extends BaseSection<SectionRenderContext> {
  private readonly optionsRepo: IOptionsRepository;
  private enableInput: HTMLInputElement | null = null;
  private unstableNote: HTMLElement | null = null;
  private configWrapper: HTMLElement | null = null;
  private providerSelect: HTMLSelectElement | null = null;
  private endpointInput: HTMLInputElement | null = null;
  private modelInput: HTMLInputElement | null = null;
  private apiKeyInput: HTMLInputElement | null = null;
  private taxonomyTextarea: HTMLTextAreaElement | null = null;
  private eventBindings: EventBinding[] = [];
  private unsubscribeRepo: (() => void) | null = null;

  constructor(container: HTMLElement, optionsRepo: IOptionsRepository) {
    super(container);
    this.optionsRepo = optionsRepo;
  }

  protected renderWithState(): HTMLElement {
    this.disposeBindings();
    this.applySectionChrome();
    const header = this.buildHeader();
    const body = this.buildBody();

    this.container.replaceChildren(header, body);
    this.syncNoticeState();
    this.bindEvents();
    this.registerFormIntegration();
    this.subscribeToRepository();
    return this.container;
  }

  override destroy(): void {
    this.disposeBindings();
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;
    this.unregisterManagedFormSection();
    super.destroy();
  }

  private registerFormIntegration(): void {
    const binding: FormSectionHandlers = {
      applySnapshot: (options) => {
        this.applySnapshot(options);
      },
      collectChanges: (previous) => this.collectChanges(previous)
    };
    this.registerManagedFormSection('classifier', binding);
  }

  private bindEvents(): void {
    if (this.enableInput) {
      this.bindEvent(this.enableInput, 'change', this.handleToggleChange);
    }
    if (this.providerSelect) {
      this.bindEvent(this.providerSelect, 'change', this.handleValueChanged);
    }
    if (this.endpointInput) {
      this.bindEvent(this.endpointInput, 'input', this.handleValueChanged);
    }
    if (this.modelInput) {
      this.bindEvent(this.modelInput, 'input', this.handleValueChanged);
    }
    if (this.apiKeyInput) {
      this.bindEvent(this.apiKeyInput, 'input', this.handleValueChanged);
    }
    if (this.taxonomyTextarea) {
      this.bindEvent(this.taxonomyTextarea, 'input', this.handleValueChanged);
    }
  }

  private bindEvent(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler);
    this.eventBindings.push({ target, type, handler });
  }

  private disposeBindings(): void {
    this.eventBindings.forEach(({ target, type, handler }) => {
      target.removeEventListener(type, handler);
    });
    this.eventBindings = [];
    this.enableInput = null;
    this.unstableNote = null;
    this.configWrapper = null;
    this.providerSelect = null;
    this.endpointInput = null;
    this.modelInput = null;
    this.apiKeyInput = null;
    this.taxonomyTextarea = null;
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;
  }

  private buildHeader(): HTMLElement {
    return this.buildSectionHeader({
      title: this.messages?.classifierConfigTitle ?? 'AI 辅助分类与总结',
      description: this.messages?.featureUntestedNote ?? '功能未测试，暂不稳定',
      titleClassName: 'm-0 text-2xl font-semibold tracking-tight',
      descriptionClassName: 'text-base-content/60 text-md'
    });
  }

  private buildBody(): HTMLElement {
    const wrapper = this.createSectionBody();
    const settings = this.createSectionSettings();

    const enableSetting = this.createSettingRow(
      'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0'
    );
    const enableControl = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    const { root: enableLabel, input: enableInput } = createDaisyCheckboxElement({
      id: 'clsEnable',
      label: this.messages?.enableClassifierLabel ?? '启用 AI 自动分类'
    });
    enableControl.append(enableLabel);

    const unstableNote = this.createElement(
      'small',
      'text-sm text-base-content/60 bg-base-200 border border-base-300 rounded-md p-3 my-3'
    );
    unstableNote.id = 'classifierUnstableNote';
    unstableNote.style.display = 'none';
    unstableNote.textContent =
      this.messages?.classifierUnstableNotice ?? '⚠️ 该部分功能尚不稳定，启用后可能影响剪藏速度';

    enableSetting.append(enableControl, unstableNote);
    settings.append(enableSetting);

    this.enableInput = enableInput;
    this.unstableNote = unstableNote;

    const configWrapper = this.createElement('div', 'grid gap-6');
    configWrapper.id = 'classifierConfig';
    configWrapper.style.display = 'none';
    this.configWrapper = configWrapper;

    configWrapper.append(
      this.createSelectField('clsProvider', this.messages?.providerLabel ?? 'Provider', [
        { value: 'ollama', label: 'Ollama' },
        { value: 'openai', label: 'OpenAI' },
        { value: 'compatible', label: 'Compatible' }
      ]),
      this.createTextField(
        'clsEndpoint',
        this.messages?.endpointLabel ?? 'Endpoint',
        this.messages?.endpointPlaceholder ?? DEFAULT_ENDPOINT
      ),
      this.createTextField(
        'clsModel',
        this.messages?.modelLabel ?? 'Model',
        this.messages?.modelPlaceholder ?? 'llama3.1 / gpt-4o-mini'
      ),
      this.createTextField(
        'clsKey',
        this.messages?.apiKeyLabel ?? 'API Key',
        this.messages?.apiKeyPlaceholder ?? '••••••••',
        'password'
      ),
      this.buildTaxonomySetting()
    );

    settings.append(configWrapper);

    wrapper.append(settings);
    return wrapper;
  }

  private createTextField(
    id: string,
    labelText: string,
    placeholder: string,
    type: 'text' | 'password' = 'text'
  ): HTMLElement {
    const setting = this.createSettingRow();
    const label = this.createElement('div', 'text-sm text-base-content/60 font-semibold');
    label.textContent = labelText;
    const control = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    const input = createDaisyInputElement({
      id,
      type,
      placeholder,
      className: 'w-full min-h-[36px]'
    });
    control.append(input);
    setting.append(label, control);

    switch (id) {
      case 'clsEndpoint':
        this.endpointInput = input;
        break;
      case 'clsModel':
        this.modelInput = input;
        break;
      case 'clsKey':
        this.apiKeyInput = input;
        break;
      default:
        break;
    }

    return setting;
  }

  private createSelectField(
    id: string,
    labelText: string,
    options: Array<{ value: string; label: string }>
  ): HTMLElement {
    const setting = this.createSettingRow();
    const label = this.createElement('div', 'text-sm text-base-content/60 font-semibold');
    label.textContent = labelText;
    const control = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    const select = createDaisySelectElement({
      id,
      className: 'w-full min-h-[36px]',
      options: options.map(({ value, label: optionLabel }) => ({ value, label: optionLabel }))
    });
    control.append(select);
    setting.append(label, control);

    if (id === 'clsProvider') {
      this.providerSelect = select;
    }

    return setting;
  }

  private buildTaxonomySetting(): HTMLElement {
    const setting = this.createSettingRow();
    const taxonomyLabel = this.createElement('div', 'text-sm text-base-content/60 font-semibold');
    taxonomyLabel.textContent = this.messages?.taxonomyLabel ?? 'Taxonomy (JSON)';
    const taxonomyControl = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    const taxonomyTextarea = createDaisyTextareaElement({
      id: 'clsTax',
      rows: 8,
      className: 'font-mono resize-y'
    });
    taxonomyControl.append(taxonomyTextarea);
    const taxonomyHint = this.createElement('div', 'w-full text-xs text-base-content/60 mt-1');
    taxonomyHint.textContent = this.messages?.taxonomyHint ?? '定义分类体系，JSON 格式。';
    setting.append(taxonomyLabel, taxonomyControl, taxonomyHint);
    this.taxonomyTextarea = taxonomyTextarea;
    return setting;
  }

  private handleToggleChange = (): void => {
    this.syncNoticeState();
    const enabled = Boolean(this.enableInput?.checked);
    this.updateConfigVisibility(enabled);
    this.handleValueChanged();
  };

  private handleValueChanged = (): void => {
    const controller = getOptionsController();
    controller?.scheduleAutoSave();
  };

  syncNoticeState = (): void => {
    if (!this.unstableNote) {
      return;
    }
    const enabled = Boolean(this.enableInput?.checked);
    this.unstableNote.style.display = enabled ? 'block' : 'none';
  };

  private updateConfigVisibility(enabled: boolean): void {
    if (this.configWrapper) {
      this.configWrapper.style.display = enabled ? 'grid' : 'none';
    }
  }

  private applySnapshot(options: StoredOptions): void {
    const classifier = options.classifier ?? ({} as ClassifierOptions);

    const enabled = classifier.enabled ?? false;
    if (this.enableInput) {
      this.enableInput.checked = enabled;
    }
    this.syncNoticeState();
    this.updateConfigVisibility(enabled);

    if (this.providerSelect) {
      this.providerSelect.value = classifier.provider ?? DEFAULT_PROVIDER;
    }
    if (this.endpointInput) {
      this.endpointInput.value = classifier.endpoint ?? DEFAULT_ENDPOINT;
    }
    if (this.modelInput) {
      this.modelInput.value = classifier.model ?? DEFAULT_MODEL;
    }
    if (this.apiKeyInput) {
      this.apiKeyInput.value = classifier.apiKey ?? '';
    }
    if (this.taxonomyTextarea) {
      const taxonomy = classifier.taxonomy ?? DEFAULT_TAXONOMY;
      this.taxonomyTextarea.value = JSON.stringify(taxonomy, null, 2);
    }
  }

  private collectChanges(previous: StoredOptions | null): Partial<CompleteOptions> {
    const previousClassifier = previous?.classifier ?? null;
    const enabled = Boolean(this.enableInput?.checked);
    const provider =
      (this.providerSelect?.value as ClassifierOptions['provider']) ??
      previousClassifier?.provider ??
      DEFAULT_PROVIDER;
    const endpoint =
      (this.endpointInput?.value ?? previousClassifier?.endpoint ?? DEFAULT_ENDPOINT).trim() ||
      DEFAULT_ENDPOINT;
    const model =
      (this.modelInput?.value ?? previousClassifier?.model ?? DEFAULT_MODEL).trim() ||
      DEFAULT_MODEL;
    const apiKey = this.apiKeyInput?.value ?? previousClassifier?.apiKey ?? '';

    let taxonomyValue = DEFAULT_TAXONOMY;
    const rawTaxonomy = this.taxonomyTextarea?.value ?? '';
    try {
      const parsed = parseClassifierTaxonomy(rawTaxonomy);
      taxonomyValue = resolveTaxonomy(parsed);
    } catch {
      taxonomyValue = previousClassifier?.taxonomy ?? DEFAULT_TAXONOMY;
    }

    const partial: Partial<CompleteOptions> = {
      classifier: {
        enabled,
        provider,
        endpoint,
        model,
        apiKey,
        taxonomy: taxonomyValue
      }
    };
    this.persistClassifier(partial);
    return partial;
  }

  private subscribeToRepository(): void {
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = this.optionsRepo.onChange((options) => {
      this.applySnapshot(options);
    });
  }

  private persistClassifier(partial: Partial<CompleteOptions>): void {
    void this.optionsRepo.set(partial).catch((error) => {
      console.error(
        '[ClassifierSection] Failed to persist classifier options via repository:',
        error
      );
    });
  }
}
