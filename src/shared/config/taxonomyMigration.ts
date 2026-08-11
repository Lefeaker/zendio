/**
 * Taxonomy migration utilities.
 *
 * This module provides utilities to migrate from legacy taxonomy formats
 * to the new structured TaxonomyConfig format.
 */

import { z } from 'zod';
import type {
  TaxonomyConfig,
  TaxonomyCategory,
  TaxonomyTag,
  ReadonlyDeep
} from '../types/taxonomy';
import { DEFAULT_TAXONOMY_CONFIG, isTaxonomyConfig } from '../types/taxonomy';
import { TaxonomyConfigSchema } from '../schemas/taxonomy.schema';
import { parseBoundedJson } from './losslessObjectBoundary';

// Legacy taxonomy format (for backward compatibility)
export interface LegacyTaxonomy {
  readonly type?: readonly string[];
  readonly topics?: readonly string[];
  readonly ai_platform?: readonly string[];
}

const LegacyTaxonomySchema = z
  .object({
    type: z.array(z.string().min(1)).optional(),
    topics: z.array(z.string().min(1)).optional(),
    ai_platform: z.array(z.string().min(1)).optional()
  })
  .strict()
  .refine(
    (value) =>
      (value.type?.length ?? 0) + (value.topics?.length ?? 0) + (value.ai_platform?.length ?? 0) > 0
  );

// Type guard for legacy taxonomy
export function isLegacyTaxonomy(value: unknown): value is LegacyTaxonomy {
  return LegacyTaxonomySchema.safeParse(value).success;
}

// Migration function from legacy to new format
export function migrateLegacyTaxonomy(legacy: LegacyTaxonomy): ReadonlyDeep<TaxonomyConfig> {
  const parsed = LegacyTaxonomySchema.parse(legacy);
  const categories: TaxonomyCategory[] = [];
  const tags: TaxonomyTag[] = [];

  // Convert legacy 'type' array to categories
  if (parsed.type) {
    for (const type of parsed.type) {
      categories.push({
        id: type,
        name: type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' '),
        descriptionKey: `taxonomy.legacy.type.${type}.description`,
        classificationHint: `Content type: ${type}`,
        keywords: [type]
      });
    }
  }

  // Convert legacy 'topics' array to categories
  if (parsed.topics) {
    for (const topic of parsed.topics) {
      categories.push({
        id: `topic_${topic}`,
        name: topic.charAt(0).toUpperCase() + topic.slice(1),
        descriptionKey: `taxonomy.legacy.topic.${topic}.description`,
        classificationHint: `Topic: ${topic}`,
        keywords: [topic],
        parent: 'topics'
      });
    }

    // Add topics parent category
    categories.unshift({
      id: 'topics',
      name: 'Topics',
      descriptionKey: 'taxonomy.legacy.topics.description',
      classificationHint: 'Content topics and subjects'
    });
  }

  // Convert legacy 'ai_platform' array to tags
  if (parsed.ai_platform) {
    for (const platform of parsed.ai_platform) {
      tags.push({
        id: `platform_${platform}`,
        name: platform.charAt(0).toUpperCase() + platform.slice(1),
        descriptionKey: `taxonomy.legacy.platform.${platform}.description`,
        classificationHint: `AI Platform: ${platform}`,
        category: 'platform',
        aliases: [platform]
      });
    }
  }

  const defaultCategory =
    categories.length > 0 ? categories[0].id : DEFAULT_TAXONOMY_CONFIG.defaultCategory;

  const result: TaxonomyConfig = {
    version: '1.0.0',
    name: 'Migrated Taxonomy',
    descriptionKey: 'taxonomy.legacy.migrated.description',
    classificationHint: 'Taxonomy migrated from legacy format',
    categories: categories.length > 0 ? categories : DEFAULT_TAXONOMY_CONFIG.categories,
    tags: tags.length > 0 ? tags : DEFAULT_TAXONOMY_CONFIG.tags,
    rules: [],
    defaultTags: [],
    ...(DEFAULT_TAXONOMY_CONFIG.settings !== undefined && {
      settings: DEFAULT_TAXONOMY_CONFIG.settings
    }),
    ...(defaultCategory !== undefined && { defaultCategory })
  };

  TaxonomyConfigSchema.parse(result);
  return result;
}

export type TaxonomyMigrationResult =
  | {
      readonly success: true;
      readonly value: TaxonomyConfig;
      readonly migrated: boolean;
    }
  | { readonly success: false };

/**
 * Converts canonical or legacy persisted values without hiding invalid input.
 * Callers retain the original value when this reports failure.
 */
export function migrateTaxonomyValue(value: unknown): TaxonomyMigrationResult {
  let candidate = value;
  let migrated = false;

  if (typeof value === 'string') {
    const parsed = parseBoundedJson(value);
    if (!parsed.ok) return { success: false };
    candidate = parsed.value;
    migrated = true;
  }

  if (isTaxonomyConfig(candidate)) {
    return { success: true, value: candidate, migrated };
  }

  const legacy = LegacyTaxonomySchema.safeParse(candidate);
  if (!legacy.success) {
    return { success: false };
  }

  const validLegacy: LegacyTaxonomy = {
    ...(legacy.data.type !== undefined && { type: legacy.data.type }),
    ...(legacy.data.topics !== undefined && { topics: legacy.data.topics }),
    ...(legacy.data.ai_platform !== undefined && { ai_platform: legacy.data.ai_platform })
  };
  return { success: true, value: migrateLegacyTaxonomy(validLegacy), migrated: true };
}

// Runtime projection keeps the historical default fallback separate from persistence migration.
export function resolveTaxonomy(value: unknown): ReadonlyDeep<TaxonomyConfig> {
  const result = migrateTaxonomyValue(value);
  return result.success ? result.value : DEFAULT_TAXONOMY_CONFIG;
}

// Create a backward-compatible default taxonomy
export const LEGACY_COMPATIBLE_TAXONOMY: ReadonlyDeep<TaxonomyConfig> = migrateLegacyTaxonomy({
  type: ['article', 'ai_chat'],
  topics: ['cs', 'math', 'product', 'research', 'howto', 'news', 'misc'],
  ai_platform: ['chatgpt', 'claude', 'gemini', 'copilot', 'perplexity', 'poe', 'other']
});

// Export for backward compatibility
export const DEFAULT_CLASSIFIER_TAXONOMY_MIGRATED = LEGACY_COMPATIBLE_TAXONOMY;
