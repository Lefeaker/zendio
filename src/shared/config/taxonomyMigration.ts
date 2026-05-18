/**
 * Taxonomy migration utilities.
 *
 * This module provides utilities to migrate from legacy taxonomy formats
 * to the new structured TaxonomyConfig format.
 */

import type {
  TaxonomyConfig,
  TaxonomyCategory,
  TaxonomyTag,
  ReadonlyDeep
} from '../types/taxonomy';
import { DEFAULT_TAXONOMY_CONFIG } from '../types/taxonomy';

// Legacy taxonomy format (for backward compatibility)
export interface LegacyTaxonomy {
  type?: string[];
  topics?: string[];
  ai_platform?: string[];
  [key: string]: unknown;
}

// Type guard for legacy taxonomy
export function isLegacyTaxonomy(value: unknown): value is LegacyTaxonomy {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    ('type' in obj && Array.isArray(obj.type)) ||
    ('topics' in obj && Array.isArray(obj.topics)) ||
    ('ai_platform' in obj && Array.isArray(obj.ai_platform))
  );
}

// Migration function from legacy to new format
export function migrateLegacyTaxonomy(legacy: LegacyTaxonomy): ReadonlyDeep<TaxonomyConfig> {
  const categories: TaxonomyCategory[] = [];
  const tags: TaxonomyTag[] = [];

  // Convert legacy 'type' array to categories
  if (legacy.type && Array.isArray(legacy.type)) {
    for (const type of legacy.type) {
      if (typeof type === 'string') {
        categories.push({
          id: type,
          name: type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' '),
          description: `Content type: ${type}`,
          keywords: [type]
        });
      }
    }
  }

  // Convert legacy 'topics' array to categories
  if (legacy.topics && Array.isArray(legacy.topics)) {
    for (const topic of legacy.topics) {
      if (typeof topic === 'string') {
        categories.push({
          id: `topic_${topic}`,
          name: topic.charAt(0).toUpperCase() + topic.slice(1),
          description: `Topic: ${topic}`,
          keywords: [topic],
          parent: 'topics'
        });
      }
    }

    // Add topics parent category
    categories.unshift({
      id: 'topics',
      name: 'Topics',
      description: 'Content topics and subjects'
    });
  }

  // Convert legacy 'ai_platform' array to tags
  if (legacy.ai_platform && Array.isArray(legacy.ai_platform)) {
    for (const platform of legacy.ai_platform) {
      if (typeof platform === 'string') {
        tags.push({
          id: `platform_${platform}`,
          name: platform.charAt(0).toUpperCase() + platform.slice(1),
          description: `AI Platform: ${platform}`,
          category: 'platform',
          aliases: [platform]
        });
      }
    }
  }

  const defaultCategory =
    categories.length > 0 ? categories[0].id : DEFAULT_TAXONOMY_CONFIG.defaultCategory;

  const result: TaxonomyConfig = {
    version: '1.0.0',
    name: 'Migrated Taxonomy',
    description: 'Taxonomy migrated from legacy format',
    categories: categories.length > 0 ? categories : DEFAULT_TAXONOMY_CONFIG.categories,
    tags: tags.length > 0 ? tags : DEFAULT_TAXONOMY_CONFIG.tags,
    rules: [],
    defaultTags: [],
    ...(DEFAULT_TAXONOMY_CONFIG.settings !== undefined && {
      settings: DEFAULT_TAXONOMY_CONFIG.settings
    }),
    ...(defaultCategory !== undefined && { defaultCategory })
  };

  return result;
}

// Smart taxonomy resolver that handles both legacy and new formats
export function resolveTaxonomy(value: unknown): ReadonlyDeep<TaxonomyConfig> {
  // If it's already a valid TaxonomyConfig, return it
  if (isTaxonomyConfig(value)) {
    return value as ReadonlyDeep<TaxonomyConfig>;
  }

  // If it's a legacy format, migrate it
  if (isLegacyTaxonomy(value)) {
    return migrateLegacyTaxonomy(value);
  }

  // If it's a string, try to parse it as JSON
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return resolveTaxonomy(parsed);
    } catch {
      // If parsing fails, return default
      return DEFAULT_TAXONOMY_CONFIG;
    }
  }

  // Fallback to default
  return DEFAULT_TAXONOMY_CONFIG;
}

// Type guard for TaxonomyConfig (imported from taxonomy.ts would be circular)
function isTaxonomyConfig(value: unknown): value is TaxonomyConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    'version' in obj &&
    'categories' in obj &&
    'tags' in obj &&
    'rules' in obj &&
    typeof obj.version === 'string' &&
    Array.isArray(obj.categories) &&
    Array.isArray(obj.tags) &&
    Array.isArray(obj.rules)
  );
}

// Create a backward-compatible default taxonomy
export const LEGACY_COMPATIBLE_TAXONOMY: ReadonlyDeep<TaxonomyConfig> = migrateLegacyTaxonomy({
  type: ['article', 'ai_chat'],
  topics: ['cs', 'math', 'product', 'research', 'howto', 'news', 'misc'],
  ai_platform: ['chatgpt', 'claude', 'gemini', 'copilot', 'perplexity', 'poe', 'other']
});

// Export for backward compatibility
export const DEFAULT_CLASSIFIER_TAXONOMY_MIGRATED = LEGACY_COMPATIBLE_TAXONOMY;
