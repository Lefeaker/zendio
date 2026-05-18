/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { buildFragmentMarkdown } from '@content/clipper/markdown/fragmentBuilder';
import { createClipperTurndown } from '@content/clipper/shared/turndownFactory';
import type { FragmentClipperOptions } from '@shared/types/options';
import {
  resetYamlConfigOverridesStore,
  setYamlConfigOverrides
} from '@shared/state/yamlConfigOverridesStore';

describe('buildFragmentMarkdown', () => {
  const baseConfig: FragmentClipperOptions = {
    useFootnoteFormat: true,
    captureContext: false,
    contextLength: 200,
    contextMode: 'chars',
    selectionModifierEnabled: false,
    selectionModifierKeys: [],
    keyboardShortcutsEnabled: false
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

    expect(markdown).toContain('type: "clipper"');
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

  it('respects clipper YAML overrides for arrays and value paths', () => {
    setYamlConfigOverrides({
      contentTypes: {
        clipper: {
          customFields: [
            { name: 'clip_alias', type: 'text', enabled: true, valuePath: 'title' },
            {
              name: 'clip_topics',
              type: 'array',
              enabled: true,
              defaultValue: ['clip', 'research']
            }
          ]
        }
      }
    });
    const turndown = createClipperTurndown('https://sample.dev');
    const markdown = buildFragmentMarkdown({
      pageTitle: 'Knowledge Bits',
      fragmentUrl: 'https://sample.dev/#k',
      clippedAt: '2024-05-05T05:05:05Z',
      selectedHtml: '<p>Snippet</p>',
      userComment: undefined,
      config: baseConfig,
      turndown,
      context: null,
      ancestorMarkdown: '',
      ancestorDepth: 0
    });

    const frontMatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
    const frontMatter = frontMatterMatch ? frontMatterMatch[0] : '';
    expect(frontMatter).toContain('clip_alias: "Knowledge Bits"');
    expect(frontMatter).toContain('clip_topics: ["clip", "research"]');
  });
});

afterEach(() => {
  setYamlConfigOverrides(null);
  resetYamlConfigOverridesStore();
});
