import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolvePath } from '../../src/background/pathResolver';
import type { ClipPayload } from '../../src/shared/types';
import type { ClassificationResult } from '../../src/background/services/classificationService';
import type { TemplateOptions } from '../../src/shared/types/options';

const templates: TemplateOptions = {
  article: 'Articles/{domain}/{yyyy}/{slug}.md',
  fragment: 'Clippings/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
  reading: 'Reading/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
  clipper: 'Clippings/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
  ai: 'AI/{platform}/{yyyy}/{mm}/{dd}/{title}.md'
};

const CLASSIFICATION: ClassificationResult = { type: 'article', ai_platform: 'chatgpt', topics: [] };

const FIXED_DATE = new Date('2024-01-02T03:04:05Z');

function createPayload(overrides: Partial<ClipPayload> = {}): ClipPayload {
  return {
    markdown: '# note',
    title: 'My Test Note',
    type: 'article',
    meta: {
      url: 'https://example.com/posts/123',
      domain: 'example.com'
    },
    ...overrides
  };
}

describe('resolvePath', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates article path with mapped domain and slug', () => {
    const payload = createPayload();
    const result = resolvePath(templates, payload, CLASSIFICATION, { 'example.com': 'ExampleSite' });
    expect(result).toBe('Articles/ExampleSite/2024/my-test-note.md');
  });

  it('falls back to defaults when template missing and sanitises title', () => {
    const payload = createPayload({ title: 'Invalid:/\\Title', type: 'fragment' });
    const partialTemplates: TemplateOptions = { ...templates, fragment: '' };
    const result = resolvePath(partialTemplates, payload, CLASSIFICATION);
    expect(result).toContain('Clippings/example.com/2024/2024-01-02/invalid___title.md');
  });

  it('uses reading template when payload originates from reader mode', () => {
    const payload = createPayload({
      type: 'clipper',
      title: 'Reader Export',
      meta: {
        url: 'https://example.com/posts/reader',
        domain: 'example.com',
        readerMode: true
      }
    });
    const result = resolvePath(templates, payload, CLASSIFICATION);
    expect(result).toBe('Reading/example.com/2024/2024-01-02/reader-export.md');
  });

  it('uses AI template with platform from classification when payload lacks meta', () => {
    const payload = createPayload({ type: 'ai_chat', meta: { platform: undefined } });
    const result = resolvePath(templates, payload, { ...CLASSIFICATION, ai_platform: 'claude' });
    expect(result).toBe('AI/claude/2024/01/02/My Test Note.md');
  });
});
