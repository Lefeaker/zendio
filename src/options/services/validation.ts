import { z } from 'zod';
import {
  StoredOptionsSchema,
  RestOptionsReadinessSchema,
  TemplateOptionsSchema
} from '../../shared/schemas/options.schema';
import { TaxonomyConfigSchema } from '../../shared/schemas/taxonomy.schema';
import type { ReadonlyDeep, TaxonomyConfig } from '../../shared/types/taxonomy';
import { DEFAULT_TAXONOMY_CONFIG, isTaxonomyConfig } from '../../shared/types/taxonomy';
import { parseBoundedJson } from '../../shared/config/losslessObjectBoundary';

export interface OptionsValidationIssue {
  readonly code: 'SCHEMA_INVALID';
  readonly path: '$' | '$.<redacted>';
}

export class OptionsValidationError extends Error {
  readonly code: string;
  readonly issues?: readonly OptionsValidationIssue[];
  readonly detail: string | undefined;

  constructor(code: string, zodError?: z.ZodError, detail?: string) {
    super(code);
    this.name = 'OptionsValidationError';
    this.code = code;
    if (zodError?.issues.length) {
      this.issues = Object.freeze([
        {
          code: 'SCHEMA_INVALID',
          path: zodError.issues.some((issue) => issue.path.length > 0) ? '$.<redacted>' : '$'
        }
      ]);
    }
    this.detail = detail ?? undefined;
  }
}

/**
 * Parse classifier taxonomy from JSON string
 */
export function parseClassifierTaxonomy(
  input: string
): z.infer<typeof TaxonomyConfigSchema> | Record<string, never> {
  const text = input || '';

  try {
    const parsed = parseBoundedJson(text);
    if (!parsed.ok) {
      if (parsed.code === 'INVALID_JSON' && !text.trim()) return {};
      throw new OptionsValidationError('INVALID_TAXONOMY');
    }
    return TaxonomyConfigSchema.parse(parsed.value);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new OptionsValidationError('INVALID_TAXONOMY', error);
    }
    if (error instanceof SyntaxError) {
      throw new OptionsValidationError('INVALID_TAXONOMY');
    }
    throw error;
  }
}

export type ClassifierTaxonomyEditorResult =
  | { readonly success: true; readonly taxonomy: ReadonlyDeep<TaxonomyConfig> }
  | { readonly success: false; readonly error: OptionsValidationError };

export function resolveClassifierTaxonomyEditorText(input: string): ClassifierTaxonomyEditorResult {
  try {
    const parsed = parseClassifierTaxonomy(input);
    return {
      success: true,
      taxonomy: isTaxonomyConfig(parsed) ? parsed : DEFAULT_TAXONOMY_CONFIG
    };
  } catch (error) {
    if (error instanceof OptionsValidationError) {
      return { success: false, error };
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
  return RestOptionsReadinessSchema.safeParse(data);
}

/**
 * Validate template options
 */
export function validateTemplateOptions(data: unknown) {
  return TemplateOptionsSchema.safeParse(data);
}
