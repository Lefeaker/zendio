import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOutputTemplatePreset } from '@shared/config';
import { resolvePath } from '../../../src/background/pathResolver';
import type { ClassificationResult } from '../../../src/background/services/classificationService';

describe('pathResolver', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['article', 'ai_chat', 'clipper', 'video', 'reading'])(
    'resolves %s date tokens from the export intent instead of source creation time',
    (type) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 16, 0, 0, 1));
      const template = '{yyyy}-{mm}-{dd}_{HH}-{HHmm}-{HHmmss}-{ss}_{slug}.md';
      const templates = {
        article: template,
        ai: template,
        fragment: template,
        video: template,
        reading: template
      };
      const payload = {
        type: type === 'reading' ? 'clipper' : type,
        title: 'Fixed time',
        markdown: 'body',
        meta: {
          readerMode: type === 'reading',
          exportStartedAt: new Date(2026, 9, 15, 23, 59, 59).getTime(),
          createdAt: '2020-01-01'
        }
      };
      const classification: ClassificationResult = {
        type: 'article',
        status: 'success',
        topics: [],
        tags: []
      };
      expect(resolvePath(templates, payload, classification)).toBe(
        '2026-10-15_23-2359-235959-59_fixed-time.md'
      );
      expect(
        resolvePath(
          templates,
          { ...payload, meta: { readerMode: type === 'reading', createdAt: '2020-01-01' } },
          classification
        )
      ).toBe('2026-10-16_00-0000-000001-01_fixed-time.md');
    }
  );

  it.each([NaN, Infinity, -1, 8_640_000_000_000_001])(
    'does not trust an invalid direct-call timestamp %s',
    (exportStartedAt) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 16, 0, 0, 1));
      const preset = getOutputTemplatePreset('Minimal');
      if (!preset) throw new Error('Missing Minimal preset');
      expect(
        resolvePath(
          { ...preset.templates, video: '{yyyy}-{mm}-{dd}.md' },
          {
            type: 'video',
            markdown: 'body',
            meta: { exportStartedAt }
          },
          { type: 'video', status: 'success', topics: [], tags: [] }
        )
      ).toBe('2026-10-16.md');
    }
  );

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
        video: 'Video/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md'
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
      'Video/www.bilibili.com/2026/2026-05-09/当我以为国内景区审美已经要完蛋了的时候…直到我们来到….md'
    );
  });
});
