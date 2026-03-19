import { z } from 'zod';
import { StoredOptionsSchema, RestOptionsSchema, TemplateOptionsSchema } from '../../shared/schemas';

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
const TaxonomyConfigSchema = z.record(z.string(), z.unknown()).or(z.object({}));

/**
 * Parse classifier taxonomy from JSON string
 */
export function parseClassifierTaxonomy(input: string): unknown {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    return TaxonomyConfigSchema.parse(parsed);
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
