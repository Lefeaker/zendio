/* @vitest-environment jsdom */

import { describe, it, expect } from 'vitest';
import { extractSelectionClip } from '../../src/content/extractors/selectionExtractor';
import { generateTextFragmentUrl } from '../../src/content/clipper/utils/textFragment';

describe('selectionExtractor', () => {
  it('generates fragment urls from selected text', () => {
    const fragment = generateTextFragmentUrl('https://example.com', 'Hello world from fragment test');
    expect(fragment).toContain('https://example.com#:~:text=');
  });

  it('creates markdown for simple selection', async () => {
    document.body.innerHTML = `
      <article>
        <p id="target">Hello world</p>
      </article>
    `;

    const target = document.getElementById('target');
    if (!target) throw new Error('missing test element');

    const range = document.createRange();
    range.selectNodeContents(target);

    const container = document.createElement('div');
    container.appendChild(range.cloneContents());

    const result = await extractSelectionClip({
      doc: document,
      url: 'https://example.com',
      selectedHtml: container.innerHTML,
      selectedText: target.textContent || '',
      userComment: '',
      config: {
        useFootnoteFormat: false,
        captureContext: false,
        contextLength: 200,
        contextMode: 'chars'
      },
      selectionRange: range
    });

    expect(result.type).toBe('clipper');
    expect(result.markdown).toContain('Hello world');
    expect(result.meta.fragmentUrl).toContain('#:~:text');
  });
});
