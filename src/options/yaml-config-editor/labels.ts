import type { YamlContentType, YamlFieldType } from '@shared/types/yamlConfig';

export const YAML_EDITOR_CONTENT_TYPE_LABELS: Record<YamlContentType, string> = {
  article: 'Article',
  clipper: 'Clipper',
  video: 'Video',
  ai_chat: 'AI Chat'
};

export const YAML_EDITOR_FIELD_TYPES: YamlFieldType[] = [
  'text',
  'number',
  'boolean',
  'date',
  'array'
];

export const YAML_EDITOR_TABLE_LABELS = {
  field: 'Field',
  type: 'Type',
  article: YAML_EDITOR_CONTENT_TYPE_LABELS.article,
  clipper: YAML_EDITOR_CONTENT_TYPE_LABELS.clipper,
  video: YAML_EDITOR_CONTENT_TYPE_LABELS.video,
  ai: YAML_EDITOR_CONTENT_TYPE_LABELS.ai_chat,
  defaultValue: 'Default value',
  valuePath: 'Value path',
  actions: 'Actions',
  deleteButton: 'Delete',
  filterAll: 'All',
  addField: '+ Add field',
  addDomainRule: '+ Add domain rule',
  emptyDomainRules: 'No domain overrides configured.',
  domainPlaceholder: 'example.com',
  helper:
    'Disable a switch to hide a field. Custom fields apply to the selected export types. Domain overrides take precedence over the shared table.',
  invalidWarning: 'Please fix YAML configuration errors before saving.'
} as const;

export const YAML_EDITOR_ERROR_MESSAGES = {
  name_required: 'Field name is required.',
  name_invalid:
    'Field name must start with a letter or underscore and use letters, numbers, underscores, or hyphens.',
  name_duplicate: 'Duplicate field name.',
  default_invalid: 'Default value does not match the field type.',
  value_path_invalid: 'Value path format is invalid.',
  domain_required: 'Domain is required.',
  domain_duplicate: 'Duplicate domain for this content type.',
  domain_field_required: 'Add at least one field.',
  domain_field_duplicate: 'Duplicate field in this domain rule.',
  domain_field_unsupported: 'Current content type does not support this field.',
  INVALID_ARRAY: 'Array default value must include at least one item.',
  INVALID_BOOLEAN: 'Boolean default value must be true or false.',
  INVALID_NUMBER: 'Default value must be a valid number.'
} as const;
