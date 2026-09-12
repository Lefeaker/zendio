import { z } from 'zod';
import { isObjectRecord, type ObjectRecord, type RuntimePropertyValue } from '../guards/object';

export type ExactOptionalDeep<Value> = Value extends readonly (infer Item)[]
  ? ExactOptionalDeep<Item>[]
  : Value extends object
    ? {
        [Key in keyof Value as undefined extends Value[Key] ? never : Key]: ExactOptionalDeep<
          Value[Key]
        >;
      } & {
        [Key in keyof Value as undefined extends Value[Key] ? Key : never]?: ExactOptionalDeep<
          Exclude<Value[Key], undefined>
        >;
      }
    : Value;

function withoutUndefined(value: ObjectRecord): object {
  if (Array.isArray(value)) {
    return value.map((entry: RuntimePropertyValue) =>
      isObjectRecord(entry) ? withoutUndefined(entry) : entry
    );
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, isObjectRecord(entry) ? withoutUndefined(entry) : entry])
  );
}

export function schemaOutput<Output>(value: object): Output {
  if (!isObjectRecord(value)) {
    throw new TypeError('Schema output must be an object.');
  }
  return z.custom<Output>().parse(withoutUndefined(value));
}

export function exactOptionalSchema<Schema extends z.AnyZodObject>(schema: Schema) {
  return schema.transform((value) => schemaOutput<ExactOptionalDeep<z.infer<Schema>>>(value));
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema)
  ])
);

export const TaxonomyConditionSchema = exactOptionalSchema(
  z
    .object({
      type: z.enum(['content', 'url', 'title', 'domain', 'metadata']),
      operator: z.enum(['contains', 'matches', 'startsWith', 'endsWith', 'equals', 'regex']),
      value: z.string().min(1),
      caseSensitive: z.boolean().optional()
    })
    .strict()
);

export const TaxonomyActionSchema = exactOptionalSchema(
  z
    .object({
      type: z.enum(['assignCategory', 'assignTag', 'setProperty', 'transform']),
      target: z.string().min(1),
      value: z.string().min(1),
      metadata: z.record(z.string(), JsonValueSchema).optional()
    })
    .strict()
);

export const TaxonomyCategorySchema = exactOptionalSchema(
  z
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
    .strict()
);

export const TaxonomyTagSchema = exactOptionalSchema(
  z
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
    .strict()
);

export const TaxonomyRuleSchema = exactOptionalSchema(
  z
    .object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      conditions: z.array(TaxonomyConditionSchema),
      actions: z.array(TaxonomyActionSchema),
      priority: z.number().finite().optional(),
      enabled: z.boolean().optional()
    })
    .strict()
);

export const TaxonomySettingsSchema = exactOptionalSchema(
  z
    .object({
      autoClassification: z.boolean().optional(),
      confidenceThreshold: z.number().finite().optional(),
      maxCategories: z.number().finite().optional(),
      maxTags: z.number().finite().optional(),
      fallbackBehavior: z.enum(['none', 'default', 'prompt']).optional(),
      customPrompts: z.record(z.string(), z.string()).optional()
    })
    .strict()
);

export const TaxonomyConfigSchema = exactOptionalSchema(
  z
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
    .strict()
);
