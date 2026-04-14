import {
  ARRAY_INPUT_HINT,
  ARRAY_INPUT_PLACEHOLDER,
  type YamlConfigDomainLabels,
  type YamlConfigTableLabels
} from './yamlConfigTableTypes';

export function collectYamlTableLabels(tableHost: HTMLElement | null): YamlConfigTableLabels {
  const dataset = tableHost?.dataset ?? {};
  const fallback = {
    field: '字段',
    type: '类型',
    article: '文章',
    clipper: '片段',
    video: '视频',
    ai: 'AI',
    defaultValue: '默认值',
    actions: '操作',
    deleteButton: '删除',
    namePlaceholder: '字段名',
    valuePlaceholder: '字段值',
    arrayPlaceholder: ARRAY_INPUT_PLACEHOLDER,
    arrayHint: ARRAY_INPUT_HINT,
    arrayPreviewEmpty: '数组值将以分号分隔保存',
    errorNameRequired: '字段名称不能为空。',
    errorNamePattern: '字段名称只能包含字母、数字、下划线或短横线，且不能以数字开头。',
    errorNameDuplicate: '字段名称重复，请修改后再保存。',
    errorTypeRequired: '请选择字段类型。',
    errorModeRequired: '至少启用一个内容类型。',
    errorValueInvalid: '默认值与字段类型不匹配。',
    errorValuePathInvalid: '值路径格式无效。',
    warningUnresolvedErrors: '请先修复 YAML 配置中的错误。',
    advancedShow: 'Show source',
    advancedHide: 'Hide source',
    valuePathLabel: 'Value path',
    valuePathPlaceholder: '例如 metadata.author',
    valuePathHint: 'Optional: read a value from the export context using dot notation.',
    valuePathExamplesTitle: 'Value path examples',
    valuePathExamples: 'metadata.author\npage.title\ncontext.timestamps',
    defaultGroup: '默认字段',
    filterAll: '全部',
    customGroup: '自定义字段'
  };

  return {
    field: dataset.labelField ?? fallback.field,
    type: dataset.labelType ?? fallback.type,
    article: dataset.labelArticle ?? fallback.article,
    clipper: dataset.labelClipper ?? fallback.clipper,
    video: dataset.labelVideo ?? fallback.video,
    ai: dataset.labelAi ?? fallback.ai,
    defaultValue: dataset.labelDefault ?? fallback.defaultValue,
    actions: dataset.labelActions ?? fallback.actions,
    deleteButton: dataset.labelDelete ?? fallback.deleteButton,
    namePlaceholder: dataset.placeholderName ?? fallback.namePlaceholder,
    valuePlaceholder: dataset.placeholderValue ?? fallback.valuePlaceholder,
    arrayPlaceholder:
      dataset.placeholderArray && dataset.placeholderArray.includes(';')
        ? dataset.placeholderArray
        : fallback.arrayPlaceholder,
    arrayHint:
      dataset.hintArray && dataset.hintArray.includes(';')
        ? dataset.hintArray
        : fallback.arrayHint,
    arrayPreviewEmpty: dataset.hintArrayPreviewEmpty ?? fallback.arrayPreviewEmpty,
    advancedShow: dataset.labelValuePathShow ?? fallback.advancedShow,
    advancedHide: dataset.labelValuePathHide ?? fallback.advancedHide,
    valuePathLabel: dataset.labelValuePath ?? fallback.valuePathLabel,
    valuePathPlaceholder: dataset.placeholderValuePath ?? fallback.valuePathPlaceholder,
    valuePathHint: dataset.hintValuePath ?? fallback.valuePathHint,
    valuePathExamplesTitle:
      dataset.labelValuePathExamplesTitle ?? fallback.valuePathExamplesTitle,
    valuePathExamples: dataset.hintValuePathExamples ?? fallback.valuePathExamples,
    typeLabels: {
      article: dataset.labelArticle ?? fallback.article,
      clipper: dataset.labelClipper ?? fallback.clipper,
      video: dataset.labelVideo ?? fallback.video,
      ai_chat: dataset.labelAi ?? fallback.ai
    },
    defaultGroup: dataset.labelDefaultGroup ?? fallback.defaultGroup,
    filterAll: dataset.labelFilterAll ?? fallback.filterAll,
    customGroup: dataset.labelCustomGroup ?? fallback.customGroup,
    errors: {
      nameRequired: dataset.errorNameRequired ?? fallback.errorNameRequired,
      namePattern: dataset.errorNamePattern ?? fallback.errorNamePattern,
      nameDuplicate: dataset.errorNameDuplicate ?? fallback.errorNameDuplicate,
      typeRequired: dataset.errorTypeRequired ?? fallback.errorTypeRequired,
      modeRequired: dataset.errorModeRequired ?? fallback.errorModeRequired,
      valueInvalid: dataset.errorValueInvalid ?? fallback.errorValueInvalid,
      valuePathInvalid: dataset.errorValuePathInvalid ?? fallback.errorValuePathInvalid
    },
    warnings: {
      unresolvedErrors: dataset.warningUnresolved ?? fallback.warningUnresolvedErrors
    }
  };
}

export function collectYamlDomainLabels(domainHost: HTMLElement | null): YamlConfigDomainLabels {
  const dataset = domainHost?.dataset ?? {};
  return {
    title: dataset.labelTitle ?? '域名覆盖',
    addRule: dataset.labelAddRule ?? '+ 添加域名规则',
    removeRule: dataset.labelRemoveRule ?? '删除规则',
    empty: dataset.labelEmpty ?? '暂无域名级规则。',
    hint: dataset.labelHint ?? '为特定域名设置 YAML 字段覆盖；这里的设置优先于全局字段配置。',
    placeholder: dataset.placeholderDomain ?? '例如 medium.com',
    contentType: dataset.labelContentType ?? '内容类型',
    addField: dataset.labelAddField ?? '+ 添加字段',
    fieldEmpty: dataset.labelFieldEmpty ?? '该规则还没有字段配置。',
    fieldEnabled: dataset.labelFieldEnabled ?? '启用',
    fieldRemove: dataset.labelFieldRemove ?? '删除字段',
    valuePlaceholder: dataset.placeholderValue ?? '字段值',
    arrayPlaceholder:
      dataset.placeholderArray && dataset.placeholderArray.includes(';')
        ? dataset.placeholderArray
        : ARRAY_INPUT_PLACEHOLDER,
    arrayHint: dataset.hintArray ?? ARRAY_INPUT_HINT,
    arrayPreviewEmpty: dataset.hintArrayPreviewEmpty ?? '数组值将以分号分隔保存',
    valuePathLabel: dataset.labelValuePath ?? '值路径',
    valuePathPlaceholder: dataset.placeholderValuePath ?? '例如 metadata.author',
    errors: {
      domainRequired: dataset.errorDomainRequired ?? '域名不能为空。',
      domainDuplicate: dataset.errorDomainDuplicate ?? '相同内容类型下域名重复。',
      fieldRequired: dataset.errorFieldRequired ?? '至少添加一个字段。',
      fieldDuplicate: dataset.errorFieldDuplicate ?? '字段重复，请删除重复项。',
      fieldUnsupported: dataset.errorFieldUnsupported ?? '当前内容类型不支持字段:',
      valueInvalid: dataset.errorValueInvalid ?? '默认值无效:',
      valuePathInvalid: dataset.errorValuePathInvalid ?? '值路径格式无效。'
    },
    warnings: {
      unresolvedErrors: dataset.warningUnresolved ?? '请先修复 YAML 配置中的错误。'
    }
  };
}
