import { describe, expect, it } from 'vitest';
import { DEFAULT_YAML_CONFIG } from '@shared/config';
import type { YamlConfigOverrides, YamlContentType, YamlFieldType } from '@shared/types/yamlConfig';
import {
  applyYamlEditorAction,
  buildYamlEditorPreview,
  createYamlEditorState,
  serializeYamlEditorState,
  validateYamlEditorState,
  type YamlEditorState
} from '@options/yaml-config-editor';
import { YamlConfigService } from '@shared/services/yamlConfigService';

const contentTypes: YamlContentType[] = ['article', 'clipper', 'video', 'ai_chat'];

function fieldNames(state: YamlEditorState, contentType: YamlContentType): string[] {
  return state.contentTypes[contentType].fields.map((field) => field.name);
}

function findFieldId(
  state: YamlEditorState,
  contentType: YamlContentType,
  name: string,
  bucket: 'fields' | 'customFields' = 'fields'
): string {
  const field = state.contentTypes[contentType][bucket].find(
    (candidate) => candidate.name === name
  );
  if (!field) {
    throw new Error(`Missing ${contentType} ${bucket} field ${name}`);
  }
  return field.id;
}

function findField(
  state: YamlEditorState,
  contentType: YamlContentType,
  name: string,
  bucket: 'fields' | 'customFields' = 'fields'
) {
  return state.contentTypes[contentType][bucket].find((candidate) => candidate.name === name);
}

function addCustomField(
  state: YamlEditorState,
  contentType: YamlContentType,
  name: string,
  type: YamlFieldType,
  defaultValue: string
): YamlEditorState {
  let next = applyYamlEditorAction(state, {
    type: 'add-custom-field',
    contentType,
    field: { name, type, enabled: false }
  });
  const id = findFieldId(next, contentType, name, 'customFields');
  next = applyYamlEditorAction(next, {
    type: 'update-field',
    contentType,
    bucket: 'customFields',
    fieldId: id,
    patch: {
      defaultValue,
      valuePath: `metadata.${name}`
    }
  });
  return applyYamlEditorAction(next, {
    type: 'set-field-enabled',
    contentType,
    bucket: 'customFields',
    fieldId: id,
    enabled: true
  });
}

describe('YAML editor core', () => {
  it('creates immutable editor state with default rows for every content type', () => {
    const overrides: YamlConfigOverrides = {
      contentTypes: {
        article: {
          fields: [{ name: 'title', type: 'text', enabled: false }]
        }
      }
    };
    const original = JSON.parse(JSON.stringify(overrides)) as YamlConfigOverrides;
    const state = createYamlEditorState(overrides);

    for (const contentType of contentTypes) {
      expect(fieldNames(state, contentType)).toEqual(
        DEFAULT_YAML_CONFIG.contentTypes[contentType]?.fields.map((field) => field.name)
      );
    }
    expect(overrides).toEqual(original);
    expect(state.contentTypes.article.fields.find((field) => field.name === 'title')).toEqual(
      expect.objectContaining({ enabled: false })
    );
    expect(findField(state, 'article', 'status', 'customFields')).toEqual(
      expect.objectContaining({
        baselineKind: 'defaultCustomField',
        baselineName: 'status'
      })
    );
  });

  it('serializes only fields that differ from the default baseline', () => {
    let state = createYamlEditorState(null);

    expect(validateYamlEditorState(state).valid).toBe(true);
    expect(serializeYamlEditorState(state)).toBeNull();

    state = applyYamlEditorAction(state, {
      type: 'set-field-enabled',
      contentType: 'article',
      bucket: 'fields',
      fieldId: findFieldId(state, 'article', 'author'),
      enabled: true
    });

    expect(serializeYamlEditorState(state)).toEqual({
      contentTypes: {
        article: {
          fields: [{ name: 'author', type: 'text', enabled: true }]
        }
      }
    });
  });

  it('serializes disabled default custom fields so runtime merge does not restore them', () => {
    const service = new YamlConfigService();
    let state = createYamlEditorState(null);
    const statusId = findFieldId(state, 'article', 'status', 'customFields');

    state = applyYamlEditorAction(state, {
      type: 'set-field-enabled',
      contentType: 'article',
      bucket: 'customFields',
      fieldId: statusId,
      enabled: false
    });

    const serialized = serializeYamlEditorState(state);

    expect(serialized?.contentTypes?.article?.customFields).toEqual([
      {
        name: 'status',
        type: 'array',
        enabled: false,
        defaultValue: ['unread'],
        isCustom: true
      }
    ]);
    expect(
      service.resolveConfig('article', serialized).fields.find((field) => field.name === 'status')
    ).toEqual(
      expect.objectContaining({
        name: 'status',
        enabled: false
      })
    );
  });

  it('serializes default custom field diffs by baseline identity if editable name state drifts', () => {
    const service = new YamlConfigService();
    const state = createYamlEditorState(null);
    const statusField = findField(state, 'article', 'status', 'customFields');
    if (!statusField) {
      throw new Error('Missing article status custom field');
    }

    statusField.name = 'state';
    statusField.enabled = false;

    const serialized = serializeYamlEditorState(state);
    const resolved = service.resolveConfig('article', serialized);

    expect(serialized?.contentTypes?.article?.customFields).toEqual([
      expect.objectContaining({
        name: 'status',
        enabled: false
      })
    ]);
    expect(resolved.fields.filter((field) => field.name === 'status')).toEqual([
      expect.objectContaining({ name: 'status', enabled: false })
    ]);
    expect(resolved.fields.some((field) => field.name === 'state')).toBe(false);
  });

  it('does not remove default custom fields through core actions', () => {
    const service = new YamlConfigService();
    const state = createYamlEditorState(null);
    const statusId = findFieldId(state, 'article', 'status', 'customFields');

    const next = applyYamlEditorAction(state, {
      type: 'remove-field',
      contentType: 'article',
      bucket: 'customFields',
      fieldId: statusId
    });

    expect(findField(next, 'article', 'status', 'customFields')).toEqual(
      expect.objectContaining({ name: 'status', enabled: true })
    );
    expect(serializeYamlEditorState(next)).toBeNull();
    expect(service.resolveConfig('article', serializeYamlEditorState(next)).fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'status', enabled: true })])
    );
  });

  it('does not rename default custom fields through core actions', () => {
    const service = new YamlConfigService();
    const state = createYamlEditorState(null);
    const statusId = findFieldId(state, 'article', 'status', 'customFields');

    const next = applyYamlEditorAction(state, {
      type: 'update-field',
      contentType: 'article',
      bucket: 'customFields',
      fieldId: statusId,
      patch: { name: 'state' }
    });
    const serialized = serializeYamlEditorState(next);
    const resolved = service.resolveConfig('article', serialized);

    expect(findField(next, 'article', 'status', 'customFields')).toEqual(
      expect.objectContaining({ name: 'status' })
    );
    expect(findField(next, 'article', 'state', 'customFields')).toBeUndefined();
    expect(serialized).toBeNull();
    expect(resolved.fields.filter((field) => field.name === 'status')).toHaveLength(1);
    expect(resolved.fields.some((field) => field.name === 'state')).toBe(false);
  });

  it('adds, edits, toggles, and collects custom fields for each content type', () => {
    for (const contentType of contentTypes) {
      const state = addCustomField(
        createYamlEditorState(null),
        contentType,
        `${contentType}_summary`,
        'text',
        `${contentType} default`
      );

      expect(serializeYamlEditorState(state)?.contentTypes?.[contentType]?.customFields).toEqual(
        expect.arrayContaining([
          {
            name: `${contentType}_summary`,
            type: 'text',
            enabled: true,
            defaultValue: `${contentType} default`,
            valuePath: `metadata.${contentType}_summary`,
            isCustom: true
          }
        ])
      );

      const customId = findFieldId(state, contentType, `${contentType}_summary`, 'customFields');
      const toggledOff = applyYamlEditorAction(state, {
        type: 'set-field-enabled',
        contentType,
        bucket: 'customFields',
        fieldId: customId,
        enabled: false
      });
      expect(
        serializeYamlEditorState(toggledOff)?.contentTypes?.[contentType]?.customFields?.some(
          (field) => field.name === `${contentType}_summary`
        )
      ).not.toBe(true);
    }
  });

  it('creates blank editable fields when adding fields without a seed value', () => {
    let state = applyYamlEditorAction(createYamlEditorState(null), {
      type: 'add-custom-field',
      contentType: 'article'
    });

    expect(state.contentTypes.article.customFields.at(-1)).toEqual(
      expect.objectContaining({
        name: '',
        type: 'text',
        defaultValue: '',
        valuePath: ''
      })
    );

    state = applyYamlEditorAction(state, {
      type: 'add-domain-override',
      contentType: 'article',
      domain: 'example.com'
    });
    const entry = state.contentTypes.article.domainOverrides.at(-1);
    if (!entry) {
      throw new Error('Missing domain override entry');
    }

    state = applyYamlEditorAction(state, {
      type: 'add-domain-field',
      domainEntryId: entry.id
    });

    expect(state.contentTypes.article.domainOverrides.at(-1)?.fields.at(-1)).toEqual(
      expect.objectContaining({
        name: '',
        type: 'text',
        defaultValue: '',
        valuePath: ''
      })
    );
  });

  it('preserves globalFields and serializes them only when present', () => {
    const state = createYamlEditorState({
      globalFields: [
        {
          name: 'source',
          type: 'text',
          enabled: true,
          defaultValue: 'web',
          valuePath: 'metadata.source'
        }
      ]
    });

    expect(serializeYamlEditorState(state)?.globalFields).toEqual([
      {
        name: 'source',
        type: 'text',
        enabled: true,
        defaultValue: 'web',
        valuePath: 'metadata.source',
        isCustom: true
      }
    ]);
    expect(serializeYamlEditorState(createYamlEditorState(null))?.globalFields).toBeUndefined();
  });

  it('normalizes exact and wildcard domain override keys and detects duplicates', () => {
    const state = createYamlEditorState({
      contentTypes: {
        article: {
          domainOverrides: {
            ' HTTPS://Docs.Example.COM/path ': [{ name: 'title', type: 'text', enabled: true }],
            ' *.Example.COM ': [
              { name: 'tags', type: 'array', enabled: true, defaultValue: ['docs', 'example'] }
            ]
          }
        }
      }
    });

    expect(serializeYamlEditorState(state)?.contentTypes?.article?.domainOverrides).toEqual({
      'docs.example.com': [{ name: 'title', type: 'text', enabled: true }],
      '*.example.com': [
        { name: 'tags', type: 'array', enabled: true, defaultValue: ['docs', 'example'] }
      ]
    });

    const duplicate = createYamlEditorState({
      contentTypes: {
        article: {
          domainOverrides: {
            'docs.example.com': [{ name: 'title', type: 'text', enabled: true }],
            'https://DOCS.example.com/path': [{ name: 'url', type: 'text', enabled: true }]
          }
        }
      }
    });
    const validation = validateYamlEditorState(duplicate);

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'domain_duplicate', contentType: 'article' })
      ])
    );
    expect(serializeYamlEditorState(duplicate)).toBeNull();
  });

  it('parses array, boolean, number, date, text, and empty default values', () => {
    let state = createYamlEditorState(null);
    state = addCustomField(state, 'article', 'array_field', 'array', 'one; two, three\nfour');
    state = addCustomField(state, 'article', 'flag_field', 'boolean', 'true');
    state = addCustomField(state, 'article', 'score_field', 'number', '42');
    state = addCustomField(state, 'article', 'date_field', 'date', '2026-05-31');
    state = addCustomField(state, 'article', 'text_field', 'text', 'hello');
    state = addCustomField(state, 'article', 'empty_field', 'text', '');

    expect(serializeYamlEditorState(state)?.contentTypes?.article?.customFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'array_field',
          defaultValue: ['one', 'two', 'three', 'four']
        }),
        expect.objectContaining({ name: 'flag_field', defaultValue: true }),
        expect.objectContaining({ name: 'score_field', defaultValue: 42 }),
        expect.objectContaining({ name: 'date_field', defaultValue: '2026-05-31' }),
        expect.objectContaining({ name: 'text_field', defaultValue: 'hello' })
      ])
    );
    const emptyField = serializeYamlEditorState(state)?.contentTypes?.article?.customFields?.find(
      (field) => field.name === 'empty_field'
    );
    expect(emptyField).toEqual(expect.objectContaining({ name: 'empty_field' }));
    expect(emptyField).not.toHaveProperty('defaultValue');
  });

  it('returns structured validation errors and blocks serialization for editable invalid state', () => {
    let state = createYamlEditorState(null);
    state = addCustomField(state, 'article', 'bad_number', 'number', 'not-a-number');
    state = applyYamlEditorAction(state, {
      type: 'update-field',
      contentType: 'article',
      bucket: 'customFields',
      fieldId: findFieldId(state, 'article', 'bad_number', 'customFields'),
      patch: { valuePath: 'metadata bad' }
    });

    const validation = validateYamlEditorState(state);

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'default_invalid', fieldName: 'bad_number' }),
        expect.objectContaining({ code: 'value_path_invalid', fieldName: 'bad_number' })
      ])
    );
    expect(() => validateYamlEditorState(state)).not.toThrow();
    expect(serializeYamlEditorState(state)).toBeNull();
  });

  it('builds preview YAML from the current editor state and selected content type', () => {
    let state = createYamlEditorState(null);
    state = applyYamlEditorAction(state, {
      type: 'set-field-enabled',
      contentType: 'video',
      bucket: 'fields',
      fieldId: findFieldId(state, 'video', 'url'),
      enabled: false
    });
    state = addCustomField(state, 'video', 'sponsor', 'text', 'OpenAI');

    const videoPreview = buildYamlEditorPreview(state, 'video');

    expect(videoPreview).toContain('# Video');
    expect(videoPreview).toContain('type: "video"');
    expect(videoPreview).toContain('platform: "YouTube"');
    expect(videoPreview).toContain('sponsor: "OpenAI"');
    expect(videoPreview).not.toContain('url:');

    const allPreview = buildYamlEditorPreview(state, 'all');

    expect(allPreview).toContain('# Article');
    expect(allPreview).toContain('# Clipper');
    expect(allPreview).toContain('# Video');
    expect(allPreview).toContain('# AI');
    expect(allPreview).toContain('message_count: 12');
  });
});
