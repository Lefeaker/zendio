import type { YamlContentType } from '@shared/types/yamlConfig';
import {
  parseDefaultValueWithValidation,
  YAML_EDITOR_NAME_PATTERN,
  YAML_EDITOR_VALUE_PATH_PATTERN
} from './codecs';
import { getNormalizedDomain } from './state';
import {
  YAML_EDITOR_CONTENT_TYPES,
  type YamlEditorDomainEntry,
  type YamlEditorField,
  type YamlEditorState,
  type YamlEditorValidation,
  type YamlEditorValidationCode,
  type YamlEditorValidationError
} from './types';

function createValidation(): YamlEditorValidation {
  return {
    valid: true,
    errors: [],
    fieldErrors: {},
    domainErrors: {},
    globalErrors: []
  };
}

function pushError(
  validation: YamlEditorValidation,
  error: YamlEditorValidationError,
  bucket?: { type: 'field' | 'domain' | 'global'; id?: string }
): void {
  validation.errors.push(error);
  validation.valid = false;
  if (bucket?.type === 'field' && bucket.id) {
    validation.fieldErrors[bucket.id] ??= [];
    validation.fieldErrors[bucket.id]?.push(error);
  }
  if (bucket?.type === 'domain' && bucket.id) {
    validation.domainErrors[bucket.id] ??= [];
    validation.domainErrors[bucket.id]?.push(error);
  }
  if (bucket?.type === 'global') {
    validation.globalErrors.push(error);
  }
}

function errorMessage(code: YamlEditorValidationCode): string {
  return code.replace(/_/g, ' ');
}

function validateField(
  validation: YamlEditorValidation,
  field: YamlEditorField,
  contentType: YamlContentType | undefined,
  seenNames: Map<string, string>
): void {
  const name = field.name.trim();
  const baseError = {
    contentType,
    fieldId: field.id,
    fieldName: name || field.name
  };
  if (!name) {
    pushError(
      validation,
      { ...baseError, code: 'name_required', message: errorMessage('name_required') },
      { type: 'field', id: field.id }
    );
  } else if (!YAML_EDITOR_NAME_PATTERN.test(name)) {
    pushError(
      validation,
      { ...baseError, code: 'name_invalid', message: errorMessage('name_invalid') },
      { type: 'field', id: field.id }
    );
  } else {
    const existing = seenNames.get(name);
    if (existing) {
      pushError(
        validation,
        { ...baseError, code: 'name_duplicate', message: errorMessage('name_duplicate') },
        { type: 'field', id: field.id }
      );
      pushError(
        validation,
        {
          ...baseError,
          fieldId: existing,
          code: 'name_duplicate',
          message: errorMessage('name_duplicate')
        },
        { type: 'field', id: existing }
      );
    } else {
      seenNames.set(name, field.id);
    }
  }

  if (field.defaultValue.trim()) {
    const parsed = parseDefaultValueWithValidation(field.type, field.defaultValue);
    if (parsed.error) {
      pushError(
        validation,
        { ...baseError, code: 'default_invalid', message: parsed.error },
        { type: 'field', id: field.id }
      );
    }
  }

  const valuePath = field.valuePath.trim();
  if (valuePath && !YAML_EDITOR_VALUE_PATH_PATTERN.test(valuePath)) {
    pushError(
      validation,
      {
        ...baseError,
        code: 'value_path_invalid',
        message: errorMessage('value_path_invalid')
      },
      { type: 'field', id: field.id }
    );
  }
}

function availableFieldNames(state: YamlEditorState, contentType: YamlContentType): Set<string> {
  const contentState = state.contentTypes[contentType];
  return new Set([
    ...contentState.fields.map((field) => field.name.trim()).filter(Boolean),
    ...contentState.customFields.map((field) => field.name.trim()).filter(Boolean),
    ...state.globalFields.map((field) => field.name.trim()).filter(Boolean)
  ]);
}

function validateDomainEntry(
  validation: YamlEditorValidation,
  entry: YamlEditorDomainEntry,
  state: YamlEditorState,
  seenDomains: Map<YamlContentType, Set<string>>
): void {
  const normalizedDomain = getNormalizedDomain(entry.domain);
  const baseError = {
    contentType: entry.contentType,
    domainEntryId: entry.id
  };
  if (!normalizedDomain) {
    pushError(
      validation,
      { ...baseError, code: 'domain_required', message: errorMessage('domain_required') },
      { type: 'domain', id: entry.id }
    );
  } else {
    const seen = seenDomains.get(entry.contentType) ?? new Set<string>();
    if (seen.has(normalizedDomain)) {
      pushError(
        validation,
        { ...baseError, code: 'domain_duplicate', message: errorMessage('domain_duplicate') },
        { type: 'domain', id: entry.id }
      );
    }
    seen.add(normalizedDomain);
    seenDomains.set(entry.contentType, seen);
  }

  if (!entry.fields.length) {
    pushError(
      validation,
      {
        ...baseError,
        code: 'domain_field_required',
        message: errorMessage('domain_field_required')
      },
      { type: 'domain', id: entry.id }
    );
  }

  const available = availableFieldNames(state, entry.contentType);
  const seenFields = new Set<string>();
  entry.fields.forEach((field) => {
    const name = field.name.trim();
    const fieldError = {
      ...baseError,
      domainFieldId: field.id,
      fieldName: name || field.name
    };
    if (!name) {
      pushError(
        validation,
        {
          ...fieldError,
          code: 'domain_field_required',
          message: errorMessage('domain_field_required')
        },
        { type: 'domain', id: entry.id }
      );
      return;
    }
    if (seenFields.has(name)) {
      pushError(
        validation,
        {
          ...fieldError,
          code: 'domain_field_duplicate',
          message: errorMessage('domain_field_duplicate')
        },
        { type: 'domain', id: entry.id }
      );
    }
    seenFields.add(name);
    if (!available.has(name)) {
      pushError(
        validation,
        {
          ...fieldError,
          code: 'domain_field_unsupported',
          message: errorMessage('domain_field_unsupported')
        },
        { type: 'domain', id: entry.id }
      );
    }
    if (field.defaultValue.trim()) {
      const parsed = parseDefaultValueWithValidation(field.type, field.defaultValue);
      if (parsed.error) {
        pushError(
          validation,
          { ...fieldError, code: 'default_invalid', message: parsed.error },
          { type: 'domain', id: entry.id }
        );
      }
    }
    const valuePath = field.valuePath.trim();
    if (valuePath && !YAML_EDITOR_VALUE_PATH_PATTERN.test(valuePath)) {
      pushError(
        validation,
        {
          ...fieldError,
          code: 'value_path_invalid',
          message: errorMessage('value_path_invalid')
        },
        { type: 'domain', id: entry.id }
      );
    }
  });
}

export function validateYamlEditorState(state: YamlEditorState): YamlEditorValidation {
  const validation = createValidation();
  YAML_EDITOR_CONTENT_TYPES.forEach((contentType) => {
    const seenNames = new Map<string, string>();
    state.contentTypes[contentType].fields.forEach((field) =>
      validateField(validation, field, contentType, seenNames)
    );
    state.contentTypes[contentType].customFields.forEach((field) =>
      validateField(validation, field, contentType, seenNames)
    );
  });

  const globalSeenNames = new Map<string, string>();
  state.globalFields.forEach((field) => {
    validateField(validation, field, undefined, globalSeenNames);
  });

  const seenDomains = new Map<YamlContentType, Set<string>>();
  YAML_EDITOR_CONTENT_TYPES.forEach((contentType) => {
    state.contentTypes[contentType].domainOverrides.forEach((entry) =>
      validateDomainEntry(validation, entry, state, seenDomains)
    );
  });

  return validation;
}
