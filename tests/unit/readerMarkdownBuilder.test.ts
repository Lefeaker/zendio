/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import { buildReaderHighlightsMarkdown } from '../../src/content/reader/utils/markdownBuilder';

function stripFrontMatter(markdown: string): string {
  const parts = markdown.split('\n---\n\n');
  return parts.length > 1 ? parts[1] : markdown;
}

describe('reader highlight markdown builder', () => {
  it('appends fragment locator links after each highlight', () => {
    const { markdown } = buildReaderHighlightsMarkdown({
      pageTitle: 'Sample Post',
      pageUrl: 'https://example.com/post',
      highlights: [
        {
          selectedHtml: '<p>Primary insight</p>',
          selectedText: 'Primary insight',
          comment: 'Remember to revisit this later.',
          fragmentUrl: 'https://example.com/post#:~:text=Primary%20insight',
          footnoteIndex: 1
        },
        {
          selectedHtml: '<p>Secondary note</p>',
          selectedText: 'Secondary note',
          comment: '',
          fragmentUrl: 'https://example.com/post#:~:text=Secondary%20note'
        }
      ]
    });

    const body = stripFrontMatter(markdown);

    expect(body).toContain('- ==Primary insight== [^1]    [](https://example.com/post#:~:text=Primary%20insight)');
    expect(body).toContain('- ==Secondary note==    [](https://example.com/post#:~:text=Secondary%20note)');
    expect(body).toContain('[^1]: Remember to revisit this later.');
  });
});
