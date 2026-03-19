import type { YamlConfigOverrides } from '@shared/types/yamlConfig';
import { BaseComponent } from '../shared/BaseComponent';
import { createButton } from '../shared/DaisyUIHelpers';
import { createYamlConfigController, type YamlConfigController } from './yamlConfigTable';

const ARRAY_PLACEHOLDER_EXAMPLE = 'value1; value2; value3';
const ARRAY_HINT_TEXT = 'Use ";" to separate items.';

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
  private tableHost: HTMLElement | null = null;
  private domainHost: HTMLElement | null = null;
  private addButton: HTMLButtonElement | null = null;

  render(context: YamlConfigViewRenderContext): HTMLElement {
    this.assertActive();
    if (!this.yamlController) {
      this.mountLayout(context.onDirty);
    }
    this.yamlController?.render(context.overrides);
    return this.container;
  }

  update(overrides: YamlConfigOverrides | null): void {
    this.assertActive();
    this.yamlController?.render(overrides);
  }

  collect(): YamlConfigOverrides | null {
    this.assertActive();
    return this.yamlController?.collect() ?? null;
  }

  override destroy(): void {
    this.yamlController?.dispose();
    this.yamlController = null;
    this.tableHost = null;
    this.domainHost = null;
    this.addButton = null;
    super.destroy();
  }

  private mountLayout(onDirty: () => void): void {
    const extMessages = this.messages as unknown as Record<string, string> | undefined;
    const wrapper = this.createElement('div', 'yaml-config space-y-6', { 'data-role': 'yaml-config-view' });

    this.tableHost = this.createElement('div');
    this.tableHost.id = 'yamlConfigTable';
    this.tableHost.dataset.labelField = this.messages?.yamlFieldNameLabel ?? 'Field';
    this.tableHost.dataset.labelType = this.messages?.yamlFieldTypeLabel ?? 'Type';
    this.tableHost.dataset.labelArticle = this.messages?.yamlFieldArticleLabel ?? 'Article';
    this.tableHost.dataset.labelClipper = this.messages?.yamlFieldClipperLabel ?? 'Clipper';
    this.tableHost.dataset.labelVideo = this.messages?.yamlFieldVideoLabel ?? 'Video';
    this.tableHost.dataset.labelAi = this.messages?.yamlFieldAiLabel ?? 'AI';
    this.tableHost.dataset.labelDefault = this.messages?.yamlFieldDefaultValueLabel ?? 'Value';
    this.tableHost.dataset.labelActions = this.messages?.yamlFieldActionsLabel ?? 'Actions';
    this.tableHost.dataset.labelDelete = this.messages?.yamlFieldDeleteButton ?? 'Delete';
    this.tableHost.dataset.namePlaceholder = this.messages?.yamlFieldCustomNamePlaceholder ?? 'Field name';
    this.tableHost.dataset.placeholderValue = this.messages?.yamlFieldDefaultPlaceholder ?? 'Field value';
    this.tableHost.dataset.placeholderArray = normalizeArrayPlaceholderText(extMessages?.yamlFieldArrayPlaceholder);
    this.tableHost.dataset.hintArray = normalizeArrayHintText(extMessages?.yamlFieldArrayHint);
    this.tableHost.dataset.hintArrayPreviewEmpty = extMessages?.yamlFieldArrayPreviewEmpty ?? '未配置数组项';
    this.tableHost.dataset.labelAdvancedShow = this.messages?.yamlFieldAdvancedShowLabel ?? 'Show source';
    this.tableHost.dataset.labelAdvancedHide = this.messages?.yamlFieldAdvancedHideLabel ?? 'Hide source';
    this.tableHost.dataset.labelValuePath = this.messages?.yamlFieldValuePathLabel ?? 'Value path';
    this.tableHost.dataset.placeholderValuePath = this.messages?.yamlFieldValuePathPlaceholder ?? 'e.g. meta.author or extra.notes[0]';
    this.tableHost.dataset.hintValuePath = this.messages?.yamlFieldValuePathHint ?? 'Optional: map this field to data in the capture context. Leave empty to use captured or default values.';
    this.tableHost.dataset.labelValuePathExamplesTitle = extMessages?.yamlFieldValuePathExamplesTitle ?? '常见上下文字段';
    this.tableHost.dataset.hintValuePathExamples = extMessages?.yamlFieldValuePathExamples ?? 'meta.author\nstats.wordCount\nextra.notes[0]';
    this.tableHost.dataset.labelDefaultGroup = this.messages?.yamlDefaultGroupLabel ?? '默认字段';
    this.tableHost.dataset.labelFilterAll = this.messages?.yamlFilterAllLabel ?? 'All';
    this.tableHost.dataset.labelCustomGroup = this.messages?.yamlCustomGroupLabel ?? 'Custom fields';
    this.tableHost.dataset.errorNameRequired = this.messages?.yamlFieldErrorNameRequired ?? 'Field name is required';
    this.tableHost.dataset.errorNamePattern = this.messages?.yamlFieldErrorNamePattern ?? 'Only letters, numbers, underscores, or dashes are allowed, and it cannot start with a number.';
    this.tableHost.dataset.errorNameDuplicate = this.messages?.yamlFieldErrorNameDuplicate ?? 'Duplicate field name, please pick another.';
    this.tableHost.dataset.errorModeRequired = this.messages?.yamlFieldErrorModeRequired ?? 'Enable at least one content type.';
    this.tableHost.dataset.errorTypeRequired = this.messages?.yamlFieldErrorTypeRequired ?? 'Select a field type.';
    this.tableHost.dataset.errorValueInvalid = this.messages?.yamlFieldErrorValueInvalid ?? 'Default value does not match the field type.';
    this.tableHost.dataset.errorValuePathInvalid = this.messages?.yamlFieldErrorValuePathInvalid ?? 'Value path cannot contain spaces.';
    this.tableHost.dataset.warningUnresolved = this.messages?.yamlFieldSaveBlockedWarning ?? 'Fix the highlighted errors before saving.';

    this.domainHost = this.createElement('div');
    this.domainHost.id = 'yamlDomainOverrides';
    this.domainHost.dataset.labelTitle = extMessages?.yamlDomainTitle ?? '域名覆盖';
    this.domainHost.dataset.labelHint = extMessages?.yamlDomainHint ?? '针对特定域名调整字段启用状态与默认值，优先级高于全局设置。';
    this.domainHost.dataset.labelAddRule = extMessages?.yamlDomainAddRule ?? '+ 添加域名规则';
    this.domainHost.dataset.labelEmpty = extMessages?.yamlDomainEmpty ?? '尚未创建任何域名规则。';
    this.domainHost.dataset.placeholderDomain = extMessages?.yamlDomainPlaceholder ?? '例如 example.com 或 *.example.com';
    this.domainHost.dataset.labelContentType = extMessages?.yamlDomainContentTypeLabel ?? '内容类型';
    this.domainHost.dataset.labelAddField = extMessages?.yamlDomainAddField ?? '+ 添加字段';
    this.domainHost.dataset.labelRemoveRule = extMessages?.yamlDomainRemoveRule ?? '删除规则';
    this.domainHost.dataset.labelFieldEmpty = extMessages?.yamlDomainFieldEmpty ?? '未配置字段';
    this.domainHost.dataset.labelFieldEnabled = extMessages?.yamlDomainFieldEnabled ?? '启用';
    this.domainHost.dataset.labelFieldRemove = extMessages?.yamlDomainFieldRemove ?? '移除';
    this.domainHost.dataset.placeholderValue = extMessages?.yamlDomainFieldValuePlaceholder ?? '默认值（可选）';
    this.domainHost.dataset.placeholderValueArray = normalizeArrayPlaceholderText(extMessages?.yamlDomainFieldArrayPlaceholder);
    this.domainHost.dataset.hintValueArray = normalizeArrayHintText(extMessages?.yamlDomainFieldArrayHint);
    this.domainHost.dataset.hintArrayPreviewEmpty = extMessages?.yamlDomainFieldArrayPreviewEmpty ?? '未配置数组项';
    this.domainHost.dataset.labelValuePath = extMessages?.yamlDomainValuePathLabel ?? 'Value path (可选)';
    this.domainHost.dataset.placeholderValuePath = extMessages?.yamlDomainValuePathPlaceholder ?? '如 meta.author';
    this.domainHost.dataset.errorDomainRequired = extMessages?.yamlDomainErrorDomainRequired ?? '域名不能为空。';
    this.domainHost.dataset.errorDomainDuplicate = extMessages?.yamlDomainErrorDomainDuplicate ?? '同一内容类型中存在重复的域名规则。';
    this.domainHost.dataset.errorFieldRequired = extMessages?.yamlDomainErrorFieldRequired ?? '至少选择一个字段。';
    this.domainHost.dataset.errorFieldDuplicate = extMessages?.yamlDomainErrorFieldDuplicate ?? '同一规则中存在重复字段。';
    this.domainHost.dataset.errorFieldUnsupported = extMessages?.yamlDomainErrorFieldUnsupported ?? '字段在当前内容类型中不可用：';
    this.domainHost.dataset.errorValueInvalid = extMessages?.yamlDomainErrorValueInvalid ?? '字段默认值与类型不匹配：';
    this.domainHost.dataset.errorValuePathInvalid = extMessages?.yamlDomainErrorValuePathInvalid ?? 'Value path 不能包含空格。';
    this.domainHost.dataset.warningUnresolved = extMessages?.yamlDomainWarningUnresolved ?? '修复域名规则中的错误后再保存。';

    const actions = this.createElement('div', 'flex flex-wrap gap-2 pt-2');
    this.addButton = createButton(this.messages?.yamlFieldAddButton ?? '+ Add field', {
      variant: 'primary',
      size: 'md'
    });
    this.addButton.id = 'yamlAddFieldBtn';
    actions.append(this.addButton);

    const hint = this.createElement('p', 'text-sm text-base-content/60 mt-2');
    hint.textContent = this.messages?.yamlFieldAvailabilityNote ?? 'Disable a switch to hide a field. Newly added fields apply to the selected export types.';

    wrapper.append(this.tableHost, this.domainHost, actions, hint);
    this.container.replaceChildren(wrapper);

    this.yamlController = createYamlConfigController({
      tableHost: this.tableHost,
      domainHost: this.domainHost,
      addFieldButton: this.addButton,
      onDirty
    });
    if (this.messages && 'setMessages' in this.yamlController) {
      this.yamlController.setMessages?.(this.messages);
    }
  }
}
