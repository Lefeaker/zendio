import { z } from 'zod';

export const YamlFieldTypeSchema = z.enum(['text', 'number', 'boolean', 'date', 'array']);
export const YamlContentTypeSchema = z.enum(['ai_chat', 'article', 'clipper', 'video']);

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(JsonValueSchema),
  z.record(z.string(), JsonValueSchema)
]));

export const YamlFieldConfigSchema = z.object({
  name: z.string().min(1),
  type: YamlFieldTypeSchema,
  enabled: z.boolean(),
  defaultValue: JsonValueSchema.optional(),
  required: z.boolean().optional(),
  description: z.string().optional(),
  isCustom: z.boolean().optional(),
  valuePath: z.string().optional()
});

export const PartialContentTypeYamlConfigSchema = z.object({
  fields: z.array(YamlFieldConfigSchema).optional(),
  domainOverrides: z.record(z.string(), z.array(YamlFieldConfigSchema)).optional(),
  customFields: z.array(YamlFieldConfigSchema).optional()
});

export const YamlConfigOverridesSchema = z.object({
  contentTypes: z.record(z.string(), PartialContentTypeYamlConfigSchema).superRefine((value, ctx) => {
    for (const key of Object.keys(value)) {
      if (!YamlContentTypeSchema.safeParse(key).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unsupported YAML content type: ${key}`
        });
      }
    }
  }).optional(),
  globalFields: z.array(YamlFieldConfigSchema).optional()
});

export type YamlFieldConfig = z.infer<typeof YamlFieldConfigSchema>;
export type PartialContentTypeYamlConfig = z.infer<typeof PartialContentTypeYamlConfigSchema>;
export type YamlConfigOverrides = z.infer<typeof YamlConfigOverridesSchema>;
