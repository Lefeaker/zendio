import type { YamlConfigOverrides } from '@shared/types/yamlConfig';
import { BaseComponent } from '../../foundation/lifecycle/BaseComponent';
import { createOptionsButtonElement } from '../../primitives/button';
import { createOptionsActionRow, createOptionsHintText } from '../../primitives/layout';
import type { YamlConfigController } from './yamlConfigTable';

const ARRAY_PLACEHOLDER_EXAMPLE = 'value1; value2; value3';
const ARRAY_HINT_TEXT = 'Use ";" to separate items.';

function applyDataset(element: HTMLElement, values: Record<string, string | undefined>): void {
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) {
      element.dataset[key] = value;
    }
  });
}

function normalizeArrayPlaceholderText(value?: string): string {
  if (!value) {
    return ARRAY_PLACEHOLDER_EXAMPLE;
  }
  return value.includes(';') ? value : ARRAY_PLACEHOLDER_EXAMPLE;
}

function normalizeArrayHintText(value?: string): string {
  if (!value) {
    return ARRAY_HINT_TEXT;
  }
  return value.includes(';') ? value : ARRAY_HINT_TEXT;
}

export interface YamlConfigViewRenderContext {
  overrides: YamlConfigOverrides | null;
  onDirty: () => void;
}

export class YamlConfigView extends BaseComponent<YamlConfigViewRenderContext> {
  private yamlController: YamlConfigController | null = null;
  private controllerModulePromise: Promise<typeof import('./yamlConfigTable')> | null = null;
  private pendingOverrides: YamlConfigOverrides | null = null;
  private tableHost: HTMLElement | null = null;
  private domainHost: HTMLElement | null = null;
  private addButton: HTMLButtonElement | null = null;

  render(context: YamlConfigViewRenderContext): HTMLElement {
    this.assertActive();
    this.pendingOverrides = context.overrides;
    if (!this.yamlController) {
      this.mountLayout();
      void this.ensureController(context.onDirty);
      return this.container;
    }
    this.yamlController.render(context.overrides);
    return this.container;
  }

  update(overrides: YamlConfigOverrides | null): void {
    this.assertActive();
    this.pendingOverrides = overrides;
    this.yamlController?.render(overrides);
  }

  collect(): YamlConfigOverrides | null {
    this.assertActive();
    return this.yamlController?.collect() ?? null;
  }

  override destroy(): void {
    this.yamlController?.dispose();
    this.yamlController = null;
    this.controllerModulePromise = null;
    this.pendingOverrides = null;
    this.tableHost = null;
    this.domainHost = null;
    this.addButton = null;
    super.destroy();
  }

  private mountLayout(): void {
    const extMessages = this.messages as unknown as Record<string, string> | undefined;
    const wrapper = this.createElement('div', 'yaml-config schema-output-yaml-layout', {
      'data-role': 'yaml-config-view'
    });
    const header = this.createElement('div', 'schema-card-header schema-output-widget-header');
    const copy = this.createElement('div');
    const title = this.createElement('h3');
    title.textContent = extMessages?.yamlConfigTitle ?? 'YAML Configuration';
    const description = this.createElement('p');
    description.textContent =
      extMessages?.yamlConfigHint ??
      'Manage shared fields, content-type switches, and domain overrides from one production shell.';
    copy.append(title, description);
    header.append(copy);

    this.tableHost = this.createElement('div');
    this.tableHost.id = 'yamlConfigTable';
    this.tableHost.className = 'schema-output-yaml-table';
    applyDataset(this.tableHost, {
      labelField: this.messages?.yamlFieldNameLabel ?? 'Field',
      labelType: this.messages?.yamlFieldTypeLabel ?? 'Type',
      labelArticle: this.messages?.yamlFieldArticleLabel ?? 'Article',
      labelClipper: this.messages?.yamlFieldClipperLabel ?? 'Clipper',
      labelVideo: this.messages?.yamlFieldVideoLabel ?? 'Video',
      labelAi: this.messages?.yamlFieldAiLabel ?? 'AI',
      labelDefault: this.messages?.yamlFieldDefaultValueLabel ?? 'Value',
      labelActions: this.messages?.yamlFieldActionsLabel ?? 'Actions',
      labelDelete: this.messages?.yamlFieldDeleteButton ?? 'Delete',
      namePlaceholder: this.messages?.yamlFieldCustomNamePlaceholder ?? 'Field name',
      placeholderValue: this.messages?.yamlFieldDefaultPlaceholder ?? 'Field value',
      placeholderArray: normalizeArrayPlaceholderText(extMessages?.yamlFieldArrayPlaceholder),
      hintArray: normalizeArrayHintText(extMessages?.yamlFieldArrayHint),
      hintArrayPreviewEmpty: extMessages?.yamlFieldArrayPreviewEmpty ?? '未配置数组项',
      labelAdvancedShow: this.messages?.yamlFieldAdvancedShowLabel ?? 'Show source',
      labelAdvancedHide: this.messages?.yamlFieldAdvancedHideLabel ?? 'Hide source',
      labelValuePath: this.messages?.yamlFieldValuePathLabel ?? 'Value path',
      placeholderValuePath:
        this.messages?.yamlFieldValuePathPlaceholder ?? 'e.g. meta.author or extra.notes[0]',
      hintValuePath:
        this.messages?.yamlFieldValuePathHint ??
        'Optional: map this field to data in the capture context. Leave empty to use captured or default values.',
      labelValuePathExamplesTitle: extMessages?.yamlFieldValuePathExamplesTitle ?? '常见上下文字段',
      hintValuePathExamples:
        extMessages?.yamlFieldValuePathExamples ?? 'meta.author\nstats.wordCount\nextra.notes[0]',
      labelDefaultGroup: this.messages?.yamlDefaultGroupLabel ?? '默认字段',
      labelFilterAll: this.messages?.yamlFilterAllLabel ?? 'All',
      labelCustomGroup: this.messages?.yamlCustomGroupLabel ?? 'Custom fields',
      errorNameRequired: this.messages?.yamlFieldErrorNameRequired ?? 'Field name is required',
      errorNamePattern:
        this.messages?.yamlFieldErrorNamePattern ??
        'Only letters, numbers, underscores, or dashes are allowed, and it cannot start with a number.',
      errorNameDuplicate:
        this.messages?.yamlFieldErrorNameDuplicate ?? 'Duplicate field name, please pick another.',
      errorModeRequired:
        this.messages?.yamlFieldErrorModeRequired ?? 'Enable at least one content type.',
      errorTypeRequired: this.messages?.yamlFieldErrorTypeRequired ?? 'Select a field type.',
      errorValueInvalid:
        this.messages?.yamlFieldErrorValueInvalid ?? 'Default value does not match the field type.',
      errorValuePathInvalid:
        this.messages?.yamlFieldErrorValuePathInvalid ?? 'Value path cannot contain spaces.',
      warningUnresolved:
        this.messages?.yamlFieldSaveBlockedWarning ?? 'Fix the highlighted errors before saving.'
    });

    this.domainHost = this.createElement('div');
    this.domainHost.id = 'yamlDomainOverrides';
    this.domainHost.className = 'schema-output-yaml-domain';
    applyDataset(this.domainHost, {
      labelTitle: extMessages?.yamlDomainTitle ?? '域名覆盖',
      labelHint:
        extMessages?.yamlDomainHint ?? '针对特定域名调整字段启用状态与默认值，优先级高于全局设置。',
      labelAddRule: extMessages?.yamlDomainAddRule ?? '+ 添加域名规则',
      labelEmpty: extMessages?.yamlDomainEmpty ?? '尚未创建任何域名规则。',
      placeholderDomain: extMessages?.yamlDomainPlaceholder ?? '例如 example.com 或 *.example.com',
      labelContentType: extMessages?.yamlDomainContentTypeLabel ?? '内容类型',
      labelAddField: extMessages?.yamlDomainAddField ?? '+ 添加字段',
      labelRemoveRule: extMessages?.yamlDomainRemoveRule ?? '删除规则',
      labelFieldEmpty: extMessages?.yamlDomainFieldEmpty ?? '未配置字段',
      labelFieldEnabled: extMessages?.yamlDomainFieldEnabled ?? '启用',
      labelFieldRemove: extMessages?.yamlDomainFieldRemove ?? '移除',
      placeholderValue: extMessages?.yamlDomainFieldValuePlaceholder ?? '默认值（可选）',
      placeholderValueArray: normalizeArrayPlaceholderText(
        extMessages?.yamlDomainFieldArrayPlaceholder
      ),
      hintValueArray: normalizeArrayHintText(extMessages?.yamlDomainFieldArrayHint),
      hintArrayPreviewEmpty: extMessages?.yamlDomainFieldArrayPreviewEmpty ?? '未配置数组项',
      labelValuePath: extMessages?.yamlDomainValuePathLabel ?? 'Value path (可选)',
      placeholderValuePath: extMessages?.yamlDomainValuePathPlaceholder ?? '如 meta.author',
      errorDomainRequired: extMessages?.yamlDomainErrorDomainRequired ?? '域名不能为空。',
      errorDomainDuplicate:
        extMessages?.yamlDomainErrorDomainDuplicate ?? '同一内容类型中存在重复的域名规则。',
      errorFieldRequired: extMessages?.yamlDomainErrorFieldRequired ?? '至少选择一个字段。',
      errorFieldDuplicate: extMessages?.yamlDomainErrorFieldDuplicate ?? '同一规则中存在重复字段。',
      errorFieldUnsupported:
        extMessages?.yamlDomainErrorFieldUnsupported ?? '字段在当前内容类型中不可用：',
      errorValueInvalid: extMessages?.yamlDomainErrorValueInvalid ?? '字段默认值与类型不匹配：',
      errorValuePathInvalid:
        extMessages?.yamlDomainErrorValuePathInvalid ?? 'Value path 不能包含空格。',
      warningUnresolved:
        extMessages?.yamlDomainWarningUnresolved ?? '修复域名规则中的错误后再保存。'
    });

    const actions = createOptionsActionRow({ className: 'schema-output-actions' });
    this.addButton = createOptionsButtonElement({
      label: this.messages?.yamlFieldAddButton ?? '+ Add field',
      variant: 'primary',
      size: 'md',
      className: 'schema-output-widget-action'
    });
    this.addButton.id = 'yamlAddFieldBtn';
    actions.append(this.addButton);

    const hint = createOptionsHintText();
    hint.classList.add('schema-widget-hint', 'schema-output-note');
    hint.textContent =
      this.messages?.yamlFieldAvailabilityNote ??
      'Disable a switch to hide a field. Newly added fields apply to the selected export types.';

    wrapper.append(header, this.tableHost, this.domainHost, actions, hint);
    this.container.replaceChildren(wrapper);
  }

  private loadControllerModule(): Promise<typeof import('./yamlConfigTable')> {
    if (!this.controllerModulePromise) {
      this.controllerModulePromise = import('./yamlConfigTable');
    }
    return this.controllerModulePromise;
  }

  private async ensureController(onDirty: () => void): Promise<void> {
    if (this.yamlController || !this.tableHost) {
      return;
    }

    const { createYamlConfigController } = await this.loadControllerModule();
    if (!this.tableHost || !this.addButton || !this.domainHost || this.yamlController) {
      return;
    }

    this.yamlController = createYamlConfigController({
      tableHost: this.tableHost,
      domainHost: this.domainHost,
      addFieldButton: this.addButton,
      onDirty
    });
    if (this.messages && 'setMessages' in this.yamlController) {
      this.yamlController.setMessages?.(this.messages);
    }
    this.yamlController.render(this.pendingOverrides);
  }
}
