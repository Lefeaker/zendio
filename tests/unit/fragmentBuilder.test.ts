/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { buildFragmentMarkdown } from '../../src/content/clipper/markdown/fragmentBuilder';
import { createClipperTurndown } from '../../src/content/clipper/shared/turndownFactory';
import type { FragmentClipperOptions } from '../../src/shared/types/options';

describe('buildFragmentMarkdown', () => {
  const baseConfig: FragmentClipperOptions = {
    useFootnoteFormat: true,
    captureContext: false,
    contextLength: 200,
    contextMode: 'chars',
    selectionModifierEnabled: false,
    selectionModifierKeys: []
  };

  it('generates footnote markdown with metadata', () => {
    const turndown = createClipperTurndown('https://example.com');
    const markdown = buildFragmentMarkdown({
      pageTitle: 'Example Page',
      fragmentUrl: 'https://example.com/#fragment',
      clippedAt: '2024-01-01T00:00:00Z',
      selectedHtml: '<ul><li>Item</li></ul>',
      userComment: 'Nice note',
      config: baseConfig,
      turndown,
      context: null,
      ancestorMarkdown: '',
      ancestorDepth: 0
    });

    expect(markdown).toContain('type: clipper');
    expect(markdown).toContain('Item');
    expect(markdown).toContain('Nice note');
  });

  it('supports plain markdown when footnote disabled', () => {
    const turndown = createClipperTurndown('https://example.com');
    const markdown = buildFragmentMarkdown({
      pageTitle: 'Plain Page',
      fragmentUrl: 'https://example.com/#plain',
      clippedAt: '2024-01-02T00:00:00Z',
      selectedHtml: '<p>Snippet</p>',
      userComment: 'Commentary',
      config: { ...baseConfig, useFootnoteFormat: false },
      turndown,
      context: null,
      ancestorMarkdown: '',
      ancestorDepth: 0
    });

    expect(markdown).toContain('Snippet');
    expect(markdown).toContain('我的评论');
  });
});
