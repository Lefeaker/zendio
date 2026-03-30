/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { ReaderSessionExporter } from '@content/reader/services/exporter';
import type { ReaderHighlightRecord } from '@content/reader/services/highlightManager';

function createHighlight(id: string, comment: string): ReaderHighlightRecord {
  const wrapper = document.createElement('mark');
  wrapper.dataset.readerHighlightId = id;
  return {
    id,
    selectedHtml: `<p>${id}</p>`,
    selectedText: id,
    comment,
    fragmentUrl: `https://example.com/#${id}`,
    wrapper,
    wrapperSegments: [wrapper],
    createdAt: Date.now()
  };
}

describe('ReaderSessionExporter', () => {
  it('assigns sequential footnotes only to commented highlights', () => {
    const buildHighlightsMarkdown = vi.fn();
    const exporter = new ReaderSessionExporter({ buildHighlightsMarkdown, buildFullMarkdown: vi.fn() });
    const assignFootnote = vi.fn();
    const reconstructText = vi.fn((highlight: ReaderHighlightRecord) => `${highlight.selectedText}-rebuilt`);
    const manager = { assignFootnote, reconstructText } as never;

    const prepared = exporter.prepareHighlights([
      createHighlight('a', ' note one '),
      createHighlight('b', '   '),
      createHighlight('c', 'note three')
    ], manager);

    expect(assignFootnote).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'a' }), 'note one', 1);
    expect(assignFootnote).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'b' }), '', undefined);
    expect(assignFootnote).toHaveBeenNthCalledWith(3, expect.objectContaining({ id: 'c' }), 'note three', 2);
    expect(prepared).toEqual([
      expect.objectContaining({ id: 'a', selectedText: 'a-rebuilt', footnoteIndex: 1 }),
      expect.objectContaining({ id: 'b', selectedText: 'b-rebuilt' }),
      expect.objectContaining({ id: 'c', selectedText: 'c-rebuilt', footnoteIndex: 2 })
    ]);
  });

  it('builds full markdown only when document clone is provided', () => {
    const buildFullMarkdown = vi.fn(() => ({ markdown: '# full' }));
    const buildHighlightsMarkdown = vi.fn(() => ({ markdown: '# highlights' }));
    const exporter = new ReaderSessionExporter({ buildHighlightsMarkdown, buildFullMarkdown });

    expect(() => exporter.buildMarkdown({ mode: 'full', pageTitle: 'Page', pageUrl: 'https://example.com', highlights: [] })).toThrow(/documentClone is required/);

    const clone = new DOMParser().parseFromString('<html><body><p>Hello</p></body></html>', 'text/html');
    const full = exporter.buildMarkdown({ mode: 'full', pageTitle: 'Page', pageUrl: 'https://example.com', highlights: [], documentClone: clone });
    const highlights = exporter.buildMarkdown({ mode: 'highlights', pageTitle: 'Page', pageUrl: 'https://example.com', highlights: [] });

    expect(full).toEqual({ markdown: '# full' });
    expect(highlights).toEqual({ markdown: '# highlights' });
  });

  it('applies tokens by unwrapping highlight segments and adding comment metadata', () => {
    const exporter = new ReaderSessionExporter({ buildHighlightsMarkdown: vi.fn(), buildFullMarkdown: vi.fn() });
    const clone = new DOMParser().parseFromString(
      '<html><body><p><mark class="aiob-reader-highlight" data-reader-highlight-id="hl-1">Alpha</mark><span><mark class="aiob-reader-highlight" data-reader-highlight-id="hl-1">Beta</mark></span></p></body></html>',
      'text/html'
    );

    exporter.applyTokens(clone, [{
      id: 'hl-1',
      selectedHtml: '<p>Alpha Beta</p>',
      selectedText: 'Alpha Beta',
      comment: 'note',
      fragmentUrl: 'https://example.com/#frag',
      footnoteIndex: 3
    }]);

    const bodyText = clone.body.textContent ?? '';
    expect(bodyText).toContain('[[AIIOB_HL:hl-1:S]]');
    expect(bodyText).toContain('[[AIIOB_HL:hl-1:E:3]]');
    expect(clone.body.innerHTML).not.toContain('<mark');
  });
});
