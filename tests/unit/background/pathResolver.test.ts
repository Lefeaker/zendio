import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePath } from '../../../src/background/pathResolver';
import type { ClassificationResult } from '../../../src/background/services/classificationService';

describe('pathResolver', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the article template for video clips because options shares article and video paths', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T20:24:13'));

    const classification: ClassificationResult = {
      status: 'success',
      topics: [],
      tags: [],
      type: 'video'
    };

    const path = resolvePath(
      {
        article: 'Articles/{domain}/{yyyy}/{slug}.md',
        fragment: 'Clips/{domain}/{yyyy}/{slug}.md',
        reading: 'Reading/{domain}/{yyyy}/{slug}.md',
        ai: 'AI/{platform}/{yyyy}/{title}.md'
      },
      {
        markdown: '# video',
        title: '当我以为国内景区审美已经要完蛋了的时候…直到我们来到…',
        type: 'video',
        meta: {
          url: 'https://www.bilibili.com/video/BV129ReB1ExM',
          platform: 'bilibili'
        }
      },
      classification,
      undefined
    );

    expect(path).toBe(
      'Articles/www.bilibili.com/2026/当我以为国内景区审美已经要完蛋了的时候…直到我们来到….md'
    );
  });
});
