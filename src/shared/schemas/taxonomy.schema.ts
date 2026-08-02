import { z } from 'zod';

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema)
  ])
);

export const TaxonomyConditionSchema = z
  .object({
    type: z.enum(['content', 'url', 'title', 'domain', 'metadata']),
    operator: z.enum(['contains', 'matches', 'startsWith', 'endsWith', 'equals', 'regex']),
    value: z.string().min(1),
    caseSensitive: z.boolean().optional()
  })
  .strict();

export const TaxonomyActionSchema = z
  .object({
    type: z.enum(['assignCategory', 'assignTag', 'setProperty', 'transform']),
    target: z.string().min(1),
    value: z.string().min(1),
    metadata: z.record(z.string(), JsonValueSchema).optional()
  })
  .strict();

export const TaxonomyCategorySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    descriptionKey: z.string().optional(),
    classificationHint: z.string().optional(),
    parent: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    weight: z.number().finite().optional()
  })
  .strict();

export const TaxonomyTagSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    descriptionKey: z.string().optional(),
    classificationHint: z.string().optional(),
    category: z.string().optional(),
    color: z.string().optional(),
    aliases: z.array(z.string()).optional()
  })
  .strict();

export const TaxonomyRuleSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    conditions: z.array(TaxonomyConditionSchema),
    actions: z.array(TaxonomyActionSchema),
    priority: z.number().finite().optional(),
    enabled: z.boolean().optional()
  })
  .strict();

export const TaxonomySettingsSchema = z
  .object({
    autoClassification: z.boolean().optional(),
    confidenceThreshold: z.number().finite().optional(),
    maxCategories: z.number().finite().optional(),
    maxTags: z.number().finite().optional(),
    fallbackBehavior: z.enum(['none', 'default', 'prompt']).optional(),
    customPrompts: z.record(z.string(), z.string()).optional()
  })
  .strict();

export const TaxonomyConfigSchema = z
  .object({
    version: z.string().min(1),
    name: z.string().optional(),
    description: z.string().optional(),
    descriptionKey: z.string().optional(),
    classificationHint: z.string().optional(),
    categories: z.array(TaxonomyCategorySchema),
    tags: z.array(TaxonomyTagSchema),
    rules: z.array(TaxonomyRuleSchema),
    defaultCategory: z.string().optional(),
    defaultTags: z.array(z.string()).optional(),
    settings: TaxonomySettingsSchema.optional()
  })
  .strict();

export type TaxonomyConfigShape = z.infer<typeof TaxonomyConfigSchema>;
