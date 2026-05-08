/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderHighlightManager } from '@content/reader/services/highlightManager';

function createRangeForWholeNode(node: Node): Range {
  const range = document.createRange();
  range.selectNodeContents(node);
  return range;
}

describe('ReaderHighlightManager', () => {
  let manager: ReaderHighlightManager;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.removeAttribute('data-aiobReaderHighlight');
    document.body.removeAttribute('data-aiobReaderHighlightTheme');
    manager = new ReaderHighlightManager(document);
  });

  it('applies highlight theme onto body dataset', () => {
    manager.applyTheme('gradient');
    expect(document.body.dataset.aiobReaderHighlight).toBe('gradient');
    expect(document.body.dataset.aiobReaderHighlightTheme).toBe('gradient');
    expect(document.head.querySelector('style[data-aiob-reader-highlight-theme]')).toBeTruthy();

    manager.applyTheme('gradient');
    expect(document.body.dataset.aiobReaderHighlight).toBe('gradient');
  });

  it('injects reader highlight colors aligned with the options highlight preview palette', () => {
    manager.applyTheme('purple');

    const style = document.head.querySelector<HTMLStyleElement>(
      'style[data-aiob-reader-highlight-theme]'
    );
    expect(style?.textContent).toContain('--reader-highlight-purple: rgba(111, 92, 255, 0.48)');
    expect(style?.textContent).toContain(
      '--reader-highlight-neon-yellow: rgba(255, 233, 88, 0.58)'
    );
    expect(style?.textContent).toContain("body[data-aiob-reader-highlight='purple']");
    expect(style?.textContent).toContain('box-decoration-break: clone');
    expect(style?.textContent).toContain('-webkit-box-decoration-break: clone');
  });

  it('creates highlight, trims comments, and annotates wrapper metadata', () => {
    document.body.innerHTML = '<article><p id="content">Hello reader world</p></article>';
    const textNode = document.getElementById('content')?.firstChild;
    if (!textNode) {
      throw new Error('text node missing');
    }

    const highlight = manager.createHighlight({
      id: 'h-1',
      range: createRangeForWholeNode(textNode),
      selectedHtml: '<p>Hello reader world</p>',
      selectedText: 'Hello reader world',
      comment: '  keep this  ',
      fragmentUrl: '#h-1'
    });

    expect(highlight).not.toBeNull();
    expect(highlight?.comment).toBe('keep this');
    expect(highlight?.wrapper.classList.contains('aiob-reader-highlight')).toBe(true);
    expect(highlight?.wrapper.dataset.readerHighlightId).toBe('h-1');
    expect(highlight?.wrapper.dataset.readerComment).toBe('keep this');
    expect(highlight?.wrapper.textContent).toContain('Hello reader world');
  });

  it('only highlights the selected substring inside a single text node', () => {
    document.body.innerHTML = '<article><p id="content">Hello reader world</p></article>';
    const textNode = document.getElementById('content')?.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
      throw new Error('text node missing');
    }

    const range = document.createRange();
    range.setStart(textNode, 6);
    range.setEnd(textNode, 12);

    const highlight = manager.createHighlight({
      id: 'partial',
      range,
      selectedHtml: 'reader',
      selectedText: 'reader',
      comment: '',
      fragmentUrl: '#partial'
    });

    expect(highlight).not.toBeNull();
    expect(highlight?.wrapper.textContent).toBe('reader');
    expect(document.getElementById('content')?.textContent).toBe('Hello reader world');
    expect(document.getElementById('content')?.innerHTML).toContain('Hello ');
    expect(document.getElementById('content')?.innerHTML).toContain(' world');
  });

  it('updates comments, assigns footnotes, and clears footnote when comment changes', () => {
    document.body.innerHTML = '<article><p id="content">Comment me</p></article>';
    const textNode = document.getElementById('content')?.firstChild;
    if (!textNode) {
      throw new Error('text node missing');
    }

    const highlight = manager.createHighlight({
      id: 'h-2',
      range: createRangeForWholeNode(textNode),
      selectedHtml: '<p>Comment me</p>',
      selectedText: 'Comment me',
      comment: '',
      fragmentUrl: '#h-2'
    });
    if (!highlight) {
      throw new Error('highlight missing');
    }

    manager.assignFootnote(highlight, '  with footnote  ', 3);
    expect(highlight.comment).toBe('with footnote');
    expect(highlight.footnoteIndex).toBe(3);
    expect(highlight.wrapper.dataset.readerFootnote).toBe('3');
    expect(highlight.wrapper.dataset.readerComment).toBe('with footnote');

    manager.updateComment(highlight, ' changed ');
    expect(highlight.comment).toBe('changed');
    expect(highlight.footnoteIndex).toBeUndefined();
    expect(highlight.wrapper.dataset.readerFootnote).toBeUndefined();
    expect(highlight.wrapper.dataset.readerComment).toBe('changed');
  });

  it('sorts highlights by document order and resolves primary wrapper from connected segment', () => {
    document.body.innerHTML =
      '<article><p id="first">First block</p><p id="second">Second block</p></article>';
    const firstNode = document.getElementById('first')?.firstChild;
    const secondNode = document.getElementById('second')?.firstChild;
    if (!firstNode || !secondNode) {
      throw new Error('nodes missing');
    }

    const first = manager.createHighlight({
      id: 'h-a',
      range: createRangeForWholeNode(firstNode),
      selectedHtml: '<p>First block</p>',
      selectedText: 'First block',
      comment: '',
      fragmentUrl: '#h-a'
    });
    const second = manager.createHighlight({
      id: 'h-b',
      range: createRangeForWholeNode(secondNode),
      selectedHtml: '<p>Second block</p>',
      selectedText: 'Second block',
      comment: '',
      fragmentUrl: '#h-b'
    });
    if (!first || !second) {
      throw new Error('highlights missing');
    }

    first.wrapper.remove();
    expect(manager.getPrimaryWrapper(first)).toBeNull();

    const list = [second, first];
    manager.sortByDocumentOrder(list);
    expect(list.map((item) => item.id)).toEqual(['h-b', 'h-a']);
  });

  it('unwraps highlight segments and reconstructs multi-segment text', () => {
    document.body.innerHTML =
      '<article><p><span id="a">Hello</span><span id="b">World</span></p></article>';
    const wrapperA = document.createElement('mark');
    wrapperA.className = 'aiob-reader-highlight';
    wrapperA.dataset.segmentIndex = '0';
    wrapperA.textContent = 'Hello';
    const wrapperB = document.createElement('mark');
    wrapperB.className = 'aiob-reader-highlight';
    wrapperB.dataset.segmentIndex = '1';
    wrapperB.textContent = 'World';
    document.getElementById('a')?.replaceChildren(wrapperA);
    document.getElementById('b')?.replaceChildren(wrapperB);

    const highlight = {
      id: 'h-3',
      selectedHtml: '<p>Hello World</p>',
      selectedText: 'Hello World',
      comment: '',
      fragmentUrl: '#h-3',
      wrapper: wrapperA,
      wrapperSegments: [wrapperA, wrapperB],
      createdAt: Date.now()
    };

    expect(manager.reconstructText(highlight)).toBe('Hello World');
    manager.unwrapHighlight(highlight);
    expect(document.body.textContent?.replace(/\s+/g, ' ').trim()).toContain('HelloWorld');
    expect(document.querySelectorAll('mark.aiob-reader-highlight')).toHaveLength(0);
  });

  it('returns null when no highlight wrappers can be created and preserves disconnected text reconstruction fallback', () => {
    const manager = new ReaderHighlightManager(document);
    const highlight = manager.createHighlight({
      id: 'missing',
      range: document.createRange(),
      selectedHtml: '',
      selectedText: 'Fallback text',
      comment: '',
      fragmentUrl: '#missing'
    });
    expect(highlight).toBeNull();

    const wrapper = document.createElement('mark');
    wrapper.dataset.segmentIndex = '0';
    const disconnected = {
      id: 'h-fallback',
      selectedHtml: '<p>Fallback text</p>',
      selectedText: 'Fallback text',
      comment: '',
      fragmentUrl: '#fallback',
      wrapper,
      wrapperSegments: [wrapper],
      createdAt: Date.now()
    };

    expect(manager.reconstructText(disconnected)).toBe('Fallback text');
  });

  it('merges inline highlight segments within the same block into a single wrapper', () => {
    const manager = new ReaderHighlightManager(document);
    document.body.innerHTML =
      '<article><p id="content"><span id="a">Hello</span><span id="b">World</span></p></article>';
    const first = document.getElementById('a')?.firstChild;
    const second = document.getElementById('b')?.firstChild;
    if (!first || !second) {
      throw new Error('text nodes missing');
    }

    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(second, second.textContent?.length ?? 0);

    const highlight = manager.createHighlight({
      id: 'merged',
      range,
      selectedHtml: '<p>HelloWorld</p>',
      selectedText: 'HelloWorld',
      comment: '',
      fragmentUrl: '#merged'
    });

    expect(highlight).not.toBeNull();
    expect(highlight?.wrapperSegments).toHaveLength(1);
    expect(highlight?.wrapper.textContent?.replace(/\s+/g, '')).toBe('HelloWorld');
  });

  it('keeps split segments when merging would swallow unselected inline content', () => {
    document.body.innerHTML =
      '<article><p><span id="a">Hello</span><span id="gap"> untouched </span><span id="b">World</span></p></article>';
    const a = document.createElement('mark');
    a.className = 'aiob-reader-highlight';
    a.textContent = 'Hello';
    const b = document.createElement('mark');
    b.className = 'aiob-reader-highlight';
    b.textContent = 'World';
    document.getElementById('a')?.replaceChildren(a);
    document.getElementById('b')?.replaceChildren(b);

    const merged = (
      manager as unknown as {
        mergeWrapperSegments: (segments: HTMLElement[], id: string) => HTMLElement[];
      }
    ).mergeWrapperSegments([a, b], 'skip-unsafe-merge');

    expect(merged).toEqual([a, b]);
    expect(document.body.textContent).toContain('untouched');
  });

  it('writes multi-segment metadata so only the ending segment keeps the footnote marker', () => {
    const manager = new ReaderHighlightManager(document);
    const start = document.createElement('mark');
    const end = document.createElement('mark');
    const highlight = {
      id: 'segmented',
      selectedHtml: '<p>Alpha Beta</p>',
      selectedText: 'Alpha Beta',
      comment: '',
      fragmentUrl: '#segmented',
      wrapper: start,
      wrapperSegments: [start, end],
      createdAt: Date.now()
    };

    manager.assignFootnote(highlight, '  linked note  ', 4);

    expect(start.dataset.segmentIndex).toBe('0');
    expect(start.dataset.readerSegmentRole).toBe('start');
    expect(start.dataset.readerComment).toBe('linked note');
    expect(start.dataset.readerFootnote).toBeUndefined();
    expect(end.dataset.segmentIndex).toBe('1');
    expect(end.dataset.readerSegmentRole).toBe('end');
    expect(end.dataset.readerComment).toBe('linked note');
    expect(end.dataset.readerFootnote).toBe('4');
  });

  it('falls back to extract-and-insert when surroundContents fails and updates wrapper segments on comment change', () => {
    document.body.innerHTML = '<article><p id="content"><strong>Edge</strong> case</p></article>';
    const paragraph = document.getElementById('content');
    if (!paragraph?.firstChild) {
      throw new Error('paragraph missing');
    }

    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const surroundSpy = vi.spyOn(Range.prototype, 'surroundContents').mockImplementation(() => {
      throw new Error('surround failed');
    });

    const highlight = manager.createHighlight({
      id: 'h-fallback',
      range,
      selectedHtml: '<p><strong>Edge</strong> case</p>',
      selectedText: 'Edge case',
      comment: ' note ',
      fragmentUrl: '#h-fallback'
    });

    expect(highlight).not.toBeNull();
    expect(document.querySelector('mark.aiob-reader-highlight')).toBeTruthy();
    if (!highlight) {
      throw new Error('Expected fallback highlight');
    }
    manager.updateComment(highlight, ' next ');
    expect(highlight.wrapper.dataset.readerComment).toBe('next');
    surroundSpy.mockRestore();
  });

  it('returns connected segment as primary wrapper and falls back to selected text when disconnected segments stay shorter', () => {
    document.body.innerHTML = '<article><p><span id="first"></span></p></article>';
    const disconnected = document.createElement('mark');
    disconnected.className = 'aiob-reader-highlight';
    disconnected.dataset.segmentIndex = '1';
    disconnected.textContent = 'tail';
    const connected = document.createElement('mark');
    connected.className = 'aiob-reader-highlight';
    connected.dataset.segmentIndex = '0';
    connected.textContent = 'Head';
    document.getElementById('first')?.appendChild(connected);

    const highlight = {
      id: 'h-connected',
      selectedHtml: '<p>Head tail</p>',
      selectedText: 'Head',
      comment: '',
      fragmentUrl: '#h-connected',
      wrapper: disconnected,
      wrapperSegments: [disconnected, connected],
      createdAt: Date.now()
    };

    expect(manager.getPrimaryWrapper(highlight as never)).toBe(connected);
    expect(manager.reconstructText(highlight as never)).toBe('Head');
  });

  it('clears comment metadata when updating segmented highlights to empty comment', () => {
    const start = document.createElement('mark');
    const middle = document.createElement('mark');
    const end = document.createElement('mark');
    const highlight = {
      id: 'seg-clear',
      selectedHtml: '<p>Alpha Beta Gamma</p>',
      selectedText: 'Alpha Beta Gamma',
      comment: 'keep',
      fragmentUrl: '#seg-clear',
      wrapper: start,
      wrapperSegments: [start, middle, end],
      footnoteIndex: 2,
      createdAt: Date.now()
    };

    manager.assignFootnote(highlight, ' keep ', 2);
    manager.updateComment(highlight, '   ');

    expect(start.dataset.readerComment).toBeUndefined();
    expect(middle.dataset.readerComment).toBeUndefined();
    expect(end.dataset.readerComment).toBeUndefined();
    expect(end.dataset.readerFootnote).toBeUndefined();
  });

  it('unwrapHighlight safely ignores detached wrappers and flattenNestedHighlightMarks removes nested marks', () => {
    document.body.innerHTML = '<article><p id="content">Hello <span>world</span></p></article>';
    const paragraph = document.getElementById('content');
    if (!paragraph) {
      throw new Error('paragraph missing');
    }

    const outer = document.createElement('mark');
    outer.className = 'aiob-reader-highlight';
    outer.dataset.readerHighlightId = 'nested';
    const inner = document.createElement('mark');
    inner.className = 'aiob-reader-highlight';
    inner.textContent = 'world';
    outer.append('Hello ', inner);
    paragraph.replaceChildren(outer);

    const orphan = document.createElement('mark');
    orphan.className = 'aiob-reader-highlight';
    orphan.textContent = 'orphan';

    const highlight = {
      id: 'nested',
      selectedHtml: '<p>Hello world</p>',
      selectedText: 'Hello world',
      comment: '',
      fragmentUrl: '#nested',
      wrapper: outer,
      wrapperSegments: [outer, orphan],
      createdAt: Date.now()
    };

    manager.unwrapHighlight(highlight as never);

    expect(paragraph.querySelectorAll('mark.aiob-reader-highlight')).toHaveLength(1);
    expect(orphan.isConnected).toBe(false);
    expect(paragraph.textContent?.replace(/\s+/g, ' ').trim()).toBe('Hello world');
  });

  it('returns reconstructed text when disconnected primary wrapper has connected siblings and preserves selected text for short fragments', () => {
    document.body.innerHTML = '<article><p id="content"></p></article>';
    const host = document.getElementById('content');
    if (!host) {
      throw new Error('host missing');
    }

    const first = document.createElement('mark');
    first.className = 'aiob-reader-highlight';
    first.dataset.segmentIndex = '0';
    first.textContent = 'Hello';
    const second = document.createElement('mark');
    second.className = 'aiob-reader-highlight';
    second.dataset.segmentIndex = '1';
    second.textContent = 'reader';
    host.append(first, second);

    const disconnectedPrimary = document.createElement('mark');
    disconnectedPrimary.className = 'aiob-reader-highlight';
    disconnectedPrimary.dataset.segmentIndex = '9';
    disconnectedPrimary.textContent = 'x';

    const highlight = {
      id: 'reconstruct',
      selectedHtml: '<p>Hello reader</p>',
      selectedText: 'Hello reader',
      comment: '',
      fragmentUrl: '#reconstruct',
      wrapper: disconnectedPrimary,
      wrapperSegments: [disconnectedPrimary, second, first],
      createdAt: Date.now()
    };

    expect(manager.getPrimaryWrapper(highlight as never)).toBe(second);
    expect(manager.reconstructText(highlight as never)).toBe('Hello reader');
  });

  it('clears assigned footnotes, keeps same-wrapper sort stable, and falls back for detached records', () => {
    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    wrapper.textContent = 'same';
    document.body.appendChild(wrapper);

    const highlight = {
      id: 'same',
      selectedHtml: '<p>same</p>',
      selectedText: 'same',
      comment: 'keep',
      fragmentUrl: '#same',
      wrapper,
      wrapperSegments: [wrapper],
      footnoteIndex: 5,
      createdAt: Date.now()
    };
    manager.assignFootnote(highlight as never, ' keep ', undefined);
    expect(highlight.footnoteIndex).toBeUndefined();
    expect(wrapper.dataset.readerFootnote).toBeUndefined();

    const detached = document.createElement('mark');
    detached.className = 'aiob-reader-highlight';
    const list = [
      { ...highlight, id: 'b', wrapper: detached, wrapperSegments: [detached] },
      { ...highlight, id: 'a', wrapper, wrapperSegments: [wrapper] },
      { ...highlight, id: 'c', wrapper: detached, wrapperSegments: [detached] }
    ];
    manager.sortByDocumentOrder(list as never);
    expect(list.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('reconstructs with ascii spacing, preserves cjk adjacency, and returns longer detached text', () => {
    const asciiA = document.createElement('mark');
    asciiA.className = 'aiob-reader-highlight';
    asciiA.dataset.segmentIndex = '0';
    asciiA.textContent = 'Hello';
    const asciiB = document.createElement('mark');
    asciiB.className = 'aiob-reader-highlight';
    asciiB.dataset.segmentIndex = '1';
    asciiB.textContent = 'world';
    document.body.append(asciiA, asciiB);

    expect(
      manager.reconstructText({
        id: 'ascii',
        selectedHtml: '<p>Hello world</p>',
        selectedText: 'Hello world',
        comment: '',
        fragmentUrl: '#ascii',
        wrapper: asciiA,
        wrapperSegments: [asciiA, asciiB],
        createdAt: Date.now()
      } as never)
    ).toBe('Hello world');

    const cjkA = document.createElement('mark');
    cjkA.className = 'aiob-reader-highlight';
    cjkA.dataset.segmentIndex = '0';
    cjkA.textContent = '你好';
    const cjkB = document.createElement('mark');
    cjkB.className = 'aiob-reader-highlight';
    cjkB.dataset.segmentIndex = '1';
    cjkB.textContent = '世界';
    document.body.append(cjkA, cjkB);
    expect(
      manager.reconstructText({
        id: 'cjk',
        selectedHtml: '<p>你好世界</p>',
        selectedText: '你好世界',
        comment: '',
        fragmentUrl: '#cjk',
        wrapper: cjkA,
        wrapperSegments: [cjkA, cjkB],
        createdAt: Date.now()
      } as never)
    ).toBe('你好世界');

    const detachedA = document.createElement('mark');
    detachedA.className = 'aiob-reader-highlight';
    detachedA.dataset.segmentIndex = '0';
    detachedA.textContent = 'Hello';
    const detachedB = document.createElement('mark');
    detachedB.className = 'aiob-reader-highlight';
    detachedB.dataset.segmentIndex = '1';
    detachedB.textContent = 'world';
    const detachedHighlight = {
      id: 'detached',
      selectedHtml: '<p>Hello</p>',
      selectedText: 'Hello',
      comment: '',
      fragmentUrl: '#detached',
      wrapper: detachedA,
      wrapperSegments: [detachedA, detachedB],
      createdAt: Date.now()
    };
    expect(manager.reconstructText(detachedHighlight as never)).toBe('Hello');
  });

  it('returns null when wrappers and fallback fragments both stay empty, and keeps nested detached marks safe', () => {
    document.body.innerHTML = '<article><p id="content"></p></article>';
    const paragraph = document.getElementById('content');
    if (!paragraph) {
      throw new Error('paragraph missing');
    }
    const range = document.createRange();
    range.setStart(paragraph, 0);
    range.setEnd(paragraph, 0);
    const wrappers = (
      manager as unknown as { createHighlightWrappers: (range: Range, id: string) => HTMLElement[] }
    ).createHighlightWrappers(range, 'blank');
    expect(wrappers).toEqual([]);

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    const nested = document.createElement('mark');
    nested.className = 'aiob-reader-highlight';
    nested.textContent = 'nested';
    wrapper.appendChild(nested);
    nested.remove();
    expect(() =>
      (
        manager as unknown as { flattenNestedHighlightMarks: (wrapper: HTMLElement) => void }
      ).flattenNestedHighlightMarks(wrapper)
    ).not.toThrow();
  });

  it('keeps split segments when merge extract fails and assigns metadata roles across segments', () => {
    document.body.innerHTML =
      '<article><p><span id="a">One</span><span id="b">Two</span><span id="c">Three</span></p></article>';
    const a = document.createElement('mark');
    a.className = 'aiob-reader-highlight';
    a.textContent = 'One';
    const b = document.createElement('mark');
    b.className = 'aiob-reader-highlight';
    b.textContent = 'Two';
    const c = document.createElement('mark');
    c.className = 'aiob-reader-highlight';
    c.textContent = 'Three';
    document.getElementById('a')?.replaceChildren(a);
    document.getElementById('b')?.replaceChildren(b);
    document.getElementById('c')?.replaceChildren(c);

    const extractSpy = vi.spyOn(Range.prototype, 'extractContents').mockImplementationOnce(() => {
      throw new Error('extract failed');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const merged = (
      manager as unknown as {
        mergeWrapperSegments: (segments: HTMLElement[], id: string) => HTMLElement[];
      }
    ).mergeWrapperSegments([a, b, c], 'merge-id');
    expect(merged).toEqual([a, b, c]);

    const highlight = {
      id: 'roles',
      selectedHtml: '<p>One Two Three</p>',
      selectedText: 'One Two Three',
      comment: '',
      fragmentUrl: '#roles',
      wrapper: a,
      wrapperSegments: [a, b, c],
      createdAt: Date.now()
    };
    manager.assignFootnote(highlight as never, ' note ', 7);
    expect(a.dataset.readerSegmentRole).toBe('start');
    expect(b.dataset.readerSegmentRole).toBe('middle');
    expect(c.dataset.readerSegmentRole).toBe('end');
    expect(a.dataset.readerFootnote).toBeUndefined();
    expect(c.dataset.readerFootnote).toBe('7');
    extractSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('returns null when wrapper creation falls through select, surround, and empty extract paths', () => {
    document.body.innerHTML = '<article><p id="content">Fallback text</p></article>';
    const textNode = document.getElementById('content')?.firstChild;
    if (!textNode) {
      throw new Error('text node missing');
    }

    const range = createRangeForWholeNode(textNode);
    const selectSpy = vi.spyOn(Range.prototype, 'selectNodeContents').mockImplementationOnce(() => {
      throw new Error('select failed');
    });
    const surroundSpy = vi.spyOn(Range.prototype, 'surroundContents').mockImplementationOnce(() => {
      throw new Error('surround failed');
    });
    const extractSpy = vi
      .spyOn(Range.prototype, 'extractContents')
      .mockImplementationOnce(() => document.createDocumentFragment());

    const highlight = manager.createHighlight({
      id: 'empty-fallback',
      range,
      selectedHtml: '<p>Fallback text</p>',
      selectedText: 'Fallback text',
      comment: '',
      fragmentUrl: '#empty-fallback'
    });

    expect(highlight).toBeNull();
    selectSpy.mockRestore();
    surroundSpy.mockRestore();
    extractSpy.mockRestore();
  });

  it('keeps sort stable when two highlights share the same wrapper', () => {
    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    document.body.appendChild(wrapper);
    const list = [
      {
        id: 'b',
        wrapper,
        wrapperSegments: [wrapper],
        selectedHtml: '',
        selectedText: '',
        comment: '',
        fragmentUrl: '#b',
        createdAt: 1
      },
      {
        id: 'a',
        wrapper,
        wrapperSegments: [wrapper],
        selectedHtml: '',
        selectedText: '',
        comment: '',
        fragmentUrl: '#a',
        createdAt: 1
      }
    ];

    manager.sortByDocumentOrder(list as never);
    expect(list.map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('returns disconnected segments unchanged when merge spans different block containers', () => {
    const firstBlock = document.createElement('p');
    const secondBlock = document.createElement('p');
    const first = document.createElement('mark');
    const second = document.createElement('mark');
    first.className = 'aiob-reader-highlight';
    second.className = 'aiob-reader-highlight';
    firstBlock.appendChild(first);
    secondBlock.appendChild(second);
    document.body.append(firstBlock, secondBlock);

    const merged = (
      manager as unknown as {
        mergeWrapperSegments: (segments: HTMLElement[], id: string) => HTMLElement[];
      }
    ).mergeWrapperSegments([first, second], 'cross-block');

    expect(merged).toEqual([first, second]);
  });

  it('keeps detached wrappers flattened safely and preserves document order for disconnected pairs', () => {
    const detachedA = document.createElement('mark');
    const detachedB = document.createElement('mark');
    detachedA.className = 'aiob-reader-highlight';
    detachedB.className = 'aiob-reader-highlight';

    const list = [
      {
        id: 'left',
        wrapper: detachedA,
        wrapperSegments: [detachedA],
        selectedHtml: '',
        selectedText: '',
        comment: '',
        fragmentUrl: '#left',
        createdAt: 1
      },
      {
        id: 'right',
        wrapper: detachedB,
        wrapperSegments: [detachedB],
        selectedHtml: '',
        selectedText: '',
        comment: '',
        fragmentUrl: '#right',
        createdAt: 1
      }
    ];

    manager.sortByDocumentOrder(list as never);
    expect(list.map((item) => item.id)).toEqual(['left', 'right']);

    const wrapper = document.createElement('mark');
    wrapper.className = 'aiob-reader-highlight';
    const nested = document.createElement('mark');
    nested.className = 'aiob-reader-highlight';
    nested.append('inner');
    wrapper.append('outer ', nested);
    nested.remove();

    expect(() =>
      (
        manager as unknown as { flattenNestedHighlightMarks: (wrapper: HTMLElement) => void }
      ).flattenNestedHighlightMarks(wrapper)
    ).not.toThrow();
  });

  it('falls back to selected text when reconstructed detached text is shorter than original', () => {
    const first = document.createElement('mark');
    const second = document.createElement('mark');
    first.className = 'aiob-reader-highlight';
    second.className = 'aiob-reader-highlight';
    first.dataset.segmentIndex = '0';
    second.dataset.segmentIndex = '1';
    first.textContent = 'A';
    second.textContent = 'B';
    document.body.append(first, second);

    const text = manager.reconstructText({
      id: 'short-reconstruct',
      selectedHtml: '<p>Alphabet</p>',
      selectedText: 'Alphabet',
      comment: '',
      fragmentUrl: '#short-reconstruct',
      wrapper: first,
      wrapperSegments: [first, second],
      createdAt: Date.now()
    } as never);

    expect(text).toBe('Alphabet');
  });

  it('returns original connected segments when merge extraction throws', () => {
    const block = document.createElement('p');
    const first = document.createElement('mark');
    const second = document.createElement('mark');
    first.className = 'aiob-reader-highlight';
    second.className = 'aiob-reader-highlight';
    first.textContent = 'Alpha';
    second.textContent = 'Beta';
    block.append(first, second);
    document.body.appendChild(block);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const extractSpy = vi.spyOn(Range.prototype, 'extractContents').mockImplementationOnce(() => {
      throw new Error('merge failed');
    });

    const merged = (
      manager as unknown as {
        mergeWrapperSegments: (segments: HTMLElement[], id: string) => HTMLElement[];
      }
    ).mergeWrapperSegments([first, second], 'merge-fail');

    expect(merged).toEqual([first, second]);
    expect(warnSpy).toHaveBeenCalledWith(
      '[ReaderHighlightManager] Failed to merge highlight segments:',
      expect.any(Error)
    );
    extractSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
