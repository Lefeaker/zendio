/**
 * Type tests for taxonomy types and migration.
 *
 * These tests verify that taxonomy types work correctly and that
 * migration from legacy formats preserves data integrity.
 */

import { describe, it, expect } from 'vitest';
import {
  type TaxonomyConfig,
  type TaxonomyCategory,
  type TaxonomyTag,
  type ReadonlyDeep,
  isTaxonomyConfig,
  isTaxonomyCategory,
  isTaxonomyTag,
  DEFAULT_TAXONOMY_CONFIG
} from '@shared/types/taxonomy';
import {
  type LegacyTaxonomy,
  isLegacyTaxonomy,
  migrateLegacyTaxonomy,
  migrateTaxonomyValue,
  resolveTaxonomy,
  LEGACY_COMPATIBLE_TAXONOMY
} from '@shared/config/taxonomyMigration';
import {
  TaxonomyCategorySchema,
  TaxonomyConfigSchema,
  TaxonomyTagSchema
} from '@shared/schemas/taxonomy.schema';

const FULL_TAXONOMY: TaxonomyConfig = {
  version: '2.0.0',
  name: 'Full taxonomy',
  description: 'Every supported field is present.',
  descriptionKey: 'taxonomy.full.description',
  classificationHint: 'Use the full taxonomy.',
  categories: [
    {
      id: 'engineering',
      name: 'Engineering',
      description: 'Technical material',
      descriptionKey: 'taxonomy.category.engineering.description',
      classificationHint: 'Software and systems content',
      parent: 'knowledge',
      keywords: ['software', 'systems'],
      weight: 1.5
    }
  ],
  tags: [
    {
      id: 'review',
      name: 'Review',
      description: 'Needs review',
      descriptionKey: 'taxonomy.tag.review.description',
      classificationHint: 'Content requiring review',
      category: 'workflow',
      color: '#336699',
      aliases: ['check', 'inspect']
    }
  ],
  rules: [
    {
      id: 'rule-engineering',
      name: 'Engineering rule',
      description: 'Classify technical content.',
      conditions: [
        {
          type: 'metadata',
          operator: 'equals',
          value: 'engineering',
          caseSensitive: true
        }
      ],
      actions: [
        {
          type: 'setProperty',
          target: 'classification',
          value: 'engineering',
          metadata: {
            source: 'rule',
            score: 0.9,
            enabled: true,
            nullable: null,
            nested: { labels: ['engineering', 'review'] }
          }
        }
      ],
      priority: 10,
      enabled: true
    }
  ],
  defaultCategory: 'engineering',
  defaultTags: ['review'],
  settings: {
    autoClassification: true,
    confidenceThreshold: 0.8,
    maxCategories: 2,
    maxTags: 4,
    fallbackBehavior: 'prompt',
    customPrompts: {
      classify: 'Choose the best category.',
      summarize: 'Summarize the content.'
    }
  }
};

describe('Taxonomy Types', () => {
  describe('Type Guards', () => {
    it('should correctly identify valid taxonomy configs', () => {
      const validConfig: TaxonomyConfig = {
        version: '1.0.0',
        categories: [],
        tags: [],
        rules: []
      };

      expect(isTaxonomyConfig(validConfig)).toBe(true);
      expect(isTaxonomyConfig(null)).toBe(false);
      expect(isTaxonomyConfig(undefined)).toBe(false);
      expect(isTaxonomyConfig({})).toBe(false);
      expect(isTaxonomyConfig({ version: '1.0.0' })).toBe(false);
    });

    it('should correctly identify taxonomy categories', () => {
      const validCategory: TaxonomyCategory = {
        id: 'test',
        name: 'Test Category'
      };

      expect(isTaxonomyCategory(validCategory)).toBe(true);
      expect(isTaxonomyCategory(null)).toBe(false);
      expect(isTaxonomyCategory({ id: 'test' })).toBe(false);
      expect(isTaxonomyCategory({ name: 'test' })).toBe(false);
    });

    it('should correctly identify taxonomy tags', () => {
      const validTag: TaxonomyTag = {
        id: 'test',
        name: 'Test Tag'
      };

      expect(isTaxonomyTag(validTag)).toBe(true);
      expect(isTaxonomyTag(null)).toBe(false);
      expect(isTaxonomyTag({ id: 'test' })).toBe(false);
      expect(isTaxonomyTag({ name: 'test' })).toBe(false);
    });

    it('keeps public guards in exact parity with the canonical schemas', () => {
      const configCandidates = [
        FULL_TAXONOMY,
        {},
        {
          ...FULL_TAXONOMY,
          rules: [
            {
              ...FULL_TAXONOMY.rules[0],
              conditions: [{ type: 'body', operator: 'equals', value: 'engineering' }]
            }
          ]
        }
      ];
      const categoryCandidates = [
        FULL_TAXONOMY.categories[0],
        { id: 'invalid', name: 'Invalid', keywords: ['valid', 42] }
      ];
      const tagCandidates = [
        FULL_TAXONOMY.tags[0],
        { id: 'invalid', name: 'Invalid', aliases: ['valid', false] }
      ];

      for (const candidate of configCandidates) {
        expect(isTaxonomyConfig(candidate)).toBe(TaxonomyConfigSchema.safeParse(candidate).success);
      }
      for (const candidate of categoryCandidates) {
        expect(isTaxonomyCategory(candidate)).toBe(
          TaxonomyCategorySchema.safeParse(candidate).success
        );
      }
      for (const candidate of tagCandidates) {
        expect(isTaxonomyTag(candidate)).toBe(TaxonomyTagSchema.safeParse(candidate).success);
      }
    });

    it('rejects malformed nested taxonomy fields and unknown object keys', () => {
      const invalidConfigs = [
        { ...FULL_TAXONOMY, categories: [{ id: 'bad', name: 'Bad', keywords: ['ok', 1] }] },
        { ...FULL_TAXONOMY, tags: [{ id: 'bad', name: 'Bad', aliases: ['ok', 1] }] },
        { ...FULL_TAXONOMY, rules: [{ ...FULL_TAXONOMY.rules[0], enabled: 'yes' }] },
        { ...FULL_TAXONOMY, rules: [{ ...FULL_TAXONOMY.rules[0], priority: 'high' }] },
        {
          ...FULL_TAXONOMY,
          categories: [{ ...FULL_TAXONOMY.categories[0], weight: Number.POSITIVE_INFINITY }]
        },
        { ...FULL_TAXONOMY, rules: [{ ...FULL_TAXONOMY.rules[0], priority: Number.NaN }] },
        {
          ...FULL_TAXONOMY,
          rules: [
            {
              ...FULL_TAXONOMY.rules[0],
              actions: [
                {
                  ...FULL_TAXONOMY.rules[0].actions[0],
                  metadata: { score: Number.POSITIVE_INFINITY }
                }
              ]
            }
          ]
        },
        {
          ...FULL_TAXONOMY,
          settings: { ...FULL_TAXONOMY.settings, maxTags: Number.POSITIVE_INFINITY }
        },
        {
          ...FULL_TAXONOMY,
          rules: [
            {
              ...FULL_TAXONOMY.rules[0],
              conditions: [{ type: 'content', operator: 'includes', value: 'test' }]
            }
          ]
        },
        {
          ...FULL_TAXONOMY,
          rules: [
            {
              ...FULL_TAXONOMY.rules[0],
              actions: [{ type: 'appendTag', target: 'tags', value: 'review' }]
            }
          ]
        },
        { ...FULL_TAXONOMY, categories: [{ id: 'bad', name: 'Bad', unexpected: true }] }
      ];

      for (const candidate of invalidConfigs) {
        expect(TaxonomyConfigSchema.safeParse(candidate).success).toBe(false);
        expect(isTaxonomyConfig(candidate)).toBe(false);
      }
    });
  });

  describe('Default Configuration', () => {
    it('should have a valid default taxonomy config', () => {
      expect(isTaxonomyConfig(DEFAULT_TAXONOMY_CONFIG)).toBe(true);
      expect(DEFAULT_TAXONOMY_CONFIG.version).toBe('1.0.0');
      expect(DEFAULT_TAXONOMY_CONFIG.descriptionKey).toBe('taxonomy.default.description');
      expect(DEFAULT_TAXONOMY_CONFIG.classificationHint).toBe(
        'Default content classification taxonomy'
      );
      expect(DEFAULT_TAXONOMY_CONFIG.categories.length).toBeGreaterThan(0);
      expect(DEFAULT_TAXONOMY_CONFIG.tags.length).toBeGreaterThan(0);
    });

    it('preserves every optional field through an exact JSON round trip', () => {
      const parsed = TaxonomyConfigSchema.parse(JSON.parse(JSON.stringify(FULL_TAXONOMY)));

      expect(parsed).toEqual(FULL_TAXONOMY);
    });

    it('should have valid categories in default config', () => {
      for (const category of DEFAULT_TAXONOMY_CONFIG.categories) {
        expect(isTaxonomyCategory(category)).toBe(true);
        expect(category.id).toBeTruthy();
        expect(category.name).toBeTruthy();
        expect(category.description).toBeUndefined();
        expect(category.descriptionKey).toMatch(/^taxonomy\.category\.[a-z]+\.description$/);
        expect(category.classificationHint).toBeTruthy();
      }
    });

    it('should have valid tags in default config', () => {
      for (const tag of DEFAULT_TAXONOMY_CONFIG.tags) {
        expect(isTaxonomyTag(tag)).toBe(true);
        expect(tag.id).toBeTruthy();
        expect(tag.name).toBeTruthy();
        expect(tag.description).toBeUndefined();
        expect(tag.descriptionKey).toMatch(/^taxonomy\.tag\.[a-z]+\.description$/);
        expect(tag.classificationHint).toBeTruthy();
      }
    });
  });

  describe('ReadonlyDeep Type', () => {
    it('should make nested objects readonly', () => {
      interface TestConfig {
        name: string;
        nested: {
          value: number;
          array: string[];
        };
      }

      const config: ReadonlyDeep<TestConfig> = {
        name: 'test',
        nested: {
          value: 42,
          array: ['a', 'b', 'c']
        }
      };

      // These should be readonly at compile time
      expect(config.name).toBe('test');
      expect(config.nested.value).toBe(42);
      expect(config.nested.array[0]).toBe('a');
    });
  });
});

describe('Taxonomy Migration', () => {
  describe('Legacy Format Detection', () => {
    it('should correctly identify legacy taxonomy formats', () => {
      const legacyFormat: LegacyTaxonomy = {
        type: ['article', 'ai_chat'],
        topics: ['cs', 'math'],
        ai_platform: ['chatgpt', 'claude']
      };

      expect(isLegacyTaxonomy(legacyFormat)).toBe(true);
      expect(isLegacyTaxonomy({})).toBe(false);
      expect(isLegacyTaxonomy(null)).toBe(false);
      expect(isLegacyTaxonomy({ type: 'not-array' })).toBe(false);
    });

    it('should identify partial legacy formats', () => {
      expect(isLegacyTaxonomy({ type: ['article'] })).toBe(true);
      expect(isLegacyTaxonomy({ topics: ['cs'] })).toBe(true);
      expect(isLegacyTaxonomy({ ai_platform: ['chatgpt'] })).toBe(true);
    });
  });

  describe('Legacy Migration', () => {
    it('should migrate legacy type array to categories', () => {
      const legacy: LegacyTaxonomy = {
        type: ['article', 'ai_chat']
      };

      const migrated = migrateLegacyTaxonomy(legacy);

      expect(isTaxonomyConfig(migrated)).toBe(true);
      expect(migrated.categories.length).toBe(2);
      expect(migrated.categories[0].id).toBe('article');
      expect(migrated.categories[0].name).toBe('Article');
      expect(migrated.categories[0].description).toBeUndefined();
      expect(migrated.categories[0].descriptionKey).toBe(
        'taxonomy.legacy.type.article.description'
      );
      expect(migrated.categories[0].classificationHint).toBe('Content type: article');
      expect(migrated.categories[1].id).toBe('ai_chat');
      expect(migrated.categories[1].name).toBe('Ai chat');
    });

    it('should migrate legacy topics array to categories with parent', () => {
      const legacy: LegacyTaxonomy = {
        topics: ['cs', 'math', 'product']
      };

      const migrated = migrateLegacyTaxonomy(legacy);

      expect(migrated.categories.length).toBe(4); // 3 topics + 1 parent
      expect(migrated.categories[0].id).toBe('topics');
      expect(migrated.categories[0].name).toBe('Topics');
      expect(migrated.categories[0].descriptionKey).toBe('taxonomy.legacy.topics.description');
      expect(migrated.categories[0].classificationHint).toBe('Content topics and subjects');
      expect(migrated.categories[1].id).toBe('topic_cs');
      expect(migrated.categories[1].description).toBeUndefined();
      expect(migrated.categories[1].descriptionKey).toBe('taxonomy.legacy.topic.cs.description');
      expect(migrated.categories[1].classificationHint).toBe('Topic: cs');
      expect(migrated.categories[1].parent).toBe('topics');
    });

    it('should migrate legacy ai_platform array to tags', () => {
      const legacy: LegacyTaxonomy = {
        ai_platform: ['chatgpt', 'claude', 'gemini']
      };

      const migrated = migrateLegacyTaxonomy(legacy);

      expect(migrated.tags.length).toBe(3);
      expect(migrated.tags[0].id).toBe('platform_chatgpt');
      expect(migrated.tags[0].name).toBe('Chatgpt');
      expect(migrated.tags[0].description).toBeUndefined();
      expect(migrated.tags[0].descriptionKey).toBe('taxonomy.legacy.platform.chatgpt.description');
      expect(migrated.tags[0].classificationHint).toBe('AI Platform: chatgpt');
      expect(migrated.tags[0].category).toBe('platform');
    });

    it('should migrate complete legacy format', () => {
      const legacy: LegacyTaxonomy = {
        type: ['article', 'ai_chat'],
        topics: ['cs', 'math'],
        ai_platform: ['chatgpt', 'claude']
      };

      const migrated = migrateLegacyTaxonomy(legacy);

      expect(isTaxonomyConfig(migrated)).toBe(true);
      expect(migrated.categories.length).toBe(5); // 2 types + 2 topics + 1 topics parent
      expect(migrated.tags.length).toBe(2); // 2 platforms
      expect(migrated.version).toBe('1.0.0');
      expect(migrated.name).toBe('Migrated Taxonomy');
      expect(migrated.description).toBeUndefined();
      expect(migrated.descriptionKey).toBe('taxonomy.legacy.migrated.description');
      expect(migrated.classificationHint).toBe('Taxonomy migrated from legacy format');
    });

    it('should handle empty legacy format', () => {
      expect(isLegacyTaxonomy({})).toBe(false);
      expect(() => migrateLegacyTaxonomy({})).toThrow();
    });

    it('migrates valid legacy values deterministically', () => {
      const legacy: LegacyTaxonomy = {
        type: ['article'],
        topics: ['systems'],
        ai_platform: ['chatgpt']
      };

      expect(migrateLegacyTaxonomy(legacy)).toEqual(migrateLegacyTaxonomy(legacy));
    });
  });

  describe('Non-lossy Migration Result', () => {
    it('reports canonical values without migration', () => {
      const result = migrateTaxonomyValue(FULL_TAXONOMY);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.migrated).toBe(false);
        expect(result.value).toBe(FULL_TAXONOMY);
      }
    });

    it('reports valid legacy objects and JSON strings as migrated', () => {
      const legacy: LegacyTaxonomy = { type: ['article'], topics: ['systems'] };
      const objectResult = migrateTaxonomyValue(legacy);
      const stringResult = migrateTaxonomyValue(JSON.stringify(legacy));

      expect(objectResult).toEqual(stringResult);
      expect(objectResult.success).toBe(true);
      if (objectResult.success) {
        expect(objectResult.migrated).toBe(true);
        expect(isTaxonomyConfig(objectResult.value)).toBe(true);
      }
    });

    it('reports canonical JSON strings as migrated from their persisted representation', () => {
      const result = migrateTaxonomyValue(JSON.stringify(FULL_TAXONOMY));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.migrated).toBe(true);
        expect(result.value).toEqual(FULL_TAXONOMY);
      }
    });

    it('reports invalid objects and strings without replacing them with defaults', () => {
      const invalidValues = [
        {},
        { type: ['article', 42] },
        { type: ['article'], extra: 'would be lost' },
        '{not-json}',
        JSON.stringify({ ...FULL_TAXONOMY, rules: [{ enabled: 'yes' }] }),
        JSON.stringify({ type: ['private-value'.repeat(60_000)] })
      ];

      for (const value of invalidValues) {
        expect(migrateTaxonomyValue(value)).toEqual({ success: false });
      }
    });
  });

  describe('Smart Resolution', () => {
    it('should resolve valid taxonomy configs as-is', () => {
      const validConfig = DEFAULT_TAXONOMY_CONFIG;
      const resolved = resolveTaxonomy(validConfig);

      expect(resolved).toBe(validConfig);
    });

    it('should migrate legacy formats', () => {
      const legacy: LegacyTaxonomy = {
        type: ['article'],
        topics: ['cs']
      };

      const resolved = resolveTaxonomy(legacy);

      expect(isTaxonomyConfig(resolved)).toBe(true);
      expect(resolved.categories.length).toBeGreaterThan(0);
    });

    it('should parse JSON strings', () => {
      const legacy: LegacyTaxonomy = {
        type: ['article'],
        topics: ['cs']
      };
      const jsonString = JSON.stringify(legacy);

      const resolved = resolveTaxonomy(jsonString);

      expect(isTaxonomyConfig(resolved)).toBe(true);
      expect(resolved.categories.length).toBeGreaterThan(0);
    });

    it('should fallback to default for invalid inputs', () => {
      expect(resolveTaxonomy(null)).toBe(DEFAULT_TAXONOMY_CONFIG);
      expect(resolveTaxonomy(undefined)).toBe(DEFAULT_TAXONOMY_CONFIG);
      expect(resolveTaxonomy('invalid json')).toBe(DEFAULT_TAXONOMY_CONFIG);
      expect(resolveTaxonomy(42)).toBe(DEFAULT_TAXONOMY_CONFIG);
    });
  });

  describe('Legacy Compatible Taxonomy', () => {
    it('should be a valid taxonomy config', () => {
      expect(isTaxonomyConfig(LEGACY_COMPATIBLE_TAXONOMY)).toBe(true);
    });

    it('should contain migrated content from default legacy format', () => {
      expect(LEGACY_COMPATIBLE_TAXONOMY.categories.length).toBeGreaterThan(0);
      expect(LEGACY_COMPATIBLE_TAXONOMY.tags.length).toBeGreaterThan(0);

      // Should contain article and ai_chat categories
      const categoryIds = LEGACY_COMPATIBLE_TAXONOMY.categories.map((c) => c.id);
      expect(categoryIds).toContain('article');
      expect(categoryIds).toContain('ai_chat');

      // Should contain platform tags
      const tagIds = LEGACY_COMPATIBLE_TAXONOMY.tags.map((t) => t.id);
      expect(tagIds.some((id) => id.startsWith('platform_'))).toBe(true);
    });
  });

  describe('Type Safety', () => {
    it('should maintain readonly constraints', () => {
      const config: ReadonlyDeep<TaxonomyConfig> = DEFAULT_TAXONOMY_CONFIG;

      // These should be readonly at compile time
      expect(config.version).toBeTruthy();
      expect(config.categories.length).toBeGreaterThan(0);
      expect(config.tags.length).toBeGreaterThan(0);

      // Array elements should also be readonly
      const firstCategory = config.categories[0];
      expect(firstCategory.id).toBeTruthy();
      expect(firstCategory.name).toBeTruthy();
    });

    it('should work with type narrowing', () => {
      const unknownValue: unknown = {
        version: '1.0.0',
        categories: [],
        tags: [],
        rules: []
      };

      if (isTaxonomyConfig(unknownValue)) {
        // TypeScript should know this is TaxonomyConfig
        expect(typeof unknownValue.version).toBe('string');
        expect(Array.isArray(unknownValue.categories)).toBe(true);
        expect(Array.isArray(unknownValue.tags)).toBe(true);
        expect(Array.isArray(unknownValue.rules)).toBe(true);
      }
    });
  });
});
