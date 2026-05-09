import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveExportPath } from '../../../src/shared/exportDestination';

describe('exportDestination path preview', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('previews video paths with the shared article/video template', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T20:24:13'));

    const path = resolveExportPath(
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
      }
    );

    expect(path).toBe(
      'Articles/www.bilibili.com/2026/当我以为国内景区审美已经要完蛋了的时候…直到我们来到….md'
    );
  });
});
