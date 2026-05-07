import { z } from 'zod';
import {
  StoredOptionsSchema,
  RestOptionsSchema,
  TemplateOptionsSchema
} from '../../shared/schemas/options.schema';

const TaxonomyConditionSchema = z.object({
  type: z.string().min(1),
  operator: z.string().min(1),
  value: z.string()
});

const TaxonomyActionSchema = z.object({
  type: z.string().min(1),
  target: z.string().min(1),
  value: z.string()
});

const TaxonomyCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1)
});

const TaxonomyTagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1)
});

const TaxonomyRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  conditions: z.array(TaxonomyConditionSchema),
  actions: z.array(TaxonomyActionSchema)
});

const TaxonomyValidationSchema = z.object({
  version: z.string().min(1),
  categories: z.array(TaxonomyCategorySchema),
  tags: z.array(TaxonomyTagSchema),
  rules: z.array(TaxonomyRuleSchema)
});

export class OptionsValidationError extends Error {
  readonly code: string;
  readonly issues?: z.ZodIssue[];
  readonly detail: string | undefined;

  constructor(code: string, zodError?: z.ZodError, detail?: string) {
    super(code);
    this.name = 'OptionsValidationError';
    this.code = code;
    if (zodError) {
      this.issues = zodError.issues;
    }
    this.detail = detail ?? undefined;
  }
}

/**
 * Taxonomy Schema for classifier configuration
 */
/**
 * Parse classifier taxonomy from JSON string
 */
export function parseClassifierTaxonomy(
  input: string
): z.infer<typeof TaxonomyValidationSchema> | Record<string, never> {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    return TaxonomyValidationSchema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new OptionsValidationError('INVALID_TAXONOMY', error);
    }
    if (error instanceof SyntaxError) {
      const detail = error.message;
      throw new OptionsValidationError('INVALID_TAXONOMY', undefined, detail);
    }
    throw error;
  }
}

/**
 * Validate complete options object
 */
export function validateOptions(data: unknown) {
  return StoredOptionsSchema.safeParse(data);
}

/**
 * Validate REST connection options
 */
export function validateRestOptions(data: unknown) {
  return RestOptionsSchema.safeParse(data);
}

/**
 * Validate template options
 */
export function validateTemplateOptions(data: unknown) {
  return TemplateOptionsSchema.safeParse(data);
}
