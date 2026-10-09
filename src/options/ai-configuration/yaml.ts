import { z } from 'zod';
import { YamlFieldConfigSchema, YamlContentTypeSchema } from '@shared/schemas/yamlConfig.schema';
import type { YamlConfigOverrides, YamlFieldConfig } from '@shared/types/yamlConfig';
import { createYamlEditorState } from '../yaml-config-editor/state';
import { validateYamlEditorState } from '../yaml-config-editor/validation';
import { AiConfigInputError } from './types';

const fields = z.array(YamlFieldConfigSchema.strict()).max(100);
export const AiYamlSchema = z
  .object({
    contentTypes: z
      .record(
        YamlContentTypeSchema,
        z
          .object({
            fields: fields.optional(),
            customFields: fields.optional(),
            domainOverrides: z.record(fields).optional()
          })
          .strict()
      )
      .optional(),
    globalFields: fields.optional()
  })
  .strict();

function upsertFields(current: YamlFieldConfig[] = [], incoming: z.infer<typeof fields> = []) {
  if (new Set(incoming.map((field) => field.name)).size !== incoming.length)
    throw new AiConfigInputError('aiConfigInvalidField', 'yamlConfig');
  const merged = new Map(current.map((field) => [field.name, field]));
  for (const field of incoming) {
    const { required, description, isCustom, valuePath, ...values } = field;
    merged.set(field.name, {
      ...merged.get(field.name),
      ...values,
      ...(required === undefined ? {} : { required }),
      ...(description === undefined ? {} : { description }),
      ...(isCustom === undefined ? {} : { isCustom }),
      ...(valuePath === undefined ? {} : { valuePath })
    });
  }
  return [...merged.values()];
}

export function mergeAiYaml(
  current: YamlConfigOverrides | null | undefined,
  incoming: z.infer<typeof AiYamlSchema>
): YamlConfigOverrides {
  const next = structuredClone(current ?? {});
  if (incoming.globalFields)
    next.globalFields = upsertFields(next.globalFields, incoming.globalFields);
  if (incoming.contentTypes) {
    const contentTypes = { ...next.contentTypes };
    for (const type of YamlContentTypeSchema.options) {
      const input = incoming.contentTypes[type];
      if (!input) continue;
      const section = { ...contentTypes[type] };
      if (input.fields) section.fields = upsertFields(section.fields, input.fields);
      if (input.customFields)
        section.customFields = upsertFields(section.customFields, input.customFields);
      if (input.domainOverrides) {
        const domains = { ...section.domainOverrides };
        for (const [domain, domainFields] of Object.entries(input.domainOverrides))
          domains[domain] = upsertFields(domains[domain], domainFields);
        section.domainOverrides = domains;
      }
      contentTypes[type] = section;
    }
    next.contentTypes = contentTypes;
  }
  if (!validateYamlEditorState(createYamlEditorState(next)).valid)
    throw new AiConfigInputError('aiConfigInvalidField', 'yamlConfig');
  return next;
}
