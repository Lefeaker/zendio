import type { CompleteOptions, StoredOptions, ClassifierOptions } from '@shared/types/options';
import type { IOptionsRepository } from '@shared/repositories';
import { resolveRepository } from '@shared/di/serviceRegistry';
import { DI_TOKENS } from '@shared/di/tokens';
import { DEFAULT_OPTIONS } from '@shared/config';
import { parseClassifierTaxonomy } from '../../services/validation';
import { resolveTaxonomy } from '@shared/config/taxonomyMigration';
import { getOptionsController } from '../../app/optionsControllerContext';
import { type FormSectionHandlers } from '../formSections/formSectionManager';
import { registerClassifierSync, unregisterClassifierSync } from '../sectionRegistry';
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

  private formSectionBinding: FormSectionHandlers | null = null;
  private eventBindings: EventBinding[] = [];
  private isRegistered = false;
  private unsubscribeRepo: (() => void) | null = null;

  constructor(container: HTMLElement, optionsRepo?: IOptionsRepository) {
    super(container);
    this.optionsRepo = optionsRepo ?? resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
  }

  protected renderWithState(): HTMLElement {
    this.disposeBindings();
    this.container.classList.add('aobx-section', 'bg-base-100', 'border', 'border-base-300', 'rounded-lg', 'p-[clamp(22px,2.5vw,32px)]', 'shadow-card');
    const header = this.buildHeader();
    const body = this.buildBody();

    this.container.replaceChildren(header, body);
    this.syncUnstableNote();
    this.ensureRegistryBinding();
    this.bindEvents();
    this.registerFormIntegration();
    this.subscribeToRepository();
    return this.container;
  }

  override destroy(): void {
    this.disposeBindings();
    this.unsubscribeRepo?.();
    this.unsubscribeRepo = null;
    if (this.isRegistered) {
      unregisterClassifierSync(this.syncUnstableNote);
      this.isRegistered = false;
    }
    if (this.formSectionBinding) {
      const registry = this.requireFormRegistry();
      registry.unregister('classifier', this.formSectionBinding);
      this.formSectionBinding = null;
    }
    super.destroy();
  }

  private registerFormIntegration(): void {
    const registry = this.requireFormRegistry();
    if (this.formSectionBinding) {
      registry.unregister('classifier', this.formSectionBinding);
    }

    const binding: FormSectionHandlers = {
      applySnapshot: (options) => {
        this.applySnapshot(options);
      },
      collectChanges: (previous) => this.collectChanges(previous)
    };

    registry.register('classifier', binding);
    this.formSectionBinding = binding;
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
    const header = this.createElement('div', 'grid gap-2 mb-6');

    const titleWrapper = this.createElement('div', 'flex items-center gap-2');
    const title = document.createElement('h2');
    title.className = 'text-lg font-semibold text-base-content m-0';
    title.textContent = this.messages?.classifierConfigTitle ?? 'AI 辅助分类与总结';
    titleWrapper.append(title);

    const subtitle = this.createElement('div', 'text-sm text-base-content/60');
    subtitle.textContent =
      this.messages?.featureUntestedNote ?? '功能未测试，暂不稳定';

    header.append(titleWrapper, subtitle);
    return header;
  }

  private buildBody(): HTMLElement {
    const wrapper = this.createElement('div', 'mt-6 space-y-6');
    const settings = this.createElement('div', 'grid gap-6');

    const enableSetting = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0');
    const enableControl = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    const enableLabel = this.createElement(
      'label',
      ['inline-flex', 'items-center', 'gap-2', 'text-sm', 'text-base-content', 'cursor-pointer'].join(' ')
    );
    // ✅ Stage 3 Week 4: Using DaisyUI checkbox classes for classifier toggle (ClassifierSection)
    // ⏸️ Stage 3 Month 3: Upgrade to DaisySwitch component pending Zag.js integration
    const enableInput = document.createElement('input');
    enableInput.type = 'checkbox';
    enableInput.id = 'clsEnable';
    enableInput.className = 'checkbox checkbox-accent w-[18px] h-[18px]';
    enableLabel.append(
      enableInput,
      document.createTextNode(this.messages?.enableClassifierLabel ?? '启用 AI 自动分类')
    );
    enableControl.append(enableLabel);

    const unstableNote = this.createElement('small', 'text-sm text-base-content/60 bg-base-200 border border-base-300 rounded-md p-3 my-3');
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
    const setting = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)]');
    const label = this.createElement('div', 'text-sm text-base-content/60 font-semibold');
    label.textContent = labelText;
    const control = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    // ✅ Stage 3 Week 4: Using DaisyUI input classes for classifier text fields (ClassifierSection)
    // ⏸️ Stage 3 Month 3: Upgrade to DaisyInput component with validation pending refactor
    const input = document.createElement('input');
    input.type = type;
    input.className = 'input input-bordered w-full min-h-[36px]';
    input.id = id;
    input.placeholder = placeholder;
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
    const setting = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)]');
    const label = this.createElement('div', 'text-sm text-base-content/60 font-semibold');
    label.textContent = labelText;
    const control = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    // ✅ Stage 3 Week 4: Using DaisyUI select classes for classifier provider (ClassifierSection)
    // ⏸️ Stage 3 Month 3: Replace with Zag.js Select component for better a11y
    const select = document.createElement('select');
    select.className = 'select select-bordered w-full min-h-[36px]';
    select.id = id;
    options.forEach(({ value, label: optionLabel }) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = optionLabel;
      select.append(option);
    });
    control.append(select);
    setting.append(label, control);

    if (id === 'clsProvider') {
      this.providerSelect = select;
    }

    return setting;
  }

  private buildTaxonomySetting(): HTMLElement {
    const setting = this.createElement('div', 'grid grid-cols-[minmax(0,1fr)] gap-3 py-4 border-t border-base-300 items-start first:border-t-0 first:pt-0 sm:grid-cols-[180px_minmax(0,1fr)]');
    const taxonomyLabel = this.createElement('div', 'text-sm text-base-content/60 font-semibold');
    taxonomyLabel.textContent = this.messages?.taxonomyLabel ?? 'Taxonomy (JSON)';
    const taxonomyControl = this.createElement('div', 'flex flex-wrap justify-start gap-2');
    // ✅ Stage 3 Week 4: Using DaisyUI textarea classes for classifier taxonomy (ClassifierSection)
    // ⏸️ Stage 3 Month 3: Upgrade to Monaco/CodeMirror for JSON editing with syntax highlighting
    const taxonomyTextarea = document.createElement('textarea');
    taxonomyTextarea.id = 'clsTax';
    taxonomyTextarea.rows = 8;
    taxonomyTextarea.className = 'textarea textarea-bordered w-full min-h-[80px] font-mono text-sm leading-relaxed resize-y';
    taxonomyControl.append(taxonomyTextarea);
    const taxonomyHint = this.createElement('div', 'w-full text-xs text-base-content/60 mt-1');
    taxonomyHint.textContent = this.messages?.taxonomyHint ?? '定义分类体系，JSON 格式。';
    setting.append(taxonomyLabel, taxonomyControl, taxonomyHint);
    this.taxonomyTextarea = taxonomyTextarea;
    return setting;
  }

  private handleToggleChange = (): void => {
    this.syncUnstableNote();
    const enabled = Boolean(this.enableInput?.checked);
    this.updateConfigVisibility(enabled);
    this.handleValueChanged();
  };

  private handleValueChanged = (): void => {
    const controller = getOptionsController();
    controller?.scheduleAutoSave();
  };

  private syncUnstableNote = (): void => {
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

  private ensureRegistryBinding(): void {
    if (this.isRegistered) {
      unregisterClassifierSync(this.syncUnstableNote);
      this.isRegistered = false;
    }
    registerClassifierSync(this.syncUnstableNote);
    this.isRegistered = true;
  }

  private applySnapshot(options: StoredOptions): void {
    const classifier = options.classifier ?? ({} as ClassifierOptions);

    const enabled = classifier.enabled ?? false;
    if (this.enableInput) {
      this.enableInput.checked = enabled;
    }
    this.syncUnstableNote();
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
    const endpoint = (this.endpointInput?.value ?? previousClassifier?.endpoint ?? DEFAULT_ENDPOINT).trim() || DEFAULT_ENDPOINT;
    const model = (this.modelInput?.value ?? previousClassifier?.model ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
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
    void this.optionsRepo
      .set(partial)
      .catch((error) => {
        console.error('[ClassifierSection] Failed to persist classifier options via repository:', error);
      });
  }
}
