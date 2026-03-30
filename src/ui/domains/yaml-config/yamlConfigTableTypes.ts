import type { YamlContentType, YamlFieldType } from '@shared/types/yamlConfig';

export type TypeToggleMap = Record<YamlContentType, boolean>;

export interface FieldRow {
  id: string;
  name: string;
  type: YamlFieldType;
  defaultValue: string;
  enabled: TypeToggleMap;
  supported: TypeToggleMap;
  builtIn: boolean;
  isCustom: boolean;
  required: boolean;
  valuePath?: string;
  originTypes: Set<YamlContentType>;
}

export interface DomainFieldRow {
  id: string;
  name: string;
  type: YamlFieldType;
  enabled: boolean;
  defaultValue: string;
  valuePath?: string;
}

export interface DomainOverrideEntry {
  id: string;
  domain: string;
  contentType: YamlContentType;
  fields: DomainFieldRow[];
}

export interface YamlConfigTableLabels {
  field: string;
  type: string;
  article: string;
  clipper: string;
  video: string;
  ai: string;
  defaultValue: string;
  actions: string;
  deleteButton: string;
  namePlaceholder: string;
  valuePlaceholder: string;
  arrayPlaceholder: string;
  arrayHint: string;
  arrayPreviewEmpty: string;
  advancedShow: string;
  advancedHide: string;
  valuePathLabel: string;
  valuePathPlaceholder: string;
  valuePathHint: string;
  valuePathExamplesTitle: string;
  valuePathExamples: string;
  typeLabels: Record<YamlContentType, string>;
  defaultGroup: string;
  filterAll: string;
  customGroup: string;
  errors: {
    nameRequired: string;
    namePattern: string;
    nameDuplicate: string;
    typeRequired: string;
    modeRequired: string;
    valueInvalid: string;
    valuePathInvalid: string;
  };
  warnings: {
    unresolvedErrors: string;
  };
}

export interface YamlConfigDomainLabels {
  title: string;
  hint: string;
  addRule: string;
  removeRule: string;
  empty: string;
  placeholder: string;
  contentType: string;
  addField: string;
  fieldEmpty: string;
  fieldEnabled: string;
  fieldRemove: string;
  valuePlaceholder: string;
  arrayPlaceholder: string;
  arrayHint: string;
  arrayPreviewEmpty: string;
  valuePathLabel: string;
  valuePathPlaceholder: string;
  errors: {
    domainRequired: string;
    domainDuplicate: string;
    fieldRequired: string;
    fieldDuplicate: string;
    fieldUnsupported: string;
    valueInvalid: string;
    valuePathInvalid: string;
  };
  warnings: {
    unresolvedErrors: string;
  };
}

export const CONTENT_TYPES: YamlContentType[] = ['article', 'clipper', 'video', 'ai_chat'];
export const TYPE_OPTIONS: YamlFieldType[] = ['text', 'number', 'boolean', 'date', 'array'];
export const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
export const VALUE_PATH_PATTERN = /^\S+$/;
export const ARRAY_SPLIT_PATTERN = /[;\n,]+/;
export const ARRAY_INPUT_PLACEHOLDER = 'value1; value2; value3';
export const ARRAY_INPUT_HINT = 'Use ";" to separate items.';
