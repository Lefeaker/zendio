import type { Messages } from '@i18n/messages';
import type { YamlContentType, YamlFieldType } from '@shared/types/yamlConfig';

export const YAML_EDITOR_FIELD_TYPES: YamlFieldType[] = [
  'text',
  'number',
  'boolean',
  'date',
  'array'
];

interface YamlEditorTableLabels {
  field: string;
  type: string;
  article: string;
  clipper: string;
  video: string;
  ai: string;
  defaultValue: string;
  valuePath: string;
  actions: string;
  deleteButton: string;
  filterAll: string;
  valuePathPlaceholder: string;
  addField: string;
  addDomainField: string;
  addDomainRule: string;
  emptyDomainRules: string;
  domainPlaceholder: string;
  domainRemoveRule: string;
  domainRemoveField: string;
  helper: string;
  invalidWarning: string;
  previewSummary: string;
}

export interface YamlEditorLabels {
  contentTypes: Record<YamlContentType, string>;
  filters: Record<YamlContentType | 'all', string>;
  table: YamlEditorTableLabels;
  errors: Record<string, string>;
}

type YamlEditorMessageKey =
  | 'yamlFieldArticleLabel'
  | 'yamlFieldClipperLabel'
  | 'yamlFieldVideoLabel'
  | 'yamlFieldAiLabel'
  | 'yamlFieldErrorValueInvalid'
  | 'yamlDomainErrorValueInvalid'
  | 'yamlFilterAllLabel'
  | 'schemaYamlFilterAllLabel'
  | 'yamlFieldSaveBlockedWarning'
  | 'yamlDomainWarningUnresolved'
  | 'schemaYamlFilterArticleLabel'
  | 'schemaYamlFilterClipperLabel'
  | 'schemaYamlFilterVideoLabel'
  | 'schemaYamlFilterAiChatLabel'
  | 'yamlFieldNameLabel'
  | 'yamlFieldTypeLabel'
  | 'yamlFieldDefaultValueLabel'
  | 'yamlFieldValuePathLabel'
  | 'yamlFieldActionsLabel'
  | 'yamlFieldDeleteButton'
  | 'yamlFieldValuePathPlaceholder'
  | 'yamlFieldAddButton'
  | 'yamlDomainAddField'
  | 'yamlDomainAddRule'
  | 'yamlDomainEmpty'
  | 'yamlDomainPlaceholder'
  | 'yamlDomainRemoveRule'
  | 'yamlDomainFieldRemove'
  | 'schemaOutputYamlPreviewSummaryLabel'
  | 'yamlFieldAvailabilityNote'
  | 'yamlFieldErrorNameRequired'
  | 'yamlFieldErrorNamePattern'
  | 'yamlFieldErrorNameDuplicate'
  | 'yamlFieldErrorValuePathInvalid'
  | 'yamlDomainErrorDomainRequired'
  | 'yamlDomainErrorDomainDuplicate'
  | 'yamlDomainErrorFieldRequired'
  | 'yamlDomainErrorFieldDuplicate'
  | 'yamlDomainErrorFieldUnsupported';

// Keep YAML editor fallback copy local so preview builds do not pull in the full locale service.
const YAML_EDITOR_FALLBACK_MESSAGES: Record<YamlEditorMessageKey, string> = {
  yamlFieldArticleLabel: 'Article',
  yamlFieldClipperLabel: 'Clipper',
  yamlFieldVideoLabel: 'Video',
  yamlFieldAiLabel: 'AI',
  yamlFieldErrorValueInvalid: 'Default value does not match the field type.',
  yamlDomainErrorValueInvalid: 'Default value does not match the field type:',
  yamlFilterAllLabel: 'All',
  schemaYamlFilterAllLabel: '',
  yamlFieldSaveBlockedWarning: 'Please fix YAML configuration errors before saving.',
  yamlDomainWarningUnresolved: 'Fix the highlighted errors before saving.',
  schemaYamlFilterArticleLabel: '',
  schemaYamlFilterClipperLabel: '',
  schemaYamlFilterVideoLabel: '',
  schemaYamlFilterAiChatLabel: '',
  yamlFieldNameLabel: 'Field',
  yamlFieldTypeLabel: 'Type',
  yamlFieldDefaultValueLabel: 'Value',
  yamlFieldValuePathLabel: 'Value path',
  yamlFieldActionsLabel: 'Actions',
  yamlFieldDeleteButton: 'Delete',
  yamlFieldValuePathPlaceholder: 'e.g. meta.author or extra.notes[0]',
  yamlFieldAddButton: '+ Add field',
  yamlDomainAddField: '+ Add field',
  yamlDomainAddRule: '+ Add domain rule',
  yamlDomainEmpty: 'No domain-specific rules yet.',
  yamlDomainPlaceholder: 'e.g., example.com or *.example.com',
  yamlDomainRemoveRule: 'Remove rule',
  yamlDomainFieldRemove: 'Remove',
  schemaOutputYamlPreviewSummaryLabel: 'Preview',
  yamlFieldAvailabilityNote:
    'Disable a switch to hide a field. Newly added fields apply to the selected export types.',
  yamlFieldErrorNameRequired: 'Field name is required.',
  yamlFieldErrorNamePattern:
    'Field name must start with a letter or underscore and use letters, numbers, underscores, or hyphens.',
  yamlFieldErrorNameDuplicate: 'Duplicate field name.',
  yamlFieldErrorValuePathInvalid: 'Value path cannot contain spaces.',
  yamlDomainErrorDomainRequired: 'Domain is required.',
  yamlDomainErrorDomainDuplicate: 'Duplicate domain found for this content type.',
  yamlDomainErrorFieldRequired: 'Add at least one field.',
  yamlDomainErrorFieldDuplicate: 'Duplicate field detected in the same rule.',
  yamlDomainErrorFieldUnsupported: 'Field is not available for this content type:'
};

function readMessage(messages: Messages | null | undefined, key: YamlEditorMessageKey): string {
  const value = messages?.[key];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  return YAML_EDITOR_FALLBACK_MESSAGES[key];
}

export function createYamlEditorLabels(messages?: Messages | null): YamlEditorLabels {
  const article = readMessage(messages, 'yamlFieldArticleLabel');
  const clipper = readMessage(messages, 'yamlFieldClipperLabel');
  const video = readMessage(messages, 'yamlFieldVideoLabel');
  const ai = readMessage(messages, 'yamlFieldAiLabel');
  const valueInvalid =
    readMessage(messages, 'yamlFieldErrorValueInvalid') ||
    readMessage(messages, 'yamlDomainErrorValueInvalid');
  const filterAll =
    readMessage(messages, 'yamlFilterAllLabel') ||
    readMessage(messages, 'schemaYamlFilterAllLabel');
  const invalidWarning =
    readMessage(messages, 'yamlFieldSaveBlockedWarning') ||
    readMessage(messages, 'yamlDomainWarningUnresolved');

  return {
    contentTypes: { article, clipper, video, ai_chat: ai },
    filters: {
      all: filterAll,
      article: readMessage(messages, 'schemaYamlFilterArticleLabel') || article,
      clipper: readMessage(messages, 'schemaYamlFilterClipperLabel') || clipper,
      video: readMessage(messages, 'schemaYamlFilterVideoLabel') || video,
      ai_chat: readMessage(messages, 'schemaYamlFilterAiChatLabel') || ai
    },
    table: {
      field: readMessage(messages, 'yamlFieldNameLabel'),
      type: readMessage(messages, 'yamlFieldTypeLabel'),
      article,
      clipper,
      video,
      ai,
      defaultValue: readMessage(messages, 'yamlFieldDefaultValueLabel'),
      valuePath: readMessage(messages, 'yamlFieldValuePathLabel'),
      actions: readMessage(messages, 'yamlFieldActionsLabel'),
      deleteButton: readMessage(messages, 'yamlFieldDeleteButton'),
      filterAll,
      valuePathPlaceholder: readMessage(messages, 'yamlFieldValuePathPlaceholder'),
      addField: readMessage(messages, 'yamlFieldAddButton'),
      addDomainField: readMessage(messages, 'yamlDomainAddField'),
      addDomainRule: readMessage(messages, 'yamlDomainAddRule'),
      emptyDomainRules: readMessage(messages, 'yamlDomainEmpty'),
      domainPlaceholder: readMessage(messages, 'yamlDomainPlaceholder'),
      domainRemoveRule: readMessage(messages, 'yamlDomainRemoveRule'),
      domainRemoveField: readMessage(messages, 'yamlDomainFieldRemove'),
      helper: readMessage(messages, 'yamlFieldAvailabilityNote'),
      invalidWarning,
      previewSummary: readMessage(messages, 'schemaOutputYamlPreviewSummaryLabel')
    },
    errors: {
      name_required: readMessage(messages, 'yamlFieldErrorNameRequired'),
      name_invalid: readMessage(messages, 'yamlFieldErrorNamePattern'),
      name_duplicate: readMessage(messages, 'yamlFieldErrorNameDuplicate'),
      default_invalid: valueInvalid,
      value_path_invalid: readMessage(messages, 'yamlFieldErrorValuePathInvalid'),
      domain_required: readMessage(messages, 'yamlDomainErrorDomainRequired'),
      domain_duplicate: readMessage(messages, 'yamlDomainErrorDomainDuplicate'),
      domain_field_required: readMessage(messages, 'yamlDomainErrorFieldRequired'),
      domain_field_duplicate: readMessage(messages, 'yamlDomainErrorFieldDuplicate'),
      domain_field_unsupported: readMessage(messages, 'yamlDomainErrorFieldUnsupported'),
      INVALID_ARRAY: valueInvalid,
      INVALID_BOOLEAN: valueInvalid,
      INVALID_NUMBER: valueInvalid
    }
  };
}

export const FALLBACK_YAML_EDITOR_LABELS = createYamlEditorLabels(null);
