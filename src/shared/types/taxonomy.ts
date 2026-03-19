/**
 * Taxonomy types for content classification.
 * 
 * These types define the structure for AI-powered content classification
 * including categories, tags, and classification rules.
 */

// Utility type for deep readonly
export type ReadonlyDeep<T> = {
  readonly [P in keyof T]: T[P] extends (infer U)[]
    ? ReadonlyArray<ReadonlyDeep<U>>
    : T[P] extends Record<string, unknown>
    ? ReadonlyDeep<T[P]>
    : T[P];
};

// Basic taxonomy structures
export interface TaxonomyCategory {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly parent?: string;
  readonly keywords?: readonly string[];
  readonly weight?: number;
}

export interface TaxonomyTag {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly category?: string;
  readonly color?: string;
  readonly aliases?: readonly string[];
}

export interface TaxonomyRule {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly conditions: ReadonlyDeep<TaxonomyCondition[]>;
  readonly actions: ReadonlyDeep<TaxonomyAction[]>;
  readonly priority?: number;
  readonly enabled?: boolean;
}

export interface TaxonomyCondition {
  readonly type: 'content' | 'url' | 'title' | 'domain' | 'metadata';
  readonly operator: 'contains' | 'matches' | 'startsWith' | 'endsWith' | 'equals' | 'regex';
  readonly value: string;
  readonly caseSensitive?: boolean;
}

export interface TaxonomyAction {
  readonly type: 'assignCategory' | 'assignTag' | 'setProperty' | 'transform';
  readonly target: string;
  readonly value: string;
  readonly metadata?: ReadonlyDeep<Record<string, unknown>>;
}

// Main taxonomy configuration
export interface TaxonomyConfig {
  readonly version: string;
  readonly name?: string;
  readonly description?: string;
  readonly categories: ReadonlyDeep<TaxonomyCategory[]>;
  readonly tags: ReadonlyDeep<TaxonomyTag[]>;
  readonly rules: ReadonlyDeep<TaxonomyRule[]>;
  readonly defaultCategory?: string;
  readonly defaultTags?: readonly string[];
  readonly settings?: ReadonlyDeep<TaxonomySettings>;
}

export interface TaxonomySettings {
  readonly autoClassification?: boolean;
  readonly confidenceThreshold?: number;
  readonly maxCategories?: number;
  readonly maxTags?: number;
  readonly fallbackBehavior?: 'none' | 'default' | 'prompt';
  readonly customPrompts?: ReadonlyDeep<Record<string, string>>;
}

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
  readonly type: 'missing_id' | 'duplicate_id' | 'invalid_reference' | 'circular_dependency' | 'invalid_format';
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

export function isTaxonomyCategory(value: unknown): value is TaxonomyCategory {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    'id' in obj &&
    'name' in obj &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string'
  );
}

export function isTaxonomyTag(value: unknown): value is TaxonomyTag {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    'id' in obj &&
    'name' in obj &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string'
  );
}

// Default configurations
export const DEFAULT_TAXONOMY_CONFIG: ReadonlyDeep<TaxonomyConfig> = {
  version: '1.0.0',
  name: 'Default Taxonomy',
  description: 'Default content classification taxonomy',
  categories: [
    {
      id: 'article',
      name: 'Article',
      description: 'News articles, blog posts, and editorial content',
      keywords: ['article', 'blog', 'news', 'post']
    },
    {
      id: 'research',
      name: 'Research',
      description: 'Academic papers, research documents, and studies',
      keywords: ['research', 'paper', 'study', 'academic']
    },
    {
      id: 'reference',
      name: 'Reference',
      description: 'Documentation, guides, and reference materials',
      keywords: ['docs', 'guide', 'manual', 'reference']
    },
    {
      id: 'discussion',
      name: 'Discussion',
      description: 'Forum posts, comments, and discussions',
      keywords: ['forum', 'discussion', 'comment', 'thread']
    }
  ],
  tags: [
    {
      id: 'important',
      name: 'Important',
      description: 'High priority content',
      color: '#ff4444'
    },
    {
      id: 'todo',
      name: 'To Do',
      description: 'Content requiring action',
      color: '#ffaa00'
    },
    {
      id: 'archived',
      name: 'Archived',
      description: 'Archived content',
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
} as const;
