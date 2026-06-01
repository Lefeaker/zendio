import { DEFAULT_RUNTIME_MESSAGES, type Messages } from '@i18n/locales';
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
}

export interface YamlEditorLabels {
  contentTypes: Record<YamlContentType, string>;
  filters: Record<YamlContentType | 'all', string>;
  table: YamlEditorTableLabels;
  errors: Record<string, string>;
}

function readMessage<K extends keyof Messages>(
  messages: Messages | null | undefined,
  key: K
): string {
  const value = messages?.[key];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  const fallback = DEFAULT_RUNTIME_MESSAGES[key];
  return typeof fallback === 'string' ? fallback : '';
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
      invalidWarning
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
