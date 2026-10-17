import { describe, expect, it } from 'vitest';
import {
  hasUnresolvedClipAttachmentReferences,
  replaceClipAttachmentReferences
} from '../../../src/shared/attachments/clipAttachmentReferences';

const marker = '![Screenshot](aiob-attachment:a)';
const reference = { id: 'a', markdownUrl: 'assets/frame.jpg' };
const rendered = '![Screenshot](assets/frame.jpg)';

// CommonMark 0.31.2 §§2.4, 4.4–4.6, 5, 6.1: literal boundaries, not HTML rendering.
const literalExamples: [string, string][] = [
  ['backtick fence', `\`\`\`markdown\n${marker}\n\`\`\``],
  ['tilde fence', `~~~markdown\n${marker}\n~~~`],
  ['longer closing fence', `\`\`\`\n${marker}\n\`\`\`\`\``],
  ['short fence cannot close', `\`\`\`\`\n\`\`\`\n${marker}\n\`\`\`\``],
  ['wrong fence cannot close', `~~~\n\`\`\`\n${marker}\n~~~`],
  ['unclosed fence', `\`\`\`markdown\n${marker}`],
  ['indented fence', `   ~~~\n${marker}\n   ~~~`],
  ['fence closing text is content', `~~~\n~~~ still code\n${marker}\n~~~`],
  ['fence interrupts paragraph', `Introduction\n~~~\n${marker}\n~~~`],
  ['quote fence', `> ~~~\n> ${marker}\n> ~~~`],
  ['nested quote fence', `>> \`\`\`\n>> ${marker}\n>> \`\`\``],
  ['list fence', `- ~~~\n  ${marker}\n  ~~~`],
  ['ordered list fence', `10) ~~~\n    ${marker}\n    ~~~`],
  ['second ordered item tilde fence', `1. Intro\n2. ~~~markdown\n   ${marker}\n   ~~~`],
  ['second ordered item backtick fence', `1. Intro\n2. \`\`\`markdown\n   ${marker}\n   \`\`\``],
  ['second ordered item longer closer', `1. Intro\n2. \`\`\`markdown\n   ${marker}\n   \`\`\`\``],
  ['second ordered item unclosed fence', `1. Intro\n2. \`\`\`markdown\n   ${marker}`],
  ['parenthesized later item fence', `9) Intro\n10) ~~~\n    ${marker}\n    ~~~`],
  ['quoted later item fence', `> 1. Intro\n> 2. ~~~\n>    ${marker}\n>    ~~~`],
  ['nested later item fence', `- 1. Intro\n  2. ~~~\n     ${marker}\n     ~~~`],
  ['nested list quote fence', `- > 1. ~~~\n  >    ${marker}\n  >    ~~~`],
  ['indented code', `    ${marker}`],
  ['tab indented code', `\t${marker}`],
  ['code after blank paragraph', `Intro\n\n    ${marker}`],
  ['code after heading', `# Heading\n    ${marker}`],
  ['code after setext heading', `Heading\n---\n    ${marker}`],
  ['quote indented code', `>     ${marker}`],
  ['list indented code', `- Item\n\n      ${marker}`],
  ['indented list code', `  - Item\n\n        ${marker}`],
  ['tab list fence', `-\t~~~\n\t${marker}\n\t~~~`],
  ['nested list indented code', `- Outer\n  - Inner\n\n        ${marker}`],
  ['inline code', `Use \`${marker}\` here.`],
  ['double backtick code', `Use \`\`${marker}\`\` here.`],
  ['different inner backticks', `Use \`\`x \` ${marker} \` x\`\` here.`],
  ['multiline inline code', `Use \`example\n${marker}\nend\` here.`],
  ['multiline quoted inline code', `> Use \`example\n> ${marker}\n> end\` here.`],
  ['lazy quote continuation', `> Use \`example\n${marker}\nend\` here.`],
  ['lazy list continuation', `- Use \`example\n${marker}\nend\` here.`],
  ['numbered text cannot interrupt paragraph', `Use \`example\n2. ${marker}\nend\``],
  ['numbered text cannot interrupt quoted paragraph', `> Use \`example\n2. ${marker}\nend\``],
  [
    'non-one nested marker cannot interrupt paragraph',
    `1. Use \`example\n   2. ${marker}\n   end\``
  ],
  ['empty bullet cannot interrupt paragraph', `Use \`example\n*\n${marker}\nend\``],
  ['empty numbered item cannot interrupt paragraph', `Use \`example\n1.  \n${marker}\nend\``],
  ['NBSP is not a blank line', `Use \`example\n\u00a0\n${marker}\nend\``],
  ['NBSP cannot end a fence', `~~~\n~~~\u00a0\n${marker}\n~~~`],
  ['escaped opening bracket', `!\\[Screenshot](aiob-attachment:a)`],
  ['escaped closing bracket', `![Screenshot\\](aiob-attachment:a)`],
  ['escaped opening parenthesis', `![Screenshot]\\(aiob-attachment:a)`],
  ['escaped closing parenthesis', `![Screenshot](aiob-attachment:a\\)`],
  ['odd bracket escape', `!\\\\\\[Screenshot](aiob-attachment:a)`],
  ['even backtick escape', `Use \\\\\`${marker}\` here.`],
  ['escaped backtick in a longer run', `Use \\\`\`${marker}\``],
  ['orphan closing bracket', 'Screenshot](aiob-attachment:a)'],
  ['HTML pre block', `<pre>\n${marker}\n</pre>`],
  ['HTML code block', `<code>\n${marker}\n</code>`],
  ['quoted HTML block attribute', `<span title=">">\n${marker}\n</span>`],
  ['single-quoted HTML block attribute', `<span title='<>'>\n${marker}\n</span>`],
  ['valid HTML attribute names', `<span :x='a' _x=ok a.b-c_2>\n${marker}\n</span>`],
  ['inline HTML attribute', `Text <span title="${marker}">text</span>`],
  ['single-quoted inline HTML attribute', `Text <span title='${marker}'>text</span>`],
  ['inline HTML comment', `Text <!-- ${marker} --> text`],
  ['inline HTML processing instruction', `Text <?test ${marker} ?> text`],
  ['inline HTML declaration', `Text <!TEST ${marker}> text`],
  ['inline HTML CDATA', `Text <![CDATA[${marker}]]> text`],
  ['HTML comment', `<!--\n${marker}\n-->`]
];

describe('literal attachment examples', () => {
  it.each(literalExamples)(
    'preserves %s with or without a matching attachment',
    (_name, markdown) => {
      expect(hasUnresolvedClipAttachmentReferences(markdown, [])).toBe(false);
      expect(hasUnresolvedClipAttachmentReferences(markdown, [reference])).toBe(false);
      expect(replaceClipAttachmentReferences(markdown, [reference])).toBe(markdown);
    }
  );
});

const liveExamples: [string, string][] = [
  ['ordinary image', marker],
  ['ordinary link', '[Screenshot](aiob-attachment:a)'],
  ['paragraph indentation', `Intro\n    ${marker}`],
  ['list continuation', `- Intro\n    ${marker}`],
  ['list paragraph after blank', `- Intro\n\n    ${marker}`],
  ['indented list paragraph', `  - Intro\n\n      ${marker}`],
  ['ordered list continuation', `10) Intro\n\n    ${marker}`],
  ['unclosed inline code', `Use \`${marker}`],
  ['unequal inline delimiter', `Use \`\`${marker}\``],
  ['blank breaks inline code', `Use \`example\n\n${marker}\nend\``],
  ['list item breaks inline code', `- \`example\n- ${marker}\``],
  ['ordered items break inline code', `1. \`example\n2. ${marker}\n3. end\``],
  ['parenthesized items break inline code', `9) \`example\n10) ${marker}\n11) end\``],
  ['quoted ordered items break inline code', `> 1. \`example\n> 2. ${marker}\n> 3. end\``],
  ['nested ordered items break inline code', `- 1. \`example\n  2. ${marker}\n  3. end\``],
  ['outer item ends nested inline code', `1. - \`example\n2. ${marker}\n3. end\``],
  ['empty ordered item breaks inline code', `1. \`example\n2.\n3. ${marker}\n   end\``],
  ['empty bullet item breaks inline code', `- \`example\n-\n  ${marker}\n  end\``],
  ['quote boundary breaks inline code', `> \`example\n\n${marker}\``],
  ['escaped backtick', `Use \\\`${marker}\``],
  ['even bracket escape', `!\\\\[Screenshot](aiob-attachment:a)`],
  ['even closing bracket escape', `![Screenshot\\\\](aiob-attachment:a)`],
  ['escaped image bang leaves a link', `\\${marker}`],
  ['nested label brackets', '[Screenshot [nested]](aiob-attachment:a)'],
  ['code inside label', '[Screenshot `[]`](aiob-attachment:a)'],
  ['inline HTML code retains Markdown', `Text <code>${marker}</code>`],
  ['invalid HTML attribute name', `<span bad!>\n${marker}`],
  ['invalid HTML attribute value', `<span x=bad=value>\n${marker}`],
  ['incomplete HTML tag', `<span title='broken>\n${marker}`],
  ['incomplete inline comment', `Text <!-- ${marker}`],
  ['closing HTML tag cannot have attributes', `</span title='x'>\n${marker}`],
  ['type-7 HTML cannot interrupt paragraph', `Intro\n<span title=">">\n${marker}`],
  ['blank line ends a type-7 HTML block', `<span title=">">\n\n${marker}`],
  ['raw HTML ends at any raw closing tag', `<pre>\n</style>\n${marker}`],
  ['self-closing pre cannot start type-7 block', `<pre/>\n${marker}`],
  ['quote fence ends at container', `> ~~~\n> code\n${marker}`],
  ['list fence ends at container', `- ~~~\n  code\n${marker}`],
  ['closed fence followed by reference', `~~~\ncode\n~~~\n${marker}`],
  ['backtick info invalidates fence', `\`\`\` bad\`info\n${marker}`],
  ['tilde info allows backticks', `~~~ bad\`info\ncode\n~~~\n${marker}`],
  ['backslash inside code cannot escape closer', `\`example\\\` ${marker} \``]
];

describe('live attachment destinations', () => {
  it.each(liveExamples)('resolves %s and still rejects missing bytes', (_name, markdown) => {
    expect(hasUnresolvedClipAttachmentReferences(markdown, [])).toBe(true);
    expect(hasUnresolvedClipAttachmentReferences(markdown, [reference])).toBe(false);
    expect(replaceClipAttachmentReferences(markdown, [reference])).toBe(
      markdown.replace('aiob-attachment:a', reference.markdownUrl)
    );
  });

  it('changes only live destinations next to identical literal examples', () => {
    const markdown = `\`${marker}\` ${marker}\n\n~~~\n${marker}\n~~~\n\n${marker}`;
    expect(replaceClipAttachmentReferences(markdown, [reference])).toBe(
      `\`${marker}\` ${rendered}\n\n~~~\n${marker}\n~~~\n\n${rendered}`
    );
    expect(hasUnresolvedClipAttachmentReferences(markdown, [])).toBe(true);
  });

  it('treats an even destination backslash run as escaped backslashes, not an escaped closer', () => {
    expect(
      hasUnresolvedClipAttachmentReferences('![Missing](aiob-attachment:missing\\\\)', [])
    ).toBe(true);
  });

  it('uses the complete ID map before matching prefixes and Markdown punctuation', () => {
    const ids = ['a', 'ab', 'a)b', 'a.*$[x] 中文'];
    const attachments = ids.map((id, index) => ({ id, markdownUrl: `assets/${index}.jpg` }));
    const markdown = ids.map((id) => `![${id}](aiob-attachment:${id})`).join('\n');
    const literal = `\`\`${markdown}\`\``;
    expect(hasUnresolvedClipAttachmentReferences(markdown, attachments)).toBe(false);
    expect(replaceClipAttachmentReferences(`${literal}\n\n${markdown}`, attachments)).toBe(
      `${literal}\n\n${attachments.map(({ id, markdownUrl }) => `![${id}](${markdownUrl})`).join('\n')}`
    );
    expect(hasUnresolvedClipAttachmentReferences('![ab](aiob-attachment:ab)', [reference])).toBe(
      true
    );
  });

  it('preserves CRLF and handles long documents with many unmatched delimiter lengths', () => {
    const lines = Array.from(
      { length: 150 },
      (_, index) => `text ${'`'.repeat(index + 1)} ${marker}`
    );
    const markdown = `${lines.join('\r\n')}\r\n\r\n~~~\r\n${marker}\r\n~~~`;
    const expected = `${lines.map((line) => line.replace(marker, rendered)).join('\r\n')}\r\n\r\n~~~\r\n${marker}\r\n~~~`;
    expect(replaceClipAttachmentReferences(markdown, [reference])).toBe(expected);
  });

  it('keeps unmatched HTML searches inside each paragraph and handles nested list prefixes', () => {
    const paragraphs = Array.from(
      { length: 300 },
      (_, index) => `Text ${index % 2 ? '<!--' : '<span title="'} ${marker}`
    );
    const nested = `${'- '.repeat(200)}${marker}`;
    expect(replaceClipAttachmentReferences([...paragraphs, nested].join('\n\n'), [reference])).toBe(
      [...paragraphs, nested].map((paragraph) => paragraph.replace(marker, rendered)).join('\n\n')
    );
  });
});
