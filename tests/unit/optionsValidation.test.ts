import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('options validation service', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns empty object for blank taxonomy input', async () => {
    const module = await import('../../src/options/services/validation');
    expect(module.parseClassifierTaxonomy('   ')).toEqual({});
  });

  it('parses valid taxonomy json', async () => {
    const module = await import('../../src/options/services/validation');
    const data = module.parseClassifierTaxonomy('{"topics":["tech"]}');
    expect(data).toEqual({ topics: ['tech'] });
  });

  it('throws OptionsValidationError for invalid json', async () => {
    const module = await import('../../src/options/services/validation');
    expect(() => module.parseClassifierTaxonomy('not json')).toThrow(module.OptionsValidationError);
  });
});
