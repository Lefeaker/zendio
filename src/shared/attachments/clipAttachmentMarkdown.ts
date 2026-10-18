type Range = { start: number; end: number };
export type AttachmentInlineBlock = Range & {
  contentStarts: Map<number, number>;
  referenceStarts: Set<number>;
};
type Container = { kind: 'quote' } | { kind: 'list'; indent: number };
type Fence = { character: string; length: number };

const QUOTE = /^ {0,3}> ?/u;
const LIST = /^( {0,3})([-+*]|\d{1,9}[.)])( +|$)/u;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/u;
const HEADING = /^ {0,3}#{1,6}(?: |$)/u;
const THEMATIC = /^ {0,3}(?:(?:\* *){3,}|(?:_ *){3,}|(?:- *){3,})$/u;
const SETEXT = /^ {0,3}(?:=+|-+) *$/u;
const HTML_BLOCK =
  /^ {0,3}<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?: |\/?>|$)/iu;
// CommonMark §6.6: the same complete tag token bounds type-7 blocks and inline tags.
const HTML_TAG =
  /(?:<[A-Za-z][A-Za-z\d-]*(?:[ \t\r\n]+[A-Za-z_:][A-Za-z\d_.:-]*(?:[ \t\r\n]*=[ \t\r\n]*(?:[^ \t\r\n"'=<>`]+|'[^']*'|"[^"]*"))?)*[ \t\r\n]*\/?>|<\/[A-Za-z][A-Za-z\d-]*[ \t\r\n]*>)/uy;
const BLANK = /^ *$/u; // Tabs have already been expanded; NBSP is paragraph text.

function attachmentHtmlTagEnd(markdown: string, start: number): number | undefined {
  HTML_TAG.lastIndex = start;
  return HTML_TAG.exec(markdown) ? HTML_TAG.lastIndex : undefined;
}

/** Called in source order; cache terminators so unclosed HTML cannot rescan a block. */
export function attachmentRawHtmlEnd(
  markdown: string,
  start: number,
  limit: number,
  closers: Map<string, number>
): number | undefined {
  if (markdown.startsWith('<!-->', start)) return start + 5;
  if (markdown.startsWith('<!--->', start)) return start + 6;
  const token = markdown.startsWith('<!--', start)
    ? ['<!--', '-->']
    : markdown.startsWith('<?', start)
      ? ['<?', '?>']
      : markdown.startsWith('<![CDATA[', start)
        ? ['<![CDATA[', ']]>']
        : /^<![A-Za-z]/u.test(markdown.slice(start, start + 3))
          ? ['<!', '>']
          : undefined;
  if (!token) {
    const end = attachmentHtmlTagEnd(markdown.slice(start, limit), 0);
    return end === undefined ? undefined : start + end;
  }
  const from = start + token[0].length;
  let close = closers.get(token[1]);
  if (close === undefined || (close !== -1 && close < from)) {
    const relative = markdown.slice(from, limit).indexOf(token[1]);
    close = relative === -1 ? -1 : from + relative;
    closers.set(token[1], close);
  }
  return close === -1 ? undefined : close + token[1].length;
}

function expandTabs(line: string): string {
  let added = 0;
  return line.replace(/\t/gu, (_tab, offset: number) => {
    const spaces = 4 - ((offset + added) % 4);
    added += spaces - 1;
    return ' '.repeat(spaces);
  });
}

function sourceColumn(line: string, column: number): number {
  let index = 0;
  for (let width = 0; width < column && index < line.length; index++) {
    width += line[index] === '\t' ? 4 - (width % 4) : 1;
  }
  return index;
}

function opensFence(line: string): Fence | undefined {
  const match = FENCE.exec(line);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return undefined;
  return { character: match[1][0], length: match[1].length };
}

function htmlEnd(line: string, paragraph: boolean): RegExp | undefined {
  const raw = /^ {0,3}<(pre|script|style|textarea)(?: |>|$)/iu.exec(line);
  if (raw) return /<\/(?:pre|script|style|textarea)>/iu;
  if (/^ {0,3}<!--/u.test(line)) return /-->/u;
  if (/^ {0,3}<\?/u.test(line)) return /\?>/u;
  if (/^ {0,3}<!\[CDATA\[/u.test(line)) return /\]\]>/u;
  if (/^ {0,3}<![A-Za-z]/u.test(line)) return />/u;
  if (HTML_BLOCK.test(line)) return BLANK;
  // A standalone HTML tag starts a raw block, but cannot interrupt a paragraph.
  if (!paragraph && !/^ {0,3}<(?:pre|script|style|textarea)(?:[ />]|$)/iu.test(line)) {
    const start = /^ {0,3}(?=<)/u.exec(line)?.[0].length;
    const end = start === undefined ? undefined : attachmentHtmlTagEnd(line, start);
    if (end !== undefined && BLANK.test(line.slice(end))) return BLANK;
  }
  return undefined;
}

function interruptsParagraph(line: string): boolean {
  return Boolean(
    QUOTE.test(line) ||
    /^ {0,3}(?:[-+*]|1[.)]) +[^ ]/u.test(line) ||
    HEADING.test(line) ||
    THEMATIC.test(line) ||
    opensFence(line) ||
    htmlEnd(line, true)
  );
}

// Index the final marker run once: nested lists must not rescan every suffix.
function thematicTail(line: string): Range {
  let marker = '';
  let count = 0;
  const range = { start: line.length, end: -1 };
  for (let index = line.length - 1; index >= 0; index--) {
    const character = line[index];
    if (character === ' ') continue;
    marker ||= character;
    if (!/[*_-]/u.test(marker) || character !== marker) break;
    range.start = index;
    if (++count === 3) range.end = index;
  }
  return range;
}

/**
 * Source ranges where Markdown inlines can occur, without rendering/reformatting.
 * Tracks only the block boundaries needed by attachment destinations (CommonMark
 * 0.31.2 §§4–5). List/quote prefixes affect indentation, never the returned bytes.
 */
export function* attachmentInlineBlocks(markdown: string): Generator<AttachmentInlineBlock> {
  const containers: Container[] = [];
  let fence: Fence | undefined;
  let html: RegExp | undefined;
  let block: AttachmentInlineBlock | undefined;
  let start = 0;
  for (const match of markdown.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/gu)) {
    if (!match[0]) break;
    const end = start + match[0].length;
    const line = expandTabs(match[0].replace(/[\r\n]+$/u, ''));
    const thematic = thematicTail(line);
    let offset = 0;
    let matched = 0;
    for (const container of containers) {
      const rest = line.slice(offset);
      if (container.kind === 'quote') {
        const quote = QUOTE.exec(rest);
        if (!quote) break;
        offset += quote[0].length;
      } else if (rest.startsWith(' '.repeat(container.indent))) {
        offset += container.indent;
      } else if (!BLANK.test(rest)) break;
      matched++;
    }
    // A marker at an unmatched item starts another item, including non-1 numbers
    // and empty items. Only a new list inside a paragraph needs the stricter rule.
    const nextListItem = containers[matched]?.kind === 'list' && LIST.test(line.slice(offset));
    const lazy =
      matched < containers.length &&
      !nextListItem &&
      block &&
      !BLANK.test(line.slice(offset)) &&
      !interruptsParagraph(line.slice(offset));
    let boundary = false;
    if (matched < containers.length && !lazy) {
      containers.length = matched;
      fence = undefined;
      html = undefined;
      boundary = true;
    }
    if (!fence && !html && !lazy) {
      while (offset < line.length) {
        const rest = line.slice(offset);
        const quote = QUOTE.exec(rest);
        const prefix = /^ {0,3}[^ ]/u.exec(rest);
        const marker = prefix ? offset + prefix[0].length - 1 : -1;
        const list = !(marker >= thematic.start && marker <= thematic.end) && LIST.exec(rest);
        if (quote) {
          containers.push({ kind: 'quote' });
          offset += quote[0].length;
        } else if (
          list &&
          (!block ||
            boundary ||
            (list[0].length < rest.length && (!/\d/u.test(list[2]) || /^1[.)]$/u.test(list[2]))))
        ) {
          const padding = list[3].length > 4 ? 1 : Math.max(1, list[3].length);
          const indent = list[1].length + list[2].length + padding;
          containers.push({ kind: 'list', indent });
          offset += indent;
        } else break;
        boundary = true;
      }
    }
    const content = line.slice(offset);
    const blank = BLANK.test(content);
    let literal = false;
    if (fence) {
      literal = true;
      const close = FENCE.exec(content);
      if (
        close &&
        close[1][0] === fence.character &&
        close[1].length >= fence.length &&
        BLANK.test(close[2])
      ) {
        fence = undefined;
      }
    } else if (html) {
      literal = true;
      if (html.test(content)) html = undefined;
    } else if (/^ {4}/u.test(content) && (!block || boundary)) {
      literal = true;
    } else {
      fence = opensFence(content);
      html = htmlEnd(content, Boolean(block && !boundary));
      literal = Boolean(fence || html);
      if (html?.test(content)) html = undefined;
    }
    const heading = HEADING.test(content);
    const separator = THEMATIC.test(content) || (Boolean(block) && SETEXT.test(content));
    if (block && (boundary || literal || blank || heading || separator)) {
      yield block;
      block = undefined;
    }
    if (!literal && !blank && !separator) {
      const current = block ?? {
        start,
        end,
        contentStarts: new Map<number, number>(),
        referenceStarts: new Set<number>()
      };
      current.end = end;
      current.contentStarts.set(start, start + sourceColumn(match[0], offset));
      const reference = !heading && /^ {0,3}(?=\[)/u.exec(content);
      if (reference) {
        current.referenceStarts.add(start + sourceColumn(match[0], offset + reference[0].length));
      }
      if (heading) yield current;
      else block = current;
    }
    start = end;
  }
  if (block) yield block;
}

/** Index delimiter runs once; unclosed runs must not repeatedly scan a long block. */
export function attachmentCodeSpanEnds(markdown: string, block: Range): Map<number, number> {
  const runs: Range[] = [];
  for (let index = block.start; index < block.end; index++) {
    if (markdown[index] !== '`') continue;
    const start = index;
    while (markdown[index] === '`' && index < block.end) index++;
    runs.push({ start, end: index });
    index--;
  }
  const next = new Map<number, number>();
  const ends = new Map<number, number>();
  for (let index = runs.length - 1; index >= 0; index--) {
    const run = runs[index];
    const length = run.end - run.start;
    const end = next.get(length);
    if (end !== undefined) ends.set(run.start, end);
    // An escaped first backtick leaves the remaining run available as an opener.
    const shorter = next.get(length - 1);
    if (length > 1 && shorter !== undefined) ends.set(run.start + 1, shorter);
    next.set(length, run.end);
  }
  return ends;
}
