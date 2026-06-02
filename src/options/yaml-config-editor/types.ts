import type { YamlContentType, YamlFieldConfig, YamlFieldType } from '@shared/types/yamlConfig';

export const YAML_EDITOR_CONTENT_TYPES: YamlContentType[] = [
  'article',
  'clipper',
  'video',
  'ai_chat'
];

export type YamlEditorFieldBucket = 'fields' | 'customFields';
export type YamlEditorFieldBaselineKind = 'defaultCustomField';

export interface YamlEditorField {
  id: string;
  name: string;
  type: YamlFieldType;
  enabled: boolean;
  required: boolean;
  defaultValue: string;
  valuePath: string;
  builtIn: boolean;
  isCustom: boolean;
  baselineKind?: YamlEditorFieldBaselineKind;
  baselineName?: string;
}

export interface YamlEditorDomainField {
  id: string;
  name: string;
  type: YamlFieldType;
  enabled: boolean;
  defaultValue: string;
  valuePath: string;
}

export interface YamlEditorDomainEntry {
  id: string;
  domain: string;
  contentType: YamlContentType;
  fields: YamlEditorDomainField[];
}

export interface YamlEditorContentTypeState {
  contentType: YamlContentType;
  fields: YamlEditorField[];
  customFields: YamlEditorField[];
  domainOverrides: YamlEditorDomainEntry[];
}

export interface YamlEditorState {
  contentTypes: Record<YamlContentType, YamlEditorContentTypeState>;
  globalFields: YamlEditorField[];
  nextId: number;
}

export type YamlEditorValidationCode =
  | 'name_required'
  | 'name_invalid'
  | 'name_duplicate'
  | 'default_invalid'
  | 'value_path_invalid'
  | 'domain_required'
  | 'domain_duplicate'
  | 'domain_field_required'
  | 'domain_field_duplicate'
  | 'domain_field_unsupported';

export interface YamlEditorValidationError {
  code: YamlEditorValidationCode;
  message: string;
  contentType?: YamlContentType;
  fieldId?: string;
  fieldName?: string;
  domainEntryId?: string;
  domainFieldId?: string;
}

export interface YamlEditorValidation {
  valid: boolean;
  errors: YamlEditorValidationError[];
  fieldErrors: Record<string, YamlEditorValidationError[]>;
  domainErrors: Record<string, YamlEditorValidationError[]>;
  globalErrors: YamlEditorValidationError[];
}

export type YamlEditorFieldPatch = Partial<
  Pick<YamlEditorField, 'name' | 'type' | 'enabled' | 'required' | 'defaultValue' | 'valuePath'>
>;

export type YamlEditorDomainFieldPatch = Partial<
  Pick<YamlEditorDomainField, 'name' | 'type' | 'enabled' | 'defaultValue' | 'valuePath'>
>;

export type YamlEditorAction =
  | {
      type: 'add-custom-field';
      contentType: YamlContentType;
      field?: Partial<Pick<YamlFieldConfig, 'name' | 'type' | 'enabled' | 'required'>>;
    }
  | {
      type: 'update-field';
      contentType: YamlContentType;
      bucket: YamlEditorFieldBucket;
      fieldId: string;
      patch: YamlEditorFieldPatch;
    }
  | {
      type: 'set-field-enabled';
      contentType: YamlContentType;
      bucket: YamlEditorFieldBucket;
      fieldId: string;
      enabled: boolean;
    }
  | {
      type: 'remove-field';
      contentType: YamlContentType;
      bucket: YamlEditorFieldBucket;
      fieldId: string;
    }
  | {
      type: 'add-global-field';
      field?: Partial<Pick<YamlFieldConfig, 'name' | 'type' | 'enabled' | 'required'>>;
    }
  | {
      type: 'update-global-field';
      fieldId: string;
      patch: YamlEditorFieldPatch;
    }
  | {
      type: 'remove-global-field';
      fieldId: string;
    }
  | {
      type: 'add-domain-override';
      contentType: YamlContentType;
      domain?: string;
      fields?: YamlFieldConfig[];
    }
  | {
      type: 'update-domain-override';
      domainEntryId: string;
      patch: Partial<Pick<YamlEditorDomainEntry, 'domain' | 'contentType'>>;
    }
  | {
      type: 'remove-domain-override';
      domainEntryId: string;
    }
  | {
      type: 'add-domain-field';
      domainEntryId: string;
      field?: Partial<YamlFieldConfig>;
    }
  | {
      type: 'update-domain-field';
      domainEntryId: string;
      fieldId: string;
      patch: YamlEditorDomainFieldPatch;
    }
  | {
      type: 'remove-domain-field';
      domainEntryId: string;
      fieldId: string;
    };
