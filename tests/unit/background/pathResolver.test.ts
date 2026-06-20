import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOutputTemplatePreset } from '@shared/config';
import { resolvePath } from '../../../src/background/pathResolver';
import type { ClassificationResult } from '../../../src/background/services/classificationService';

describe('pathResolver', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the video template for video clips', () => {
    const minimalPreset = getOutputTemplatePreset('Minimal');
    if (!minimalPreset) {
      throw new Error('Missing Minimal preset');
    }
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
        ...minimalPreset.templates,
        video: 'video/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md'
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
      'video/www.bilibili.com/2026/2026-05-09/当我以为国内景区审美已经要完蛋了的时候…直到我们来到….md'
    );
  });
});
