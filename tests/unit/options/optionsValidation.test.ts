import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('options validation service', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns empty object for blank taxonomy input', async () => {
    const module = await import('../../../src/options/services/validation');
    expect(module.parseClassifierTaxonomy('   ')).toEqual({});
  });

  it('parses valid taxonomy json', async () => {
    const module = await import('../../../src/options/services/validation');
    const data = module.parseClassifierTaxonomy(JSON.stringify(VALID_TAXONOMY));
    expect(data).toEqual(VALID_TAXONOMY);
  });

  it('throws OptionsValidationError for invalid json', async () => {
    const module = await import('../../../src/options/services/validation');
    expect(() => module.parseClassifierTaxonomy('not json')).toThrow(module.OptionsValidationError);
  });
});
