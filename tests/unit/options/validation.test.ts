import { describe, it, expect } from 'vitest';
import {
  parseClassifierTaxonomy,
  resolveClassifierTaxonomyEditorText,
  OptionsValidationError,
  validateOptions,
  validateRestOptions,
  validateTemplateOptions
} from '@options/services/validation';
import {
  RestOptionsReadinessSchema,
  RestOptionsSchema,
  TaxonomyConfigSchema
} from '@shared/schemas';
import { getRestDefaults } from '../../utils/restDefaults';

const REST_DEFAULTS = getRestDefaults();
const DEFAULT_BASE_URL = REST_DEFAULTS.httpsUrl.replace(/\/$/, '');
const DEFAULT_HTTP_URL = REST_DEFAULTS.httpUrl.replace(/\/$/, '');

const VALID_TAXONOMY = {
  version: '1.0.0',
  categories: [
    {
      id: 'cat-tech',
      name: 'Tech'
    }
  ],
  tags: [
    {
      id: 'tag-ai',
      name: 'AI'
    }
  ],
  rules: [
    {
      id: 'rule-1',
      name: 'Match AI content',
      conditions: [
        {
          type: 'content',
          operator: 'contains',
          value: 'AI'
        }
      ],
      actions: [
        {
          type: 'assignTag',
          target: 'tags',
          value: 'tag-ai'
        }
      ]
    }
  ]
};

const FULL_TAXONOMY = {
  version: '2.0.0',
  name: 'Full taxonomy',
  description: 'All optional fields',
  descriptionKey: 'taxonomy.full.description',
  classificationHint: 'Classify precisely.',
  categories: [
    {
      id: 'tech',
      name: 'Technology',
      description: 'Technology content',
      descriptionKey: 'taxonomy.category.tech.description',
      classificationHint: 'Technical content',
      parent: 'knowledge',
      keywords: ['software', 'hardware'],
      weight: 2
    }
  ],
  tags: [
    {
      id: 'review',
      name: 'Review',
      description: 'Review needed',
      descriptionKey: 'taxonomy.tag.review.description',
      classificationHint: 'Needs review',
      category: 'workflow',
      color: '#123456',
      aliases: ['check', 'inspect']
    }
  ],
  rules: [
    {
      id: 'rule-1',
      name: 'Technical rule',
      description: 'Match technical metadata.',
      conditions: [
        {
          type: 'metadata',
          operator: 'equals',
          value: 'tech',
          caseSensitive: true
        }
      ],
      actions: [
        {
          type: 'setProperty',
          target: 'category',
          value: 'tech',
          metadata: { source: 'rule', score: 1, nested: { values: ['a', 'b'] } }
        }
      ],
      priority: 5,
      enabled: true
    }
  ],
  defaultCategory: 'tech',
  defaultTags: ['review'],
  settings: {
    autoClassification: true,
    confidenceThreshold: 0.75,
    maxCategories: 2,
    maxTags: 3,
    fallbackBehavior: 'prompt',
    customPrompts: { classify: 'Classify this content.' }
  }
};

describe('validation', () => {
  describe('parseClassifierTaxonomy', () => {
    it('returns empty object for empty string', () => {
      expect(parseClassifierTaxonomy('')).toEqual({});
      expect(parseClassifierTaxonomy('  ')).toEqual({});
    });

    it('parses valid JSON object', () => {
      const input = JSON.stringify(VALID_TAXONOMY);
      const result = parseClassifierTaxonomy(input);
      expect(result).toEqual(VALID_TAXONOMY);
    });

    it('preserves the full canonical taxonomy exactly', () => {
      const result = parseClassifierTaxonomy(JSON.stringify(FULL_TAXONOMY));

      expect(result).toEqual(FULL_TAXONOMY);
    });

    it('throws OptionsValidationError for empty JSON object', () => {
      const input = '{}';
      expect(() => parseClassifierTaxonomy(input)).toThrow(OptionsValidationError);
    });

    it('throws a stable redacted OptionsValidationError for invalid JSON syntax', () => {
      const input = '{invalid json}';
      expect(() => parseClassifierTaxonomy(input)).toThrow(OptionsValidationError);

      try {
        parseClassifierTaxonomy(input);
      } catch (error) {
        expect(error).toBeInstanceOf(OptionsValidationError);
        if (error instanceof OptionsValidationError) {
          expect(error.code).toBe('INVALID_TAXONOMY');
          expect(error.message).toBe('INVALID_TAXONOMY');
          expect(error.detail).toBeUndefined();
          expect(error.message).not.toContain('invalid json');
        }
      }
    });

    it('throws OptionsValidationError with issues for invalid taxonomy structure', () => {
      const input = '{"valid": "taxonomy"}';
      expect(() => parseClassifierTaxonomy(input)).toThrow(OptionsValidationError);
    });

    it('redacts arbitrary taxonomy map keys and user values from typed issues', () => {
      const privateKey = 'private-taxonomy-map-key';
      const privateValue = 'private-taxonomy-user-value';
      const input = JSON.stringify({
        ...FULL_TAXONOMY,
        settings: {
          ...FULL_TAXONOMY.settings,
          customPrompts: { [privateKey]: { invalid: privateValue } }
        }
      });

      try {
        parseClassifierTaxonomy(input);
        throw new Error('Expected taxonomy validation to fail');
      } catch (error) {
        expect(error).toBeInstanceOf(OptionsValidationError);
        if (error instanceof OptionsValidationError) {
          expect(error.issues).toEqual([{ code: 'SCHEMA_INVALID', path: '$.<redacted>' }]);
          expect(JSON.stringify(error)).not.toContain(privateKey);
          expect(JSON.stringify(error)).not.toContain(privateValue);
        }
      }
    });

    it('rejects over-budget editor JSON before native parsing without exposing input', () => {
      const privateValue = 'private-editor-value'.repeat(40_000);
      const input = JSON.stringify({ ...FULL_TAXONOMY, description: privateValue });

      expect(() => parseClassifierTaxonomy(input)).toThrow(OptionsValidationError);
      try {
        parseClassifierTaxonomy(input);
      } catch (error) {
        expect(JSON.stringify(error)).not.toContain(privateValue);
      }
    });

    it('counts leading whitespace against the editor input budget', () => {
      const padded = `${' '.repeat(600 * 1024)}${JSON.stringify(VALID_TAXONOMY)}`;

      expect(() => parseClassifierTaxonomy(padded)).toThrow(OptionsValidationError);
      expect(() => parseClassifierTaxonomy(' '.repeat(600 * 1024))).toThrow(OptionsValidationError);
    });

    it('uses the canonical strict schema for every nested taxonomy field', () => {
      const invalidTaxonomies = [
        { ...FULL_TAXONOMY, categories: [{ id: 'tech', name: 'Tech', keywords: [1] }] },
        { ...FULL_TAXONOMY, tags: [{ id: 'review', name: 'Review', aliases: [false] }] },
        { ...FULL_TAXONOMY, rules: [{ ...FULL_TAXONOMY.rules[0], enabled: 'yes' }] },
        { ...FULL_TAXONOMY, rules: [{ ...FULL_TAXONOMY.rules[0], priority: 'first' }] },
        {
          ...FULL_TAXONOMY,
          rules: [
            {
              ...FULL_TAXONOMY.rules[0],
              conditions: [{ type: 'body', operator: 'contains', value: 'tech' }]
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
        { ...FULL_TAXONOMY, settings: { fallbackBehavior: 'guess' } }
      ];

      for (const taxonomy of invalidTaxonomies) {
        expect(TaxonomyConfigSchema.safeParse(taxonomy).success).toBe(false);
        expect(() => parseClassifierTaxonomy(JSON.stringify(taxonomy))).toThrow(
          OptionsValidationError
        );
      }
    });

    it('keeps blank editor text compatible without treating literal object as persisted taxonomy', () => {
      expect(parseClassifierTaxonomy('   ')).toEqual({});
      expect(TaxonomyConfigSchema.safeParse({}).success).toBe(false);
      expect(() => parseClassifierTaxonomy('{}')).toThrow(OptionsValidationError);
    });

    it('returns a typed editor result without hiding canonical validation failures', () => {
      const blankResult = resolveClassifierTaxonomyEditorText('   ');
      const validResult = resolveClassifierTaxonomyEditorText(JSON.stringify(FULL_TAXONOMY));
      const invalidResult = resolveClassifierTaxonomyEditorText(
        JSON.stringify({ ...FULL_TAXONOMY, rules: [{ ...FULL_TAXONOMY.rules[0], enabled: 'yes' }] })
      );

      expect(blankResult.success).toBe(true);
      expect(validResult).toEqual({ success: true, taxonomy: FULL_TAXONOMY });
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.error).toBeInstanceOf(OptionsValidationError);
        expect(invalidResult.error.code).toBe('INVALID_TAXONOMY');
      }
    });
  });

  describe('validateOptions', () => {
    it('validates valid StoredOptions', () => {
      const options = {
        rest: {
          baseUrl: DEFAULT_BASE_URL,
          vault: 'MyVault',
          apiKey: '1234567890'
        },
        templates: {
          article: 'path/to/article',
          fragment: 'path/to/fragment'
        }
      };

      const result = validateOptions(options);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rest).toEqual(options.rest);
        expect(result.data.templates).toEqual(options.templates);
      }
    });

    it('round-trips the shipped empty REST API key through persisted options', () => {
      const options = {
        rest: {
          baseUrl: DEFAULT_BASE_URL,
          httpsUrl: DEFAULT_BASE_URL,
          httpUrl: DEFAULT_HTTP_URL,
          vault: 'MyVault',
          apiKey: ''
        }
      };

      const result = validateOptions(options);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rest).toEqual(options.rest);
      }
      expect(RestOptionsSchema.safeParse(options.rest).success).toBe(true);
      expect(RestOptionsSchema.safeParse({ ...options.rest, apiKey: 'short' }).success).toBe(false);
    });

    it('preserves explicitly disabled REST URLs for a local-folder-only vault', () => {
      const options = {
        rest: {
          baseUrl: DEFAULT_BASE_URL,
          vault: 'Local Vault',
          apiKey: '',
          httpsUrl: '',
          httpUrl: ''
        },
        vaultRouter: {
          defaultVaultId: 'local',
          vaults: [
            {
              id: 'local',
              name: 'Local Vault',
              vault: 'Local Vault',
              httpsUrl: '',
              httpUrl: '',
              apiKey: '',
              enabled: true,
              isDefault: true
            }
          ]
        }
      };
      const result = validateOptions(options);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.rest).toEqual(options.rest);
      expect(validateOptions({ rest: { httpsUrl: 'invalid-address' } }).success).toBe(false);
      expect(validateOptions({ rest: { httpUrl: 'invalid-address' } }).success).toBe(false);
    });

    it('round-trips a full classifier taxonomy without stripping optional data', () => {
      const options = {
        classifier: {
          enabled: true,
          provider: 'ollama',
          endpoint: 'http://localhost:11434/api/chat',
          apiKey: '',
          model: 'llama3.1',
          taxonomy: FULL_TAXONOMY
        }
      };

      const result = validateOptions(options);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.classifier?.taxonomy).toEqual(FULL_TAXONOMY);
      }
    });

    it('rejects literal empty and malformed persisted classifier taxonomies', () => {
      const emptyResult = validateOptions({ classifier: { taxonomy: {} } });
      const malformedResult = validateOptions({
        classifier: {
          taxonomy: { ...FULL_TAXONOMY, rules: [{ ...FULL_TAXONOMY.rules[0], enabled: 'yes' }] }
        }
      });

      expect(emptyResult.success).toBe(false);
      expect(malformedResult.success).toBe(false);
    });

    it('rejects extra root fields in StoredOptions', () => {
      const options = {
        rest: {
          baseUrl: DEFAULT_BASE_URL,
          vault: 'MyVault',
          apiKey: '1234567890'
        },
        customField: 'custom value'
      };

      const result = validateOptions(options);
      expect(result.success).toBe(false);
    });

    it('rejects unmigrated legacy REST fields in stored options', () => {
      const options = {
        rest: {
          baseUrl: DEFAULT_BASE_URL,
          vault: 'MyVault',
          apiKey: '1234567890',
          rootDir: 'Notes',
          localFolderId: 'folder-id',
          localFolderName: 'Local Folder'
        },
        aiChat: {
          includeTimestamps: true,
          userName: 'TestUser'
        }
      };

      const result = validateOptions(options);
      expect(result.success).toBe(false);
    });

    it('fails validation for invalid data', () => {
      const result = validateOptions('not an object');
      expect(result.success).toBe(false);
    });
  });

  describe('validateRestOptions', () => {
    it('validates valid REST options', () => {
      const options = {
        baseUrl: DEFAULT_BASE_URL,
        vault: 'MyVault',
        apiKey: '1234567890'
      };

      const result = validateRestOptions(options);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(options);
      }
    });

    it('rejects unmigrated legacy fields in REST readiness options', () => {
      const options = {
        baseUrl: DEFAULT_BASE_URL,
        httpsUrl: DEFAULT_BASE_URL,
        httpUrl: DEFAULT_HTTP_URL,
        vault: 'MyVault',
        apiKey: '1234567890',
        rootDir: 'Notes',
        localFolderId: 'folder-id',
        localFolderName: 'Local Folder'
      };

      const result = validateRestOptions(options);
      expect(result.success).toBe(false);
    });

    it('fails validation for invalid baseUrl', () => {
      const options = {
        baseUrl: 'not a valid url',
        vault: 'MyVault',
        apiKey: '1234567890'
      };

      const result = validateRestOptions(options);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('baseUrl');
        expect(result.error.issues[0]?.message).toBe('Must be a valid URL');
        expect(result.error.issues[0]?.message).not.toMatch(/[\u4e00-\u9fff]/u);
      }
    });

    it('fails validation for empty vault name', () => {
      const options = {
        baseUrl: DEFAULT_BASE_URL,
        vault: '',
        apiKey: '1234567890'
      };

      const result = validateRestOptions(options);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('vault');
        expect(result.error.issues[0]?.message).toBe('Vault name is required');
        expect(result.error.issues[0]?.message).not.toMatch(/[\u4e00-\u9fff]/u);
      }
    });

    it('fails validation for short API key', () => {
      const options = {
        baseUrl: DEFAULT_BASE_URL,
        vault: 'MyVault',
        apiKey: 'short'
      };

      const result = validateRestOptions(options);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('apiKey');
        expect(result.error.issues[0]?.message).toBe('API key must be at least 10 characters');
        expect(result.error.issues[0]?.message).not.toMatch(/[\u4e00-\u9fff]/u);
      }
    });

    it('keeps connection readiness stricter than persisted REST data', () => {
      const options = {
        baseUrl: DEFAULT_BASE_URL,
        vault: 'MyVault',
        apiKey: ''
      };

      expect(RestOptionsSchema.safeParse(options).success).toBe(true);
      expect(RestOptionsReadinessSchema.safeParse(options).success).toBe(false);

      const result = validateRestOptions(options);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toContain('apiKey');
        expect(result.error.issues[0]?.message).toBe('API key must be at least 10 characters');
      }
    });

    it('fails validation for missing required fields', () => {
      const options = {
        baseUrl: DEFAULT_BASE_URL
      };

      const result = validateRestOptions(options);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('validateTemplateOptions', () => {
    it('validates valid template options', () => {
      const options = {
        article: 'path/to/article',
        video: 'path/to/video',
        fragment: 'path/to/fragment',
        reading: 'path/to/reading',
        ai: 'path/to/ai'
      };

      const result = validateTemplateOptions(options);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(options);
      }
    });

    it('fails validation for missing required fields', () => {
      const options = {
        article: 'path/to/article',
        fragment: 'path/to/fragment'
      };

      const result = validateTemplateOptions(options);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });

    it('fails validation for invalid data type', () => {
      const options = {
        article: 123,
        video: 'path/to/video',
        fragment: 'path/to/fragment',
        reading: 'path/to/reading',
        ai: 'path/to/ai'
      };

      const result = validateTemplateOptions(options);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('article');
      }
    });
  });
});
