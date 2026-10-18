import type { AttachmentInlineBlock } from './clipAttachmentMarkdown';

export const ATTACHMENT_ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/u;
const URI_SCHEME = /^[A-Za-z][A-Za-z\d+.-]{1,31}:/u;
const EMAIL =
  /^[A-Za-z\d.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z\d](?:[A-Za-z\d-]{0,61}[A-Za-z\d])?(?:\.[A-Za-z\d](?:[A-Za-z\d-]{0,61}[A-Za-z\d])?)*$/u;

function normalizeLabel(label: string): string {
  // Default Unicode caseless matching; dotless i must not merge with ASCII I.
  // CommonMark §6.3 folds whitespace but does not decode escapes or entities.
  return label
    .replace(/^[ \t\r\n]+|[ \t\r\n]+$/gu, '')
    .replace(/[ \t\r\n]+/gu, ' ')
    .replace(/[^\u0131]+/gu, (part) => part.toLowerCase().toUpperCase());
}

/**
 * Source-only CommonMark link grammar. Index suffix endpoints once per block:
 * overlapping invalid links must not repeatedly scan the remaining document.
 */
export class AttachmentLinkSyntax {
  readonly escaped = new Set<number>();
  private readonly bareEnds: Int32Array;
  private readonly tokenEnds = new Map<number, number>();
  private readonly autolinkEnds = new Map<number, number>();

  constructor(
    private readonly markdown: string,
    private readonly block: AttachmentInlineBlock
  ) {
    const { start, end } = block;
    this.bareEnds = new Int32Array(end - start + 1);
    this.bareEnds[end - start] = end;
    for (let index = start; index < end; index++) {
      if (markdown[index] === '\\' && ATTACHMENT_ESCAPABLE.test(markdown[index + 1] ?? '')) {
        this.escaped.add(++index);
      }
    }
    const quotes = new Map<string, number>();
    let angle = end;
    let parenthesis = end;
    let autolink = end;
    for (let index = end - 1; index >= start; index--) {
      const character = markdown[index];
      const code = character.charCodeAt(0);
      const controlOrSpace = code <= 0x20 || code === 0x7f;
      let bareEnd = this.bareEnds[index + 1 - start];
      if (character === '\\' && this.escaped.has(index + 1)) {
        bareEnd = this.bareEnds[index + 2 - start];
      } else if (controlOrSpace || character === ')') {
        bareEnd = index;
      } else if (character === '(') {
        bareEnd =
          bareEnd >= 0 && markdown[bareEnd] === ')' ? this.bareEnds[bareEnd + 1 - start] : -1;
      }
      this.bareEnds[index - start] = bareEnd;
      if (!this.escaped.has(index)) {
        if (character === '"' || character === "'") {
          const close = quotes.get(character);
          if (close !== undefined) this.tokenEnds.set(index, close + 1);
          quotes.set(character, index);
        } else if (character === '(' || character === ')') {
          if (character === '(' && markdown[parenthesis] === ')') {
            this.tokenEnds.set(index, parenthesis + 1);
          }
          parenthesis = index;
        }
        if (/[<>\r\n]/u.test(character)) {
          if (character === '<' && markdown[angle] === '>') this.tokenEnds.set(index, angle + 1);
          angle = index;
        }
      }
      // Backslash escapes do not apply inside autolinks.
      if (controlOrSpace || character === '<' || character === '>') {
        if (character === '<' && markdown[autolink] === '>') {
          this.autolinkEnds.set(index, autolink + 1);
        }
        autolink = index;
      }
    }
  }

  autolinkEnd(start: number): number | undefined {
    const end = this.autolinkEnds.get(start);
    if (end === undefined) return undefined;
    const scheme = URI_SCHEME.test(this.markdown.slice(start + 1, Math.min(end - 1, start + 34)));
    return scheme || EMAIL.test(this.markdown.slice(start + 1, end - 1)) ? end : undefined;
  }

  inlineEnd(start: number): number | undefined {
    if (this.markdown[start] !== '(') return undefined;
    const destinationStart = this.spaceEnd(start + 1);
    if (this.markdown[destinationStart] === ')') return destinationStart + 1;
    const destinationEnd = this.destinationEnd(destinationStart);
    if (destinationEnd === undefined) return undefined;
    const titleStart = this.spaceEnd(destinationEnd);
    if (this.markdown[titleStart] === ')') return titleStart + 1;
    if (titleStart === destinationEnd) return undefined;
    const titleEnd = this.titleEnd(titleStart);
    if (titleEnd === undefined) return undefined;
    const close = this.spaceEnd(titleEnd);
    return this.markdown[close] === ')' ? close + 1 : undefined;
  }

  /** Only consecutive definitions at the start of a paragraph are block syntax. */
  definitionsEnd(references: Set<string>): number {
    let index = this.block.start;
    while (index < this.block.end) {
      const start = this.spaceEnd(this.block.contentStarts.get(index) ?? index, false);
      if (!this.block.referenceStarts.has(start)) break;
      const definition = this.definition(start);
      if (definition === undefined) break;
      references.add(definition.label);
      index = definition.end;
    }
    return index;
  }

  referenceEnd(open: number, close: number, references: ReadonlySet<string>): number | undefined {
    if (references.size === 0) return undefined;
    const suffix = this.label(close + 1);
    const collapsed = this.markdown.startsWith('[]', close + 1);
    if (suffix && !collapsed) return references.has(suffix.label) ? suffix.end : undefined;
    const label = this.label(open);
    return label?.end === close + 1 && references.has(label.label)
      ? close + (collapsed ? 3 : 1)
      : undefined;
  }

  private destinationEnd(start: number): number | undefined {
    if (this.markdown[start] === '<') return this.tokenEnds.get(start);
    const end = this.bareEnds[start - this.block.start];
    return end > start ? end : undefined;
  }

  private titleEnd(start: number): number | undefined {
    return /["'(]/u.test(this.markdown[start] ?? '') ? this.tokenEnds.get(start) : undefined;
  }

  private nextLine(index: number): number {
    return index + (this.markdown.startsWith('\r\n', index) ? 2 : 1);
  }

  private spaceEnd(start: number, newline = true): number {
    let index = start;
    while (index < this.block.end) {
      const character = this.markdown[index];
      if (character === ' ' || character === '\t') index++;
      else if (newline && /[\r\n]/u.test(character)) {
        index = this.nextLine(index);
        index = this.block.contentStarts.get(index) ?? index;
        newline = false;
      } else break;
    }
    return index;
  }

  private lineEnd(start: number): number | undefined {
    const index = this.spaceEnd(start, false);
    if (index === this.block.end) return index;
    return /[\r\n]/u.test(this.markdown[index]) ? this.nextLine(index) : undefined;
  }

  private label(start: number): { end: number; label: string } | undefined {
    if (this.markdown[start] !== '[') return undefined;
    let index = start + 1;
    let length = 0;
    let raw = '';
    for (; index < this.block.end && length <= 999; index++, length++) {
      const character = this.markdown[index];
      if (character === ']') break;
      if (character === '[') return undefined;
      raw += character;
      if (character === '\\' && this.escaped.has(index + 1)) {
        raw += this.markdown[++index];
        length++;
      } else if (/[\r\n]/u.test(character)) {
        index = this.nextLine(index);
        index = (this.block.contentStarts.get(index) ?? index) - 1;
      } else if ((this.markdown.codePointAt(index) ?? 0) > 0xffff) raw += this.markdown[++index];
    }
    return length <= 999 && this.markdown[index] === ']'
      ? { end: index + 1, label: normalizeLabel(raw) }
      : undefined;
  }

  private definition(start: number): { end: number; label: string } | undefined {
    const label = this.label(start);
    if (!label?.label || this.markdown[label.end] !== ':') return undefined;
    const destinationEnd = this.destinationEnd(this.spaceEnd(label.end + 1));
    if (destinationEnd === undefined) return undefined;
    const withoutTitle = this.lineEnd(destinationEnd);
    const titleStart = this.spaceEnd(destinationEnd);
    const titleEnd = titleStart > destinationEnd ? this.titleEnd(titleStart) : undefined;
    // A failed next-line title leaves the preceding destination-only definition.
    const end = (titleEnd === undefined ? undefined : this.lineEnd(titleEnd)) ?? withoutTitle;
    return end === undefined ? undefined : { end, label: label.label };
  }
}
