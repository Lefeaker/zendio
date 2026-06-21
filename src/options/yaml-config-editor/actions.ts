import type { YamlFieldConfig, YamlFieldType } from '@shared/types/yamlConfig';
import { stringifyDefaultValue } from './codecs';
import type {
  YamlEditorAction,
  YamlEditorDomainEntry,
  YamlEditorDomainField,
  YamlEditorField,
  YamlEditorFieldBucket,
  YamlEditorState
} from './types';

function cloneField(field: YamlEditorField): YamlEditorField {
  return { ...field };
}

function cloneDomainField(field: YamlEditorDomainField): YamlEditorDomainField {
  return { ...field };
}

function cloneDomainEntry(entry: YamlEditorDomainEntry): YamlEditorDomainEntry {
  return {
    ...entry,
    fields: entry.fields.map(cloneDomainField)
  };
}

function cloneState(state: YamlEditorState): YamlEditorState {
  return {
    contentTypes: {
      article: {
        ...state.contentTypes.article,
        fields: state.contentTypes.article.fields.map(cloneField),
        customFields: state.contentTypes.article.customFields.map(cloneField),
        domainOverrides: state.contentTypes.article.domainOverrides.map(cloneDomainEntry)
      },
      clipper: {
        ...state.contentTypes.clipper,
        fields: state.contentTypes.clipper.fields.map(cloneField),
        customFields: state.contentTypes.clipper.customFields.map(cloneField),
        domainOverrides: state.contentTypes.clipper.domainOverrides.map(cloneDomainEntry)
      },
      video: {
        ...state.contentTypes.video,
        fields: state.contentTypes.video.fields.map(cloneField),
        customFields: state.contentTypes.video.customFields.map(cloneField),
        domainOverrides: state.contentTypes.video.domainOverrides.map(cloneDomainEntry)
      },
      ai_chat: {
        ...state.contentTypes.ai_chat,
        fields: state.contentTypes.ai_chat.fields.map(cloneField),
        customFields: state.contentTypes.ai_chat.customFields.map(cloneField),
        domainOverrides: state.contentTypes.ai_chat.domainOverrides.map(cloneDomainEntry)
      }
    },
    globalFields: state.globalFields.map(cloneField),
    nextId: state.nextId
  };
}

function allocateId(state: YamlEditorState, prefix: string): string {
  state.nextId += 1;
  return `${prefix}-${state.nextId}`;
}

function createEditableField(
  state: YamlEditorState,
  field: Partial<YamlFieldConfig> | undefined,
  fallbackName: string
): YamlEditorField {
  const type: YamlFieldType = field?.type ?? 'text';
  return {
    id: allocateId(state, `yaml-${field?.name || fallbackName}`),
    name: field?.name ?? fallbackName,
    type,
    enabled: field?.enabled ?? true,
    required: Boolean(field?.required),
    defaultValue: stringifyDefaultValue(type, field?.defaultValue),
    valuePath: field?.valuePath ?? '',
    builtIn: false,
    isCustom: true
  };
}

function createDomainField(
  state: YamlEditorState,
  field: Partial<YamlFieldConfig> | undefined
): YamlEditorDomainField {
  const type: YamlFieldType = field?.type ?? 'text';
  return {
    id: allocateId(state, `domain-field-${field?.name || 'field'}`),
    name: field?.name ?? '',
    type,
    enabled: field?.enabled ?? true,
    defaultValue: stringifyDefaultValue(type, field?.defaultValue),
    valuePath: field?.valuePath ?? ''
  };
}

function findField(
  state: YamlEditorState,
  bucket: YamlEditorFieldBucket,
  contentType: keyof YamlEditorState['contentTypes'],
  fieldId: string
): YamlEditorField | undefined {
  return state.contentTypes[contentType][bucket].find((field) => field.id === fieldId);
}

function updateField(field: YamlEditorField | undefined, patch: Partial<YamlEditorField>): void {
  if (!field) {
    return;
  }
  const nextPatch = { ...patch };
  if (field.baselineKind === 'defaultCustomField') {
    delete nextPatch.name;
  }
  Object.assign(field, nextPatch);
}

function findDomainEntry(
  state: YamlEditorState,
  domainEntryId: string
): YamlEditorDomainEntry | undefined {
  return Object.values(state.contentTypes)
    .flatMap((contentState) => contentState.domainOverrides)
    .find((entry) => entry.id === domainEntryId);
}

export function applyYamlEditorAction(
  state: YamlEditorState,
  action: YamlEditorAction
): YamlEditorState {
  const next = cloneState(state);
  switch (action.type) {
    case 'add-custom-field': {
      next.contentTypes[action.contentType].customFields.push(
        createEditableField(next, action.field, '')
      );
      return next;
    }
    case 'update-field': {
      updateField(findField(next, action.bucket, action.contentType, action.fieldId), action.patch);
      return next;
    }
    case 'set-field-enabled': {
      updateField(findField(next, action.bucket, action.contentType, action.fieldId), {
        enabled: action.enabled
      });
      return next;
    }
    case 'remove-field': {
      const fields = next.contentTypes[action.contentType][action.bucket];
      const field = fields.find((candidate) => candidate.id === action.fieldId);
      if (field?.builtIn || field?.baselineKind === 'defaultCustomField') {
        return next;
      }
      next.contentTypes[action.contentType][action.bucket] = fields.filter(
        (field) => field.id !== action.fieldId
      );
      return next;
    }
    case 'add-global-field': {
      next.globalFields.push(createEditableField(next, action.field, 'global_field'));
      return next;
    }
    case 'update-global-field': {
      updateField(
        next.globalFields.find((field) => field.id === action.fieldId),
        action.patch
      );
      return next;
    }
    case 'remove-global-field': {
      next.globalFields = next.globalFields.filter((field) => field.id !== action.fieldId);
      return next;
    }
    case 'add-domain-override': {
      next.contentTypes[action.contentType].domainOverrides.push({
        id: allocateId(next, `domain-${action.contentType}`),
        domain: action.domain ?? '',
        contentType: action.contentType,
        fields: (action.fields ?? []).map((field) => createDomainField(next, field))
      });
      return next;
    }
    case 'update-domain-override': {
      const entry = findDomainEntry(next, action.domainEntryId);
      if (entry) {
        Object.assign(entry, action.patch);
      }
      return next;
    }
    case 'remove-domain-override': {
      Object.values(next.contentTypes).forEach((contentState) => {
        contentState.domainOverrides = contentState.domainOverrides.filter(
          (entry) => entry.id !== action.domainEntryId
        );
      });
      return next;
    }
    case 'add-domain-field': {
      const entry = findDomainEntry(next, action.domainEntryId);
      entry?.fields.push(createDomainField(next, action.field));
      return next;
    }
    case 'update-domain-field': {
      const entry = findDomainEntry(next, action.domainEntryId);
      const field = entry?.fields.find((candidate) => candidate.id === action.fieldId);
      if (field) {
        Object.assign(field, action.patch);
      }
      return next;
    }
    case 'remove-domain-field': {
      const entry = findDomainEntry(next, action.domainEntryId);
      if (entry) {
        entry.fields = entry.fields.filter((field) => field.id !== action.fieldId);
      }
      return next;
    }
    default:
      return next;
  }
}
