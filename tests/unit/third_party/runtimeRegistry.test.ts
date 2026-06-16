import { describe, expect, it } from 'vitest';

import { resolveParserAsync } from '../../../src/third_party/ai-chat-exporter/runtimeRegistry';

describe('ai chat runtime parser registry', () => {
  it.each([
    ['chatgpt', 'chatgpt'],
    ['claude', 'claude'],
    ['copilot', 'copilot'],
    ['gemini', 'gemini'],
    ['tongyi', 'tongyi'],
    ['deepseek', 'deepseek'],
    ['kimi', 'kimi'],
    ['moonshot', 'kimi'],
    ['doubao', 'doubao'],
    ['monica', 'monica'],
    ['perplexity', 'perplexity'],
    ['pplx', 'perplexity']
  ])('resolves %s to the %s parser', async (platform, expectedId) => {
    await expect(resolveParserAsync(platform)).resolves.toMatchObject({ id: expectedId });
  });

  it('returns undefined for unsupported platforms', async () => {
    await expect(resolveParserAsync('unknown')).resolves.toBeUndefined();
  });
});
