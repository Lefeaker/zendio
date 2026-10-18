import { describe, expect, it } from 'vitest';
import {
  hasUnresolvedClipAttachmentReferences,
  replaceClipAttachmentReferences
} from '../../../src/shared/attachments/clipAttachmentReferences';

const marker = '![Screenshot](aiob-attachment:a)';
const attachment = { id: 'a', markdownUrl: 'assets/frame.jpg' };
const rendered = '![Screenshot](assets/frame.jpg)';

// Independent grammar examples: CommonMark 0.31.2 §§4.7, 6.3–6.5.
// The expected source is deliberately not produced by a Markdown parser/renderer.
const literalLinks: [string, string][] = [
  ['URI autolink', `<https://example.com/${marker}>`],
  ['non-HTTP URI autolink', `<ab+.-12:${marker}>`],
  ['autolink does not interpret escapes', `<https://example.com/\\${marker}>`],
  ['ordinary link title', `[documentation](https://example.com "${marker}")`],
  ['image title', `![documentation](https://example.com '${marker}')`],
  ['bare destination', `[documentation](https://example.com/${marker})`],
  ['nested destination parentheses', `[documentation](https://example.com/(((${marker}))))`],
  ['angle destination', `[documentation](<https://example.com/${marker}>)`],
  ['angle destination with spaces', `[documentation](<some path ${marker}>)`],
  ['escaped angle bracket', `[documentation](<some\\>path${marker}>)`],
  ['escaped title delimiter', `[documentation](/url "a\\" ${marker}")`],
  ['escaped destination parentheses', `[documentation](url\\(x\\) "${marker}")`],
  ['multiline title', `[documentation](/url "first\n${marker}\nlast")`],
  ['multiline separators', `[documentation](\n/url\n"${marker}"\n)`],
  ['quoted multiline separators', `> [documentation](\n> /url\n> "${marker}"\n> )`],
  ['listed multiline title', `10) [documentation](/url\n    "${marker}")`],
  ['nested quote/list title', `> 1. [documentation](/url\n>    "${marker}")`],
  ['reference title', `[documentation]: https://example.com "${marker}"`],
  ['reference single-quoted title', `[documentation]: /url '${marker}'`],
  ['reference destination', `[documentation]: https://example.com/${marker}`],
  ['reference angle destination', `[documentation]: <some path ${marker}>`],
  ['reference title on following line', `[documentation]: /url\n  "${marker}"`],
  ['reference all components multiline', `[documentation]:\n /url\n "first\n${marker}\nlast"`],
  ['quoted reference', `> [documentation]:\n> /url\n> "${marker}"`],
  ['listed reference', `2) [documentation]:\n   /url\n   "${marker}"`],
  ['consecutive definitions', `[first]: /first\n[second]: /url "${marker}"`],
  ['multiline reference label', `[a\nb]: /url "${marker}"`],
  ['escaped reference label', `[a\\]b]: /url "${marker}"`],
  ['reference after heading', `# heading\n[documentation]: /url "${marker}"`],
  ['image label can contain a link', `![[inner](/url)](/url "${marker}")`],
  ['link label can contain an image', `[![inner](/url)](/url "${marker}")`],
  ['image label can contain an autolink', `![<https://example.com>](/url "${marker}")`],
  ['explicit empty destination with title', `[link](<> "title ${marker}")`],
  ['image label with reference link', `![[ref]](/url "${marker}")\n\n[ref]: /x`],
  ['link label with reference image', `[![image][ref]](/url "${marker}")\n\n[ref]: /x`]
];

describe('attachment literals inside complete Markdown links', () => {
  it.each(literalLinks)(
    'preserves %s and recognizes the adjacent real destination',
    (_name, source) => {
      expect(hasUnresolvedClipAttachmentReferences(source, [])).toBe(false);
      expect(hasUnresolvedClipAttachmentReferences(source, [attachment])).toBe(false);
      expect(replaceClipAttachmentReferences(source, [attachment])).toBe(source);
      expect(hasUnresolvedClipAttachmentReferences(`${source}\n\n${marker}`, [])).toBe(true);
      expect(replaceClipAttachmentReferences(`${source}\n\n${marker}`, [attachment])).toBe(
        `${source}\n\n${rendered}`
      );
    }
  );
});

const incompleteLinks: [string, string][] = [
  ['unclosed autolink', `<https://example.com/${marker}`],
  ['autolink with a space', `<https://example.com/ ${marker}>`],
  ['one-letter scheme', `<x:${marker}>`],
  ['overlong scheme', `<${'a'.repeat(33)}:${marker}>`],
  ['unclosed outer link', `[documentation](/url "${marker}"`],
  ['unclosed title', `[documentation](/url "${marker})`],
  ['unclosed angle destination', `[documentation](<https://example.com/${marker})`],
  ['newline in angle destination', `[documentation](<url\n${marker}>)`],
  ['unbalanced destination', `[documentation](url( ${marker})`],
  ['invalid nested parentheses in title', `[documentation](/url (title ${marker}))`],
  ['blank line ends title', `[documentation](/url "first\n\n${marker}")`],
  ['sibling list item ends title', `1. [documentation](/url "first\n2. ${marker}")`],
  ['reference cannot interrupt paragraph', `paragraph\n[documentation]: /url "${marker}"`],
  ['heading cannot contain a definition', `# [documentation]: /url "${marker}"`],
  ['invalid reference tail', `[documentation]: /url "${marker}" trailing`],
  ['invalid next-line title remains prose', `[documentation]: /url\n"${marker}" trailing`],
  ['unclosed reference title remains prose', `[documentation]: /url "${marker}`],
  ['invalid reference label', `[a[b]]: /url "${marker}"`],
  ['overlong reference label', `[${'a'.repeat(1000)}]: /url "${marker}"`],
  ['blank reference label', `[ \t ]: /url "${marker}"`],
  ['inner link invalidates outer link', `[[inner](/url)](/url "${marker}")`],
  ['autolink invalidates outer link', `[<https://example.com>](/url "${marker}")`],
  ['omitted destination is not a title fallback', `[link]( "title ${marker}")`]
];

describe('invalid link syntax does not conceal attachment destinations', () => {
  it.each(incompleteLinks)('retains missing-reference validation after %s', (_name, source) => {
    expect(hasUnresolvedClipAttachmentReferences(source, [])).toBe(true);
    expect(replaceClipAttachmentReferences(source, [attachment])).toBe(
      source.replace(marker, rendered)
    );
  });

  it('preserves original CRLF and container bytes when replacing only the adjacent marker', () => {
    const literal = `> [link](\r\n> /url\r\n> "${marker}"\r\n> )`;
    expect(replaceClipAttachmentReferences(`${literal}\r\n\r\n${marker}`, [attachment])).toBe(
      `${literal}\r\n\r\n${rendered}`
    );
  });

  it('keeps complete producer IDs authoritative over ordinary destination grammar', () => {
    const ids = ['a', 'ab', 'a)b', 'a.*$[x] 中文', 'a\\)', 'a\nb'];
    const attachments = ids.map((id, index) => ({ id, markdownUrl: `assets/${index}.jpg` }));
    const source = ids.map((id) => `![shot](aiob-attachment:${id})`).join('\n\n');
    expect(hasUnresolvedClipAttachmentReferences(source, attachments)).toBe(false);
    expect(replaceClipAttachmentReferences(source, attachments)).toBe(
      attachments.map(({ markdownUrl }) => `![shot](${markdownUrl})`).join('\n\n')
    );
  });

  it('handles many overlapping invalid destinations and titles without losing the final live marker', () => {
    const source = `${'[x](url('.repeat(1500)} ${'[x](/url "'.repeat(1500)} ${marker}`;
    expect(hasUnresolvedClipAttachmentReferences(source, [])).toBe(true);
    expect(replaceClipAttachmentReferences(source, [attachment])).toBe(
      source.replace(marker, rendered)
    );
  });
});

describe('reference links participate in the same nesting boundary', () => {
  it.each([
    ['shortcut', '[ref]', '[ref]'],
    ['collapsed', '[ref][]', '[ref]'],
    ['full', '[text][ref]', '[ref]'],
    ['Unicode full case fold', '[ẞ]', '[SS]'],
    ['case fold expansion', '[ﬀ]', '[FF]'],
    ['whitespace folding', '[ A\t B ]', '[a b]'],
    ['multiline folding', '[A\n B]', '[a b]'],
    ['escaped labels match raw spelling', '[a\\!]', '[A\\!]'],
    ['quoted definition', '[ref]', '> [ref]'],
    ['listed definition', '[ref]', '2) [ref]']
  ])(
    'exposes the real marker after an outer link invalidated by a %s link',
    (_name, inner, definition) => {
      const link = `[outer ${inner}](/url "${marker}")`;
      const definitionBlock = `${definition}: /ref`;
      // The definition-only block must participate both before and after the marker block.
      for (const source of [
        `${link}\n\nordinary prose\n\n${definitionBlock}`,
        `${definitionBlock}\n\nordinary prose\n\n${link}`
      ]) {
        expect(hasUnresolvedClipAttachmentReferences(source, [])).toBe(true);
        expect(replaceClipAttachmentReferences(source, [attachment])).toBe(
          source.replace(marker, rendered)
        );
      }
    }
  );

  it.each([
    ['undefined reference', '[ref]', '[other]'],
    ['dotless i is distinct', '[ı]', '[I]'],
    ['escapes are not unescaped for matching', '[a\\!]', '[a!]'],
    ['entities are not decoded for matching', '[a&amp;]', '[a&]'],
    ['internal NBSP is not a separator', '[a\u00a0b]', '[a b]'],
    ['leading NBSP is not trimmed', '[\u00a0a]', '[a]'],
    ['unmatched explicit label cannot use shortcut', '[ref][missing]', '[ref]']
  ])('retains the valid outer link for %s', (_name, inner, definition) => {
    const source = `[outer ${inner}](/url "${marker}")\n\n${definition}: /ref`;
    expect(hasUnresolvedClipAttachmentReferences(source, [])).toBe(false);
    expect(replaceClipAttachmentReferences(source, [attachment])).toBe(source);
  });
});
