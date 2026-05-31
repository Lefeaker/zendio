import { DEFAULT_YAML_CONFIG } from '@shared/config';
import { normalizeDomainKey } from '@shared/services/yamlConfigDomain';
import type {
  YamlConfigOverrides,
  YamlContentType,
  YamlFieldConfig,
  YamlFieldType
} from '@shared/types/yamlConfig';
import { stringifyDefaultValue } from './codecs';
import {
  YAML_EDITOR_CONTENT_TYPES,
  type YamlEditorContentTypeState,
  type YamlEditorDomainEntry,
  type YamlEditorDomainField,
  type YamlEditorField,
  type YamlEditorState
} from './types';

interface IdFactory {
  createId: (prefix: string) => string;
  current: () => number;
}

function createIdFactory(): IdFactory {
  let nextId = 0;
  return {
    createId(prefix: string): string {
      nextId += 1;
      return `${prefix}-${nextId}`;
    },
    current(): number {
      return nextId;
    }
  };
}

function createField(
  field: YamlFieldConfig,
  idFactory: IdFactory,
  options: { builtIn: boolean; isCustom: boolean }
): YamlEditorField {
  return {
    id: idFactory.createId(`yaml-${field.name || 'field'}`),
    name: field.name,
    type: field.type,
    enabled: field.enabled ?? true,
    required: Boolean(field.required),
    defaultValue: stringifyDefaultValue(field.type, field.defaultValue),
    valuePath: field.valuePath ?? '',
    builtIn: options.builtIn,
    isCustom: options.isCustom
  };
}

function createDomainField(field: YamlFieldConfig, idFactory: IdFactory): YamlEditorDomainField {
  return {
    id: idFactory.createId(`domain-field-${field.name || 'field'}`),
    name: field.name,
    type: field.type,
    enabled: field.enabled ?? true,
    defaultValue: stringifyDefaultValue(field.type, field.defaultValue),
    valuePath: field.valuePath ?? ''
  };
}

function mergeIntoField(target: YamlEditorField, field: YamlFieldConfig): void {
  target.name = field.name;
  target.type = field.type ?? target.type;
  target.enabled = field.enabled ?? target.enabled;
  target.required = Boolean(field.required ?? target.required);
  if (field.defaultValue !== undefined && field.defaultValue !== null) {
    target.defaultValue = stringifyDefaultValue(target.type, field.defaultValue);
  }
  target.valuePath = field.valuePath ?? target.valuePath;
}

function createFallbackCustomField(
  field: Partial<YamlFieldConfig>,
  idFactory: IdFactory
): YamlEditorField {
  const type: YamlFieldType = field.type ?? 'text';
  return createField(
    {
      name: field.name ?? 'custom_field',
      type,
      enabled: field.enabled ?? true,
      required: field.required,
      defaultValue: field.defaultValue,
      valuePath: field.valuePath,
      isCustom: true
    },
    idFactory,
    { builtIn: false, isCustom: true }
  );
}

function createDomainEntry(
  contentType: YamlContentType,
  domain: string,
  fields: YamlFieldConfig[],
  idFactory: IdFactory
): YamlEditorDomainEntry {
  return {
    id: idFactory.createId(`domain-${contentType}`),
    domain,
    contentType,
    fields: fields.map((field) => createDomainField(field, idFactory))
  };
}

function createContentTypeState(
  contentType: YamlContentType,
  overrides: YamlConfigOverrides | null | undefined,
  idFactory: IdFactory
): YamlEditorContentTypeState {
  const defaults = DEFAULT_YAML_CONFIG.contentTypes[contentType];
  const state: YamlEditorContentTypeState = {
    contentType,
    fields:
      defaults?.fields.map((field) =>
        createField(field, idFactory, { builtIn: true, isCustom: false })
      ) ?? [],
    customFields:
      defaults?.customFields?.map((field) =>
        createField(
          {
            ...field,
            isCustom: true
          },
          idFactory,
          { builtIn: false, isCustom: true }
        )
      ) ?? [],
    domainOverrides: []
  };

  const contentOverrides = overrides?.contentTypes?.[contentType];
  contentOverrides?.fields?.forEach((field) => {
    const existing = state.fields.find((candidate) => candidate.name === field.name);
    if (existing) {
      mergeIntoField(existing, field);
      return;
    }
    state.customFields.push(createFallbackCustomField(field, idFactory));
  });

  contentOverrides?.customFields?.forEach((field) => {
    const existing = state.customFields.find((candidate) => candidate.name === field.name);
    if (existing) {
      mergeIntoField(existing, { ...field, isCustom: true });
      existing.isCustom = true;
      return;
    }
    state.customFields.push(createFallbackCustomField({ ...field, isCustom: true }, idFactory));
  });

  Object.entries(contentOverrides?.domainOverrides ?? {}).forEach(([domain, fields]) => {
    state.domainOverrides.push(createDomainEntry(contentType, domain, fields ?? [], idFactory));
  });

  return state;
}

export function createYamlEditorState(
  overrides: YamlConfigOverrides | null | undefined
): YamlEditorState {
  const idFactory = createIdFactory();
  const contentTypes = Object.fromEntries(
    YAML_EDITOR_CONTENT_TYPES.map((contentType) => [
      contentType,
      createContentTypeState(contentType, overrides, idFactory)
    ])
  ) as Record<YamlContentType, YamlEditorContentTypeState>;
  const globalFields =
    overrides?.globalFields?.map((field) =>
      createField({ ...field, isCustom: true }, idFactory, {
        builtIn: false,
        isCustom: true
      })
    ) ?? [];

  return {
    contentTypes,
    globalFields,
    nextId: idFactory.current()
  };
}

export function getNormalizedDomain(domain: string): string {
  return normalizeDomainKey(domain);
}
