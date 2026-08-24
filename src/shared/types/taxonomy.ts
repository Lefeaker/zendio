/**
 * Taxonomy types for content classification.
 *
 * These types define the structure for AI-powered content classification
 * including categories, tags, and classification rules.
 */

import {
  TaxonomyActionSchema,
  TaxonomyCategorySchema,
  TaxonomyConditionSchema,
  TaxonomyConfigSchema,
  TaxonomyRuleSchema,
  TaxonomySettingsSchema,
  TaxonomyTagSchema
} from '../schemas/taxonomy.schema';
import type { z } from 'zod';

// Utility type for deep readonly
export type ReadonlyDeep<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? ReadonlyArray<ReadonlyDeep<U>>
    : T extends object
      ? { readonly [P in keyof T]: ReadonlyDeep<T[P]> }
      : T;

// Canonical configuration types are exact projections of the runtime schemas.
export type TaxonomyCategory = z.infer<typeof TaxonomyCategorySchema>;
export type TaxonomyTag = z.infer<typeof TaxonomyTagSchema>;
export type TaxonomyCondition = z.infer<typeof TaxonomyConditionSchema>;
export type TaxonomyAction = z.infer<typeof TaxonomyActionSchema>;
export type TaxonomyRule = z.infer<typeof TaxonomyRuleSchema>;
export type TaxonomySettings = z.infer<typeof TaxonomySettingsSchema>;
export type TaxonomyConfig = z.infer<typeof TaxonomyConfigSchema>;

// Classification results
export interface ClassificationResult {
  readonly categories: ReadonlyDeep<ClassificationCategory[]>;
  readonly tags: ReadonlyDeep<ClassificationTag[]>;
  readonly confidence: number;
  readonly metadata?: ReadonlyDeep<Record<string, unknown>>;
  readonly appliedRules?: readonly string[];
}

export interface ClassificationCategory {
  readonly id: string;
  readonly name: string;
  readonly confidence: number;
  readonly source: 'rule' | 'ai' | 'default';
}

export interface ClassificationTag {
  readonly id: string;
  readonly name: string;
  readonly confidence: number;
  readonly source: 'rule' | 'ai' | 'default';
}

// Validation and utility types
export interface TaxonomyValidationError {
  readonly type:
    | 'missing_id'
    | 'duplicate_id'
    | 'invalid_reference'
    | 'circular_dependency'
    | 'invalid_format';
  readonly path: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

export interface TaxonomyValidationResult {
  readonly valid: boolean;
  readonly errors: ReadonlyDeep<TaxonomyValidationError[]>;
  readonly warnings: ReadonlyDeep<TaxonomyValidationError[]>;
}

// Type guards
export function isTaxonomyConfig(value: unknown): value is TaxonomyConfig {
  return TaxonomyConfigSchema.safeParse(value).success;
}

export function isTaxonomyCategory(value: unknown): value is TaxonomyCategory {
  return TaxonomyCategorySchema.safeParse(value).success;
}

export function isTaxonomyTag(value: unknown): value is TaxonomyTag {
  return TaxonomyTagSchema.safeParse(value).success;
}

// Default configurations
export const DEFAULT_TAXONOMY_CONFIG: TaxonomyConfig = {
  version: '1.0.0',
  name: 'Default Taxonomy',
  descriptionKey: 'taxonomy.default.description',
  classificationHint: 'Default content classification taxonomy',
  categories: [
    {
      id: 'article',
      name: 'Article',
      descriptionKey: 'taxonomy.category.article.description',
      classificationHint: 'News articles, blog posts, and editorial content',
      keywords: ['article', 'blog', 'news', 'post']
    },
    {
      id: 'research',
      name: 'Research',
      descriptionKey: 'taxonomy.category.research.description',
      classificationHint: 'Academic papers, research documents, and studies',
      keywords: ['research', 'paper', 'study', 'academic']
    },
    {
      id: 'reference',
      name: 'Reference',
      descriptionKey: 'taxonomy.category.reference.description',
      classificationHint: 'Documentation, guides, and reference materials',
      keywords: ['docs', 'guide', 'manual', 'reference']
    },
    {
      id: 'discussion',
      name: 'Discussion',
      descriptionKey: 'taxonomy.category.discussion.description',
      classificationHint: 'Forum posts, comments, and discussions',
      keywords: ['forum', 'discussion', 'comment', 'thread']
    }
  ],
  tags: [
    {
      id: 'important',
      name: 'Important',
      descriptionKey: 'taxonomy.tag.important.description',
      classificationHint: 'High priority content',
      color: '#ff4444'
    },
    {
      id: 'todo',
      name: 'To Do',
      descriptionKey: 'taxonomy.tag.todo.description',
      classificationHint: 'Content requiring action',
      color: '#ffaa00'
    },
    {
      id: 'archived',
      name: 'Archived',
      descriptionKey: 'taxonomy.tag.archived.description',
      classificationHint: 'Archived content',
      color: '#888888'
    }
  ],
  rules: [],
  defaultCategory: 'article',
  defaultTags: [],
  settings: {
    autoClassification: true,
    confidenceThreshold: 0.7,
    maxCategories: 3,
    maxTags: 5,
    fallbackBehavior: 'default'
  }
};
