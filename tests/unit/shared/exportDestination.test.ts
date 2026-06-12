import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOutputTemplatePreset } from '@shared/config';
import {
  resolveExportPath,
  resolveTemplateKeyForPayloadType,
  toDownloadsFilename,
  type TemplateKey
} from '../../../src/shared/exportDestination';
import type { ClipPayload } from '../../../src/shared/types';

const templateKeyCases: Array<[Pick<ClipPayload, 'type' | 'meta'>, TemplateKey]> = [
  [{ type: 'ai_chat' }, 'ai'],
  [{ type: 'clipper', meta: { readerMode: true } }, 'reading'],
  [{ type: 'clipper' }, 'fragment'],
  [{ type: 'fragment' }, 'fragment'],
  [{ type: 'video' }, 'fragment'],
  [{ type: 'article' }, 'article']
];

describe('exportDestination path preview', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('previews video paths with the same fragment template used by background writes', () => {
    const minimalPreset = getOutputTemplatePreset('Minimal');
    if (!minimalPreset) {
      throw new Error('Missing Minimal preset');
    }
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T20:24:13'));

    const path = resolveExportPath(
      minimalPreset.templates,
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
      'Clips/www.bilibili.com/2026/当我以为国内景区审美已经要完蛋了的时候…直到我们来到….md'
    );
  });

  it.each(templateKeyCases)(
    'resolves the shared template key for %o payloads',
    (payload, expected) => {
      expect(resolveTemplateKeyForPayloadType(payload)).toBe(expected);
    }
  );

  it.each([
    ['../escape.md', 'escape.md'],
    ['folder/../escape.md', 'escape.md'],
    ['/absolute.md', 'absolute.md'],
    ['.', 'note.md'],
    ['..', 'note.md'],
    ['folder/.hidden.md', '.hidden.md']
  ])('normalizes downloads filename %s to %s', (resolvedPath, expected) => {
    expect(toDownloadsFilename(resolvedPath)).toBe(expected);
  });
});
