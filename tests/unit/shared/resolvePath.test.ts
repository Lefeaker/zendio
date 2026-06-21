import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolvePath } from '../../../src/background/pathResolver';
import type { ClipPayload } from '@shared/types';
import type { ClassificationResult } from '../../../src/background/services/classificationService';
import type { TemplateOptions } from '@shared/types/options';

const templates: TemplateOptions = {
  article: 'Articles/{domain}/{yyyy}/{slug}.md',
  video: 'Video/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
  fragment: 'Clippings/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
  reading: 'Reading/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
  ai: 'AI/{platform}/{yyyy}/{mm}/{dd}/{title}.md'
};

const CLASSIFICATION: ClassificationResult = {
  type: 'article',
  ai_platform: 'chatgpt',
  topics: [],
  tags: [],
  status: 'success'
};

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
    const result = resolvePath(templates, payload, CLASSIFICATION, {
      'example.com': 'ExampleSite'
    });
    expect(result).toBe('Articles/ExampleSite/2024/my-test-note.md');
  });

  it('falls back to defaults when template missing and sanitises title', () => {
    const payload = createPayload({ title: 'Invalid:/\\Title', type: 'fragment' });
    const partialTemplates: TemplateOptions = { ...templates, fragment: '' };
    const result = resolvePath(partialTemplates, payload, CLASSIFICATION);
    expect(result).toContain('Fragments/2024/01/02/Invalid___Title.md');
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

  it('supports time placeholders in templates', () => {
    const payload = createPayload({
      type: 'fragment',
      meta: { url: 'https://video.example.com/watch?v=1', domain: 'video.example.com' }
    });
    const customTemplates: TemplateOptions = {
      ...templates,
      fragment: 'Fragments/{HHmmss}.md'
    };
    const result = resolvePath(customTemplates, payload, CLASSIFICATION);
    const expectedHour = String(FIXED_DATE.getHours()).padStart(2, '0');
    const expectedMinute = String(FIXED_DATE.getMinutes()).padStart(2, '0');
    const expectedSecond = String(FIXED_DATE.getSeconds()).padStart(2, '0');
    expect(result).toBe(`Fragments/${expectedHour}${expectedMinute}${expectedSecond}.md`);
  });

  it('uses video template for video payloads to match preview paths', () => {
    const payload = createPayload({
      type: 'video',
      title: 'Video Note',
      meta: { url: 'https://video.example.com/watch?v=1', domain: 'video.example.com' }
    });
    const result = resolvePath(templates, payload, { ...CLASSIFICATION, type: 'video' });
    expect(result).toBe('Video/video.example.com/2024/2024-01-02/video-note.md');
  });

  it('distinguishes month and minute placeholders when both are present', () => {
    const payload = createPayload();
    const customTemplates: TemplateOptions = {
      ...templates,
      article: 'Articles/{yyyy}/{mm}/{HHmm}.md'
    };
    const result = resolvePath(customTemplates, payload, CLASSIFICATION);
    const expectedYear = String(FIXED_DATE.getFullYear());
    const expectedMonth = String(FIXED_DATE.getMonth() + 1).padStart(2, '0');
    const expectedHour = String(FIXED_DATE.getHours()).padStart(2, '0');
    const expectedMinute = String(FIXED_DATE.getMinutes()).padStart(2, '0');
    expect(result).toBe(
      `Articles/${expectedYear}/${expectedMonth}/${expectedHour}${expectedMinute}.md`
    );
  });
});
