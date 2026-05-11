import type {
  YamlConfigDomainLabels,
  YamlConfigTableLabels
} from '../../../ui/domains/yaml-config/yamlConfigTableTypes';
import type { YamlContentType } from '@shared/types/yamlConfig';

export const CONTENT_TYPE_LABELS: Record<YamlContentType, string> = {
  article: 'Article',
  clipper: 'Clipper',
  video: 'Video',
  ai_chat: 'AI Chat'
};

export const TABLE_LABELS: YamlConfigTableLabels = {
  field: 'Field',
  type: 'Type',
  article: CONTENT_TYPE_LABELS.article,
  clipper: CONTENT_TYPE_LABELS.clipper,
  video: CONTENT_TYPE_LABELS.video,
  ai: CONTENT_TYPE_LABELS.ai_chat,
  defaultValue: 'Default value',
  actions: 'Actions',
  deleteButton: 'Delete',
  namePlaceholder: 'field_name',
  valuePlaceholder: 'Default value',
  arrayPlaceholder: 'one; two; three',
  arrayHint: 'Use semicolon, comma, or line breaks to separate array values.',
  arrayPreviewEmpty: 'Array values are saved as a list.',
  advancedShow: 'Show source',
  advancedHide: 'Hide source',
  valuePathLabel: 'Value path',
  valuePathPlaceholder: 'title',
  valuePathHint: 'Read from export context using a path such as title or metadata.author.',
  valuePathExamplesTitle: 'Value path examples',
  valuePathExamples: 'title\nmetadata.author\ncontext.timestamps',
  typeLabels: CONTENT_TYPE_LABELS,
  defaultGroup: 'Default fields',
  filterAll: 'All',
  customGroup: 'Custom fields',
  errors: {
    nameRequired: 'Field name is required.',
    namePattern:
      'Field name must start with a letter or underscore and use letters, numbers, underscores, or hyphens.',
    nameDuplicate: 'Duplicate field name.',
    typeRequired: 'Field type is required.',
    modeRequired: 'Enable at least one content type.',
    valueInvalid: 'Default value does not match the field type.',
    valuePathInvalid: 'Value path format is invalid.'
  },
  warnings: {
    unresolvedErrors: 'Please fix YAML configuration errors before saving.'
  }
};

export const DOMAIN_LABELS: YamlConfigDomainLabels = {
  title: 'Domain overrides',
  hint: 'Domain overrides take precedence over shared YAML field settings.',
  addRule: '+ Add domain rule',
  removeRule: TABLE_LABELS.deleteButton,
  empty: 'No domain overrides configured.',
  placeholder: 'example.com',
  contentType: 'Content type',
  addField: '+ Add field',
  fieldEmpty: 'Add at least one field.',
  fieldEnabled: 'Enabled',
  fieldRemove: TABLE_LABELS.deleteButton,
  valuePlaceholder: TABLE_LABELS.valuePlaceholder,
  arrayPlaceholder: TABLE_LABELS.arrayPlaceholder,
  arrayHint: TABLE_LABELS.arrayHint,
  arrayPreviewEmpty: TABLE_LABELS.arrayPreviewEmpty,
  valuePathLabel: TABLE_LABELS.valuePathLabel,
  valuePathPlaceholder: TABLE_LABELS.valuePathPlaceholder,
  errors: {
    domainRequired: 'Domain is required.',
    domainDuplicate: 'Duplicate domain for this content type.',
    fieldRequired: 'Add at least one field.',
    fieldDuplicate: 'Duplicate field in this domain rule.',
    fieldUnsupported: 'Current content type does not support field:',
    valueInvalid: 'Default value does not match the field type:',
    valuePathInvalid: 'Value path format is invalid.'
  },
  warnings: TABLE_LABELS.warnings
};

export const YAML_WIDGET_HELPER_TEXT =
  'Disable a switch to hide a field. Custom fields apply to the selected export types. Domain overrides take precedence over the shared table.';
