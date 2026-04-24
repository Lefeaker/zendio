import type { CompleteOptions, StoredOptions, TemplateOptions } from '@shared/types/options';
import { configProvider } from '@shared/config/provider';
import {
  createReadingTemplateController,
  type ReadingTemplateController
} from '@options/components/controls/readingTemplateControls';
import { UiInput as DaisyInput } from '@ui/primitives/input';
import { createSelectElement as createDaisySelectElement } from '@ui/primitives/select';
import { createOptionsHintText } from '@ui/primitives/layout';
import type { WidgetMountContract, WidgetRuntime, BaseWidgetProps } from './contracts';
import { asOptionsSnapshot, createElement } from './utils';

const TEMPLATE_DEFAULTS = configProvider.getTemplates();

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

export interface TemplatesWidgetProps extends BaseWidgetProps {
  options?: StoredOptions | CompleteOptions | null;
}

export class TemplatesWidget
  implements
    WidgetMountContract<
      TemplatesWidgetProps,
      Partial<CompleteOptions>,
      StoredOptions | CompleteOptions | null
    >
{
  private container: HTMLElement | null = null;
  private runtime: WidgetRuntime | undefined;
  private articleInput: HTMLInputElement | null = null;
  private fragmentInput: HTMLInputElement | null = null;
  private aiInput: HTMLInputElement | null = null;
  private readingModeSelect: HTMLSelectElement | null = null;
  private readingCustomInput: HTMLInputElement | null = null;
  private readingController: ReadingTemplateController | null = null;
  private tokenHost: HTMLElement | null = null;

  mount(container: HTMLElement, props: TemplatesWidgetProps, runtime?: WidgetRuntime): void {
    this.container = container;
    this.runtime = runtime;
    this.render(props);
    this.applySnapshot(props.options ?? null);
  }

  update(props: TemplatesWidgetProps, runtime?: WidgetRuntime): void {
    this.runtime = runtime ?? this.runtime;
    this.applySnapshot(props.options ?? null);
  }

  destroy(): void {
    this.readingController?.dispose();
    this.readingController = null;
    this.articleInput = null;
    this.fragmentInput = null;
    this.aiInput = null;
    this.readingModeSelect = null;
    this.readingCustomInput = null;
    this.tokenHost = null;
    this.container = null;
  }

  collect(): Partial<CompleteOptions> {
    const article = resolveTemplateValue(
      this.articleInput?.value,
      undefined,
      TEMPLATE_DEFAULTS.article
    );
    const fragment = resolveTemplateValue(
      this.fragmentInput?.value,
      undefined,
      TEMPLATE_DEFAULTS.fragment
    );
    const readingCollected = this.readingController?.collect() ?? TEMPLATE_DEFAULTS.reading;
    const reading = resolveTemplateValue(readingCollected, undefined, TEMPLATE_DEFAULTS.reading);
    const ai = resolveTemplateValue(this.aiInput?.value, undefined, TEMPLATE_DEFAULTS.ai);

    return {
      templates: {
        article,
        fragment,
        reading,
        ai
      }
    };
  }

  applySnapshot(snapshot: StoredOptions | CompleteOptions | null): void {
    const options = asOptionsSnapshot(snapshot);
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
    this.readingController?.apply(templates.reading ?? TEMPLATE_DEFAULTS.reading);
  }

  private render(props: TemplatesWidgetProps): void {
    if (!this.container) {
      return;
    }
    this.container.replaceChildren();
    this.readingController?.dispose();

    const root = createElement(
      'div',
      'schema-widget-stack schema-output-widget-shell schema-output-templates-shell'
    );
    root.append(
      this.buildTemplateRow(
        props.messages?.articleTemplateLabel ?? '文章 / 视频路径模板',
        props.messages?.templateConfigHint ?? '配置不同内容类型的保存路径。',
        'Articles/{domain}/{yyyy}/{slug}.md',
        (input) => {
          this.articleInput = input;
        }
      ),
      this.buildTemplateRow(
        props.messages?.fragmentTemplateLabel ?? '片段路径模板',
        props.messages?.fragmentTemplateHint ?? 'Fragment clipper 的落盘路径。',
        'Clippings/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
        (input) => {
          this.fragmentInput = input;
        }
      ),
      this.buildReadingField(props),
      this.buildTemplateRow(
        props.messages?.aiTemplateLabel ?? 'AI 对话路径模板',
        props.messages?.aiTemplateHint ?? 'AI 导出单独保存，避免混入普通文章目录。',
        'AI/{platform}/{yyyy}/{yyyy}-{mm}-{dd}_{title}.md',
        (input) => {
          this.aiInput = input;
        }
      ),
      this.buildTokenRow(props)
    );

    this.container.append(root);
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
          onChange: () => this.runtime?.notifyDirty?.(['templates'])
        },
        {
          defaultTemplate: TEMPLATE_DEFAULTS.reading,
          articleDefault: TEMPLATE_DEFAULTS.article,
          fragmentDefault: TEMPLATE_DEFAULTS.fragment
        }
      );
    }
  }

  private buildTemplateRow(
    title: string,
    description: string,
    placeholder: string,
    register: (input: HTMLInputElement) => void
  ): HTMLElement {
    const row = this.buildOutputRow(title, description);
    const host = createElement('div', 'schema-output-template-input-host');
    const input = new DaisyInput(host).render({
      type: 'text',
      variant: 'bordered',
      size: 'md',
      placeholder,
      className: 'schema-input schema-output-template-input'
    });
    input.addEventListener('input', () => this.runtime?.notifyDirty?.(['templates']));
    register(input);
    row.querySelector<HTMLElement>('.schema-row-control')?.append(host);
    return row;
  }

  private buildReadingField(props: TemplatesWidgetProps): HTMLElement {
    const row = this.buildOutputRow(
      props.messages?.readingTemplateLabel ?? '阅读模式路径模板',
      props.messages?.readingTemplateHint ?? '可以继承文章路径、片段路径，或切换到自定义模板。'
    );

    const control = createElement('div', 'schema-output-template-stack');
    const select = createDaisySelectElement({
      className: 'schema-select schema-output-template-select',
      options: [
        {
          value: 'article',
          label: props.messages?.readingTemplateOptionArticle ?? '与文章路径相同'
        },
        {
          value: 'fragment',
          label: props.messages?.readingTemplateOptionFragment ?? '与片段路径相同'
        },
        { value: 'custom', label: props.messages?.readingTemplateOptionCustom ?? '自定义' }
      ]
    });
    const inputHost = createElement('div', 'schema-output-template-input-host');
    const input = new DaisyInput(inputHost).render({
      type: 'text',
      variant: 'bordered',
      size: 'md',
      placeholder: 'Reading/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
      disabled: true,
      className: 'schema-input schema-output-template-input'
    });
    control.append(select, inputHost);
    this.readingModeSelect = select;
    this.readingCustomInput = input;
    row.querySelector<HTMLElement>('.schema-row-control')?.append(control);
    return row;
  }

  private buildTokenRow(props: TemplatesWidgetProps): HTMLElement {
    const wrapper = createElement('div', 'schema-output-token-block');
    const title = createElement('strong', 'schema-widget-title');
    title.textContent = props.messages?.templateConfigTitle ?? 'Path Templates';
    const tokens = [
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
    ];
    const help = createOptionsHintText({ tag: 'div' });
    help.classList.add('schema-widget-hint');
    help.textContent =
      props.messages?.templateVariableNote ??
      '将鼠标放到上方任一路径输入框，再点击下方字段快速插入。';
    const tokenRow = createElement('div', 'schema-token-row schema-output-token-row');
    tokens.forEach((token) => {
      const button = createElement('button', 'schema-token');
      button.type = 'button';
      button.textContent = token;
      button.addEventListener('click', () => this.insertToken(token));
      tokenRow.append(button);
    });
    wrapper.append(title, help, tokenRow);
    return wrapper;
  }

  private buildOutputRow(title: string, description: string): HTMLElement {
    const row = createElement('section', 'schema-row schema-output-template-row');
    const label = createElement('div', 'schema-row-label');
    const titleEl = createElement('strong');
    titleEl.textContent = title;
    const descriptionEl = createElement('span');
    descriptionEl.textContent = description;
    label.append(titleEl, descriptionEl);

    const control = createElement('div', 'schema-row-control schema-output-template-control');
    row.append(label, control);
    return row;
  }

  private insertToken(token: string): void {
    const inputs = [
      this.articleInput,
      this.fragmentInput,
      this.readingCustomInput && !this.readingCustomInput.disabled ? this.readingCustomInput : null,
      this.aiInput
    ].filter((input): input is HTMLInputElement => input instanceof HTMLInputElement);

    const active =
      inputs.find((input) => document.activeElement === input) ??
      this.readingCustomInput ??
      this.articleInput ??
      this.fragmentInput ??
      this.aiInput;

    if (!active) {
      return;
    }

    const currentValue = active.value;
    const start = active.selectionStart ?? currentValue.length;
    const end = active.selectionEnd ?? currentValue.length;
    active.value = `${currentValue.slice(0, start)}${token}${currentValue.slice(end)}`;
    const cursor = start + token.length;
    active.focus();
    active.setSelectionRange(cursor, cursor);
    active.dispatchEvent(new Event('input', { bubbles: true }));
    this.runtime?.notifyDirty?.(['templates']);
  }
}
