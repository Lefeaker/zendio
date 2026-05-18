/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { Readability } from '@mozilla/readability';

import {
  buildReaderHighlightsMarkdown,
  buildReaderFullMarkdown,
  __readerMarkdownBuilderTestUtils
} from '@content/reader/utils/markdownBuilder';
import type { ReaderMarkdownPayload } from '@content/reader/utils/markdownBuilder';

function stripFrontMatter(markdown: string): string {
  const parts = markdown.split('\n---\n\n');
  return parts.length > 1 ? parts[1] : markdown;
}

function requireMeta(payload: ReaderMarkdownPayload): NonNullable<ReaderMarkdownPayload['meta']> {
  if (!payload.meta) {
    throw new Error('Expected markdown payload meta');
  }
  return payload.meta;
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

    expect(body).toContain(
      '- ==Primary insight== [^1]    [](https://example.com/post#:~:text=Primary%20insight)'
    );
    expect(body).toContain(
      '- ==Secondary note==    [](https://example.com/post#:~:text=Secondary%20note)'
    );
    expect(body).toContain('[^1]: Remember to revisit this later.');
  });
});

function createDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('reader full markdown builder', () => {
  it('falls back to html turndown for empty selectedText and trims footnotes', () => {
    const { markdown } = buildReaderHighlightsMarkdown({
      pageTitle: '',
      pageUrl: 'not a url',
      highlights: [
        {
          selectedHtml: '<ul><li>First point</li><li>Second point</li></ul>',
          selectedText: '',
          comment: '  Needs follow up.  ',
          fragmentUrl: '',
          footnoteIndex: 2
        }
      ]
    });

    const body = stripFrontMatter(markdown);
    expect(body).toContain('- ==First point==');
    expect(body).toContain('- ==Second point==');
    expect(body).toContain('[^2]: Needs follow up.');
    expect(body).not.toContain('[](');
  });

  it('builds full markdown, removes ui artifacts, and preserves segmented highlight footnotes', () => {
    const documentClone = createDocument(`
      <html>
        <body>
          <div id="aiob-reader-panel">reader panel</div>
          <div id="obsidian-clipper-dialog">dialog</div>
          <article>
            <p>
              Alpha
              <mark class="aiob-reader-highlight" data-reader-highlight-id="hl-1">Beta</mark>
              <span><mark class="aiob-reader-highlight" data-reader-highlight-id="hl-1">Gamma</mark></span>
            </p>
          </article>
        </body>
      </html>
    `);

    const payload = buildReaderFullMarkdown({
      pageTitle: 'Segmented Highlight',
      pageUrl: 'https://example.com/reader',
      documentClone,
      highlights: [
        {
          id: 'hl-1',
          selectedHtml: '<p>Beta Gamma</p>',
          selectedText: 'Beta Gamma',
          comment: 'Footnote note',
          fragmentUrl: 'https://example.com/reader#:~:text=Beta%20Gamma',
          footnoteIndex: 3
        }
      ]
    });

    const body = stripFrontMatter(payload.markdown);
    expect(body).toContain('Alpha');
    expect(body).toContain('==Beta==');
    expect(body).toContain('==Gamma==');
    expect(body).toContain('[^3]: Footnote note');
    expect(body).not.toContain('aiob-reader-panel');
    expect(body).not.toContain('obsidian-clipper-dialog');
    expect(body).not.toContain('[[AIIOB_HL:');
    expect(requireMeta(payload).exportMode).toBe('full');
  });
});

it('omits empty comments and keeps single highlight tokens well-formed in full export', () => {
  const documentClone = createDocument(`
      <html>
        <body>
          <article>
            <p>
              Before
              <mark class="aiob-reader-highlight" data-reader-highlight-id="solo">Solo</mark>
              After
            </p>
          </article>
        </body>
      </html>
    `);

  const payload = buildReaderFullMarkdown({
    pageTitle: 'Solo Highlight',
    pageUrl: 'https://example.com/solo',
    documentClone,
    highlights: [
      {
        id: 'solo',
        selectedHtml: '<p>Solo</p>',
        selectedText: 'Solo',
        comment: '',
        fragmentUrl: 'https://example.com/solo#:~:text=Solo'
      }
    ]
  });

  const body = stripFrontMatter(payload.markdown);
  expect(body).toContain('==Solo==');
  expect(body).not.toContain('[^');
  expect(requireMeta(payload).commentCount).toBe(0);
});

it('omits fragment links when highlight urls are empty and tolerates blank page metadata', () => {
  const { markdown } = buildReaderHighlightsMarkdown({
    pageTitle: '',
    pageUrl: '',
    highlights: [
      {
        selectedHtml: '<p>Standalone insight</p>',
        selectedText: 'Standalone insight',
        comment: '',
        fragmentUrl: ''
      }
    ]
  });

  const body = stripFrontMatter(markdown);
  expect(body).toContain('- ==Standalone insight==');
  expect(body).not.toContain('[](');
  expect(body).not.toContain('[^');
});

it('keeps full export stable when highlight fragment links are missing and title is empty', () => {
  const documentClone = createDocument(`
    <html>
      <body>
        <article>
          <p><mark class="aiob-reader-highlight" data-reader-highlight-id="solo">Solo</mark></p>
        </article>
      </body>
    </html>
  `);

  const payload = buildReaderFullMarkdown({
    pageTitle: '',
    pageUrl: 'https://example.com/empty-title',
    documentClone,
    highlights: [
      {
        id: 'solo',
        selectedHtml: '<p>Solo</p>',
        selectedText: 'Solo',
        comment: '',
        fragmentUrl: ''
      }
    ]
  });

  const body = stripFrontMatter(payload.markdown);
  expect(body).toContain('==Solo==');
  expect(body).not.toContain('[](');
  expect(requireMeta(payload).exportMode).toBe('full');
  expect(requireMeta(payload).fragmentUrls).toEqual(['']);
});

it('keeps comment metadata count without emitting footnotes when footnote index is absent', () => {
  const payload = buildReaderHighlightsMarkdown({
    pageTitle: 'Comment Only',
    pageUrl: 'https://example.com/comment-only',
    highlights: [
      {
        selectedHtml: '<p>Commented text</p>',
        selectedText: 'Commented text',
        comment: 'Still worth tracking',
        fragmentUrl: 'https://example.com/comment-only#:~:text=Commented%20text'
      }
    ]
  });

  const body = stripFrontMatter(payload.markdown);
  expect(body).toContain('==Commented text==');
  expect(body).toContain('[](');
  expect(body).not.toContain('[^');
  expect(requireMeta(payload).commentCount).toBe(1);
});

it('builds full markdown without highlights and keeps article text plain', () => {
  const documentClone = createDocument(`
    <html>
      <body>
        <article>
          <h1>Plain article</h1>
          <p>Body without saved highlights.</p>
        </article>
      </body>
    </html>
  `);

  const payload = buildReaderFullMarkdown({
    pageTitle: 'Plain article',
    pageUrl: 'https://example.com/plain',
    documentClone,
    highlights: []
  });

  const body = stripFrontMatter(payload.markdown);
  expect(body).toContain('Plain article');
  expect(body).toContain('Body without saved highlights.');
  expect(body).not.toContain('==');
  expect(requireMeta(payload).highlightCount).toBe(0);
});

it('converts explicit mark segment roles during full export', () => {
  const documentClone = createDocument(`
    <html>
      <body>
        <article>
          <p>
            <mark class="aiob-reader-highlight" data-reader-segment-role="start">Alpha</mark>
            <mark class="aiob-reader-highlight" data-reader-segment-role="middle">Beta</mark>
            <mark class="aiob-reader-highlight" data-reader-segment-role="end" data-reader-footnote="4">Gamma</mark>
            <mark class="aiob-reader-highlight" data-reader-footnote="5">Solo</mark>
          </p>
        </article>
      </body>
    </html>
  `);

  const originalParseDescriptor = Object.getOwnPropertyDescriptor(Readability.prototype, 'parse');
  Object.defineProperty(Readability.prototype, 'parse', {
    configurable: true,
    writable: true,
    value: () => ({ content: documentClone.body.innerHTML })
  });

  try {
    const { markdown } = buildReaderFullMarkdown({
      pageTitle: 'Explicit Roles',
      pageUrl: 'https://example.com/roles',
      documentClone,
      highlights: []
    });

    const body = stripFrontMatter(markdown);
    expect(body).toContain('==Alpha');
    expect(body).toContain('Beta');
    expect(body).toContain('Gamma==[^4]');
    expect(body).toContain('==Solo==[^5]');
  } finally {
    if (originalParseDescriptor) {
      Object.defineProperty(Readability.prototype, 'parse', originalParseDescriptor);
    }
  }
});

it('infers start middle and end roles from sibling highlight segments without metadata', () => {
  const documentClone = createDocument(`
    <html>
      <body>
        <article>
          <p>
            <mark class="aiob-reader-highlight" data-reader-highlight-id="pair" data-segment-index="0">One</mark>
            <mark class="aiob-reader-highlight" data-reader-highlight-id="pair" data-segment-index="1">Two</mark>
            <mark class="aiob-reader-highlight" data-reader-highlight-id="pair" data-segment-index="2">Three</mark>
          </p>
        </article>
      </body>
    </html>
  `);

  const originalParseDescriptor = Object.getOwnPropertyDescriptor(Readability.prototype, 'parse');
  Object.defineProperty(Readability.prototype, 'parse', {
    configurable: true,
    writable: true,
    value: () => ({ content: documentClone.body.innerHTML })
  });

  try {
    const { markdown } = buildReaderFullMarkdown({
      pageTitle: 'Inferred Roles',
      pageUrl: 'https://example.com/inferred',
      documentClone,
      highlights: []
    });

    const body = stripFrontMatter(markdown).replace(/\s+/g, ' ');
    expect(body).toContain('==One');
    expect(body).toContain('Two');
    expect(body).toContain('Three==');
    expect(body).not.toContain('==Two==');
  } finally {
    if (originalParseDescriptor) {
      Object.defineProperty(Readability.prototype, 'parse', originalParseDescriptor);
    }
  }
});

it('falls back to document body html when readability content is empty', () => {
  const documentClone = createDocument(`
    <html>
      <body>
        <article>
          <p>Fallback body content</p>
          <p><mark class="aiob-reader-highlight" data-reader-footnote="6">Loose mark</mark></p>
        </article>
      </body>
    </html>
  `);

  const originalParseDescriptor = Object.getOwnPropertyDescriptor(Readability.prototype, 'parse');
  Object.defineProperty(Readability.prototype, 'parse', {
    configurable: true,
    writable: true,
    value: () => ({ content: '' })
  });

  try {
    const { markdown } = buildReaderFullMarkdown({
      pageTitle: 'Fallback Body',
      pageUrl: 'https://example.com/fallback',
      documentClone,
      highlights: []
    });

    const body = stripFrontMatter(markdown);
    expect(body).toContain('Fallback body content');
    expect(body).toContain('==Loose mark==[^6]');
  } finally {
    if (originalParseDescriptor) {
      Object.defineProperty(Readability.prototype, 'parse', originalParseDescriptor);
    }
  }
});

it('covers helper branches for unmatched highlights and token unescaping', () => {
  const utils = __readerMarkdownBuilderTestUtils;
  const documentClone = createDocument(`
    <html>
      <body>
        <article>
          <p><mark class="aiob-reader-highlight" data-reader-highlight-id="solo">Alpha</mark></p>
        </article>
      </body>
    </html>
  `);

  utils.normalizeHighlightSegments(documentClone, [
    {
      id: 'missing',
      selectedHtml: '<p>Missing</p>',
      selectedText: 'Missing',
      comment: '',
      fragmentUrl: ''
    },
    {
      id: 'solo',
      selectedHtml: '<p>Alpha</p>',
      selectedText: 'Alpha',
      comment: '',
      fragmentUrl: '',
      footnoteIndex: 9
    },
    {
      id: 'solo',
      selectedHtml: '<p>Alpha duplicate</p>',
      selectedText: 'Alpha duplicate',
      comment: 'ignored duplicate',
      fragmentUrl: '',
      footnoteIndex: 10
    }
  ]);

  expect(documentClone.body.textContent).toContain('[[AIIOB_HL:solo:S]]');
  expect(documentClone.body.textContent).toContain('[[AIIOB_HL:solo:E:9]]');
  expect(documentClone.body.textContent).not.toContain('10');
  expect(
    utils.applyHighlightTokens(
      String.raw`\[\[AIIOB_HL:item:S\]\]Focus\_Here \[\[AIIOB_HL:item:E:8\]\]`
    )
  ).toBe('==Focus_Here==[^8]');
});

it('exposes markdown helper utilities for segment normalization and token cleanup', () => {
  const utils = __readerMarkdownBuilderTestUtils;
  const documentClone = createDocument(`
    <html>
      <body>
        <article id="article">
          <p id="first"><span id="outer"><mark class="aiob-reader-highlight" data-reader-highlight-id="hl">Alpha</mark></span></p>
          <p id="second"><span><mark class="aiob-reader-highlight" data-reader-highlight-id="hl">Beta</mark></span></p>
        </article>
      </body>
    </html>
  `);

  const article = documentClone.getElementById('article');
  const firstSegment = documentClone.querySelectorAll<HTMLElement>('mark.aiob-reader-highlight')[0];
  const secondSegment = documentClone.querySelectorAll<HTMLElement>(
    'mark.aiob-reader-highlight'
  )[1];
  if (!article || !firstSegment || !secondSegment) {
    throw new Error('Expected test fixture nodes to exist');
  }

  expect(utils.deriveDomain('https://example.com/path')).toBe('example.com');
  expect(utils.deriveDomain('not a valid url')).toBe('unknown');
  expect(utils.resolveCommonAncestor(firstSegment, secondSegment)?.id).toBe('article');
  expect(utils.findBlockContainer(firstSegment)?.id).toBe('first');
  expect(utils.liftToAncestorChild(article, firstSegment)).toBe(article.firstElementChild);
  expect(utils.shouldUnwrapInlineElement(firstSegment)).toBe(true);
  expect(utils.shouldUnwrapInlineElement(documentClone.createElement('span'))).toBe(true);

  utils.normalizeHighlightSegments(documentClone, [
    {
      id: 'hl',
      selectedHtml: '<p>Alpha Beta</p>',
      selectedText: 'Alpha Beta',
      comment: 'footnote',
      fragmentUrl: '',
      footnoteIndex: 7
    }
  ]);

  expect(documentClone.body.textContent).toContain('[[AIIOB_HL:hl__0:S]]');
  expect(documentClone.body.textContent).toContain('[[AIIOB_HL:hl__1:E:7]]');
  expect(documentClone.querySelector('mark.aiob-reader-highlight')).toBeNull();

  const inlineDoc = createDocument(
    '<html><body><p id="host">[[AIIOB_HL:one:S]]<span>Alpha</span><mark>Beta</mark>[[AIIOB_HL:one:E]]</p></body></html>'
  );
  const host = inlineDoc.getElementById('host');
  if (!host || !host.firstChild || !host.lastChild) {
    throw new Error('Expected inline host nodes to exist');
  }
  if (!host.firstChild || !host.lastChild) {
    throw new Error('Expected token boundary nodes');
  }
  utils.stripInlineFormattingBetweenTokens(host.firstChild, host.lastChild);
  expect(host.querySelector('span')).toBeNull();
  expect(host.querySelector('mark')).toBeNull();

  const wrapDoc = createDocument(
    '<html><body><div id="wrap"><span id="node">Text</span></div></body></html>'
  );
  const node = wrapDoc.getElementById('node');
  if (!(node instanceof HTMLElement)) {
    throw new Error('Expected node element');
  }
  utils.unwrapNode(node);
  expect(wrapDoc.getElementById('node')).toBeNull();
  expect(wrapDoc.body.textContent).toContain('Text');

  expect(utils.applyHighlightTokens('[[AIIOB_HL:solo:S]]Focus [[AIIOB_HL:solo:E:2]]')).toBe(
    '==Focus==[^2]'
  );
});

it('includes locator links only for highlights that provide fragment urls', () => {
  const { markdown } = buildReaderHighlightsMarkdown({
    pageTitle: 'Links',
    pageUrl: 'https://example.com/links',
    highlights: [
      {
        selectedHtml: '<p>Linked</p>',
        selectedText: 'Linked',
        comment: '',
        fragmentUrl: 'https://example.com/links#:~:text=Linked'
      },
      {
        selectedHtml: '<p>Plain</p>',
        selectedText: 'Plain',
        comment: '',
        fragmentUrl: ''
      }
    ]
  });

  const body = stripFrontMatter(markdown);
  expect(body).toContain('[](https://example.com/links#:~:text=Linked)');
  expect(body).toContain('- ==Plain==');
});

it('full export keeps segmented highlights readable and preserves footnote definitions', () => {
  const documentClone = createDocument(`
    <html>
      <body>
        <article>
          <p>
            <mark class="aiob-reader-highlight" data-reader-highlight-id="seg">First</mark>
            <mark class="aiob-reader-highlight" data-reader-highlight-id="seg">Second</mark>
          </p>
        </article>
      </body>
    </html>
  `);

  const { markdown } = buildReaderFullMarkdown({
    pageTitle: 'Segmented',
    pageUrl: 'https://example.com/segmented',
    documentClone,
    highlights: [
      {
        id: 'seg',
        selectedHtml: '<p>First Second</p>',
        selectedText: 'First Second',
        comment: 'note',
        fragmentUrl: '',
        footnoteIndex: 8
      }
    ]
  });

  const body = stripFrontMatter(markdown);
  expect(body).toContain('==First==');
  expect(body).toContain('==Second==');
  expect(body).toContain('[^8]: note');
});

it('returns stable highlight markdown when highlights list is empty', () => {
  const { markdown } = buildReaderHighlightsMarkdown({
    pageTitle: 'Empty Highlights',
    pageUrl: 'https://example.com/empty',
    highlights: []
  });

  const body = stripFrontMatter(markdown);
  expect(body.trim()).toBe('');
});

it('preserves whitespace-only highlight content without emitting highlight wrappers', () => {
  const documentClone = createDocument(`
    <html>
      <body>
        <article>
          <p><mark class="aiob-reader-highlight" data-reader-highlight-id="blank">   </mark></p>
        </article>
      </body>
    </html>
  `);

  const { markdown } = buildReaderFullMarkdown({
    pageTitle: 'Whitespace',
    pageUrl: 'https://example.com/whitespace',
    documentClone,
    highlights: [
      {
        id: 'blank',
        selectedHtml: '<p>   </p>',
        selectedText: '   ',
        comment: '',
        fragmentUrl: ''
      }
    ]
  });

  const body = stripFrontMatter(markdown);
  expect(typeof body).toBe('string');
  expect(body).toContain('====');
});

it('returns null common ancestor for detached nodes and keeps token stripping stable', () => {
  const a = document.createElement('mark');
  const b = document.createElement('mark');
  const utils = __readerMarkdownBuilderTestUtils;
  expect(utils.resolveCommonAncestor(a, b)).toBeNull();

  const host = createDocument(
    '<html><body><p id="host">[[AIIOB_HL:x:S]]<strong>Alpha</strong>[[AIIOB_HL:x:E]]</p></body></html>'
  ).getElementById('host');
  if (!(host instanceof HTMLElement)) {
    throw new Error('Expected host');
  }
  if (!host.firstChild || !host.lastChild) {
    throw new Error('Expected token nodes');
  }
  utils.stripInlineFormattingBetweenTokens(host.firstChild, host.lastChild);
  expect(host.textContent).toContain('Alpha');
});

it('omits footnotes for uncommented single highlights while keeping locator links', () => {
  const { markdown } = buildReaderHighlightsMarkdown({
    pageTitle: 'Single',
    pageUrl: 'https://example.com/single',
    highlights: [
      {
        id: 'single',
        selectedHtml: '<p>Alpha</p>',
        selectedText: 'Alpha',
        comment: '',
        fragmentUrl: 'https://example.com/single#:~:text=Alpha'
      }
    ]
  });

  const body = stripFrontMatter(markdown);
  expect(body).toContain('==Alpha==');
  expect(body).toContain('[](https://example.com/single#:~:text=Alpha)');
  expect(body).not.toContain('[^1]:');
});

it('falls back to body html when readability parse returns null', () => {
  const documentClone = createDocument(`
    <html>
      <body>
        <article>
          <p>Null readability fallback</p>
          <p><mark class="aiob-reader-highlight" data-reader-highlight-id="solo">Solo</mark></p>
        </article>
      </body>
    </html>
  `);

  const originalParseDescriptor = Object.getOwnPropertyDescriptor(Readability.prototype, 'parse');
  Object.defineProperty(Readability.prototype, 'parse', {
    configurable: true,
    writable: true,
    value: () => null
  });

  try {
    const payload = buildReaderFullMarkdown({
      pageTitle: 'Null Parse',
      pageUrl: 'https://example.com/null-parse',
      documentClone,
      highlights: [
        {
          id: 'solo',
          selectedHtml: '<p>Solo</p>',
          selectedText: 'Solo',
          comment: '',
          fragmentUrl: ''
        }
      ]
    });

    const body = stripFrontMatter(payload.markdown);
    expect(body).toContain('Null readability fallback');
    expect(body).toContain('==Solo==');
    expect(requireMeta(payload).exportMode).toBe('full');
  } finally {
    if (originalParseDescriptor) {
      Object.defineProperty(Readability.prototype, 'parse', originalParseDescriptor);
    }
  }
});
